"""
Build a creature preset list from the Savage Free Bestiary.

    https://docs.google.com/document/d/1qu4zzMYbPqOquVlCfgpPeoCmCEqGUgWh5dz-rpKJ1ck/

A free, fan-made collection for Savage Worlds. What is kept is the **stat block** —
attributes, skills, derived stats and the mechanical special abilities — plus
the short introductory line each entry carries, which is what makes a creature
recognisable at the table.

Each creature is stored as its raw block text rather than as a parsed sheet, so
the extension reads it with the same `parseStatBlock` used for anything a GM
pastes by hand — one parser, one set of tests. The short introductory line each
entry carries is kept as a description, with the source credited in the file.

    python3 scripts/extract-bestiary.py path/to/bestiary.txt
"""
import json, re, sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'src' / 'rules' / 'bestiary.json'
SOURCE = 'Savage Free Bestiary (fan-made, freely distributed)'

# Section markers in the document, e.g. "✦ Animals ✦".
SECTION = re.compile(r'^[✦★]\s*(.+?)\s*[✦★]$')
FIELD = re.compile(r'^(Attributes|Skills|Pace|Charisma|Special Abilities|Gear|Edges|Hindrances|Treasure)\s*:', re.I)


def parse(text: str) -> list[dict]:
    lines = [line.rstrip() for line in text.splitlines()]
    creatures: list[dict] = []
    section = ''

    for i, line in enumerate(lines):
        heading = SECTION.match(line.strip())
        if heading:
            section = heading.group(1).strip()
            continue

        if not line.strip().lower().startswith('attributes:'):
            continue

        # The name is the nearest preceding non-empty line that is not itself a
        # stat line or a flavour sentence. Flavour runs to a full stop; names
        # do not.
        name = ''
        name_at = i
        for back in range(i - 1, max(-1, i - 6), -1):
            candidate = lines[back].strip()
            if not candidate or FIELD.match(candidate):
                continue
            if candidate.endswith(('.', '!', '?')) or len(candidate) > 60:
                continue
            name = candidate
            name_at = back
            break
        if not name:
            continue

        # The block runs until a line that is neither a stat field nor an
        # indented ability, i.e. the next creature's name or flavour.
        body = [f'{name}']
        for forward in range(i, len(lines)):
            current = lines[forward]
            stripped = current.strip()
            if forward > i and not stripped:
                continue
            if forward > i and not FIELD.match(stripped) and not body_continues(body, stripped):
                break
            body.append(stripped)

        block = '\n'.join(body).strip()
        if 'Attributes:' not in block:
            continue

        clean_name = re.sub(r'^[^\w]+', '', name).strip()
        # "Ancient ___" and friends are fill-in-the-blank templates, not
        # creatures, and carry no stats of their own.
        if '___' in clean_name:
            continue

        # The entry's own introduction sits between the name and the stats.
        description = ' '.join(
            lines[j].strip() for j in range(name_at + 1, i) if lines[j].strip()
        ).strip()

        creatures.append({
            'name': clean_name,
            'category': section or 'Bestiary',
            **({'description': description} if description else {}),
            'block': block,
        })

    # The document repeats a few creatures across sections.
    seen: set[str] = set()
    unique = []
    for creature in creatures:
        key = creature['name'].lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(creature)
    return unique


def body_continues(body: list[str], line: str) -> bool:
    """True while we are still inside the Special Abilities list."""
    if not any(l.lower().startswith('special abilities') for l in body):
        return False
    # Abilities are "Name: text" or a bare note such as "Size +1".
    return bool(re.match(r'^[•\-\*\s]*[A-Z][^:]{0,40}:', line) or re.match(r'^[•\-\*\s]*Size\b', line))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('usage: extract-bestiary.py <bestiary.txt>')
    creatures = parse(Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace'))
    OUT.write_text(json.dumps({'source': SOURCE, 'creatures': creatures}, indent=1,
                              ensure_ascii=False) + '\n')
    print(f'{len(creatures)} creatures -> {OUT}')
