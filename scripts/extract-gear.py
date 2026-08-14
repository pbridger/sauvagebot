"""
Pull the equipment tables out of the rulebook.

Unlike the Edges, these tables span the *full* page width, so the two-column
crop `extract-catalogue.py` needs would slice them in half. This reads the page
whole instead — the opposite trick for the opposite layout.

Rows are sliced by **column position**, not by splitting on whitespace. Splitting
from the right works for the ranged tables, whose notes sit on their own line,
and quietly mangles the melee and armour tables, whose Notes column is part of
the row and wraps onto continuation lines. `pdftotext -layout` preserves the
header's alignment, so the header tells us where every column begins and each
row can be cut at exactly those offsets — which handles all six table shapes and
the wrapped notes together.

    python3 scripts/extract-gear.py
"""
import json, re, subprocess, sys
from pathlib import Path

PDF = Path(__file__).resolve().parents[2] / 'import' / 'DLWW_Core_player_extract.pdf'
OUT = Path(__file__).resolve().parents[1] / 'src' / 'rules' / 'gear-catalogue.json'

# Column heading -> the key it becomes. Headings vary in spelling between tables.
# Header text -> the fields that follow the name, in order.
HEADERS = {
    'Type Range Damage AP RoF Shots Min Str. Weight Cost':
        ['range', 'damage', 'ap', 'rof', 'shots', 'minStr', 'weight', 'cost'],
    'Type Range Damage AP RoF Shots Min. Str Wt Cost':
        ['range', 'damage', 'ap', 'rof', 'shots', 'minStr', 'weight', 'cost'],
    'Type Damage Min. Str Weight Cost Notes':
        ['damage', 'minStr', 'weight', 'cost'],
    'Type Armor Min. Str Weight Cost Notes':
        ['armor', 'minStr', 'weight', 'cost'],
    'Type Range Damage Wt Notes': ['range', 'damage', 'weight'],
    'Type Cost Weight Notes': ['cost', 'weight'],
}

DASHES = {'—', '–', '-', '‒', '―'}
SECTION = re.compile(r'^[A-Z][A-Z0-9 ,&’\'\-/\.]{3,44}$')

# What each field looks like. Matching by shape rather than by position is what
# makes one parser cope with both table styles: the ranged tables put their
# notes on a following line, while the melee and armour tables carry a Notes
# column inline that wraps — so neither counting from the left nor from the
# right is right for both, but "a calibre looks like 12/24/48" always is.
FIELD = {
    'range': re.compile(r'^\d+/\d+/\d+$'),
    'damage': re.compile(r'^(?:Str\+)?\d*(?:[–-]\d+)?d\d+(?:[+–-]\d+)?$', re.I),
    'ap': re.compile(r'^\d+$'),
    'rof': re.compile(r'^\d+$'),
    'shots': re.compile(r'^\d+$'),
    'minStr': re.compile(r'^d\d+$'),
    'armor': re.compile(r'^[+–-]?\d+$'),
    'weight': re.compile(r'^\d+(?:\.\d+)?$'),
    'cost': re.compile(r'^\$[\d,]+$'),
}


def book_text() -> str:
    return subprocess.run(['pdftotext', '-layout', str(PDF), '-'],
                          capture_output=True, text=True).stdout


def match_fields(tokens: list[str], fields: list[str]) -> tuple[int, dict[str, str]] | None:
    """Find where the data columns start, and read them off."""
    for start in range(1, len(tokens) - len(fields) + 1):
        values: dict[str, str] = {}
        ok = True
        for offset, key in enumerate(fields):
            token = tokens[start + offset]
            if token in DASHES:
                continue
            if not FIELD[key].match(token):
                ok = False
                break
            values[key] = token
        # A row must be mostly populated, or a stray number in prose matches.
        if ok and len(values) >= max(2, len(fields) - 3):
            return start, values
    return None


def parse(text: str) -> list[dict]:
    items: list[dict] = []
    fields: list[str] | None = None
    section = ''

    for raw in text.splitlines():
        line = re.sub(r'\s+', ' ', raw).strip()
        if not line:
            continue

        header = HEADERS.get(line)
        if header:
            fields = header
            continue

        if SECTION.match(line) and 'Notes' not in line:
            section = line.title()
            # A heading ends the table above it; every sub-table reprints its
            # own header row, so forgetting the columns here is safe.
            fields = None
            continue

        if not fields:
            continue

        if line.startswith('Notes:'):
            if items:
                note = line[len('Notes:'):].strip()
                items[-1]['notes'] = f"{items[-1].get('notes', '')} {note}".strip()
            continue

        tokens = line.split(' ')
        found = match_fields(tokens, fields)
        if not found:
            continue
        start, values = found

        name = ' '.join(tokens[:start]).strip()
        notes = ' '.join(tokens[start + len(fields):]).strip()
        if not name or name.lower().startswith('type'):
            continue

        item = {'name': name, 'category': section, **values}
        if notes and notes not in DASHES:
            item['notes'] = notes
        # "& Shotgun (20-ga)" is a second mode of the weapon above it.
        if name.startswith('&') and items:
            items[-1].setdefault('modes', []).append({**item, 'name': name.lstrip('& ').strip()})
            continue
        items.append(item)

    return items


if __name__ == '__main__':
    if not PDF.exists():
        sys.exit(f'rulebook not found at {PDF}')
    gear = parse(book_text())
    OUT.write_text(json.dumps(
        {'source': 'Deadlands: The Weird West core rules (player extract)', 'items': gear},
        indent=1, ensure_ascii=False) + '\n')
    print(f'{len(gear)} items -> {OUT}')
