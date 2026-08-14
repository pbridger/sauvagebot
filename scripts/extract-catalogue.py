"""
Build a structured catalogue of Edges and Hindrances from the rulebook.

The PDF is two-column, and `pdftotext` reading it whole interleaves the columns
into nonsense. Each column is extracted separately with a crop box and then
concatenated, which restores reading order — that is the whole trick.

Run from the repo root with the PDF at ../import/:
    python3 scripts/extract-catalogue.py
"""
import json, re, subprocess, sys
from pathlib import Path

PDF = Path(__file__).resolve().parents[2] / 'import' / 'DLWW_Core_player_extract.pdf'
OUT = Path(__file__).resolve().parents[1] / 'src' / 'rules' / 'catalogue.json'

# Column crop boxes, in points, for a 477x729 page.
#
# Both edges matter more than they look. At x=40 the left crop clipped the first
# character of any line starting a shade left of the body indent, giving "otals"
# for "totals" and "nch" for "inch". At x=232 the right crop caught the *last*
# character of the left column, turning a heading into "e    LEVEL HEADED" and
# losing that entry entirely. These values clear both.
COLUMNS = ((28, 205), (236, 208))


def page_count() -> int:
    info = subprocess.run(['pdfinfo', str(PDF)], capture_output=True, text=True).stdout
    return int(info.split('Pages:')[1].split()[0])


def column_text(page: int, x: int, w: int) -> str:
    return subprocess.run(
        ['pdftotext', '-f', str(page), '-l', str(page), '-layout',
         '-x', str(x), '-y', '30', '-W', str(w), '-H', '710', str(PDF), '-'],
        capture_output=True, text=True).stdout


def book_text() -> str:
    return '\n'.join(
        column_text(p, x, w) for p in range(1, page_count() + 1) for x, w in COLUMNS)


# A heading is a short, all-caps line. Lower-case letters, sentence punctuation
# and long lines all disqualify it, which keeps prose in small caps from being
# mistaken for an entry.
HEADING = re.compile(r"^[A-Z][A-Z0-9 '’\-/&()\.,\+]{2,44}$")
# The book writes severity as "(MINOR)", "(MAJOR)" or "(MINOR OR MAJOR)" — the
# last of which an earlier pattern missed, losing Ailin' and Pacifist.
HINDRANCE = re.compile(
    r'^(.+?)\s*\((MINOR|MAJOR)(?:\s*(?:OR|/)\s*(?:MINOR|MAJOR))?\)\s*$')
NOISE = {
    'DEADLANDS', 'THE WEIRD WEST', 'REQUIREMENTS', 'CREDITS', 'CONTENTS',
    'DEADLANDS: THE WEIRD WEST', 'WWW.PEGINC.COM', 'SAVAGE WORLDS',
}


def clean(body: list[str]) -> str:
    text = ' '.join(line.strip() for line in body)
    text = re.sub(r'\s+', ' ', text)
    # Words broken across a line end, and stray page numbers left inline.
    text = re.sub(r'(\w)­ (\w)', r'\1\2', text)
    text = re.sub(r'\s+(\d{1,3})\s+(?=[A-Z])', ' ', text)
    return text.strip()


def parse(text: str) -> dict:
    lines = text.splitlines()
    edges, hindrances = {}, {}
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not HEADING.match(line) or line in NOISE:
            i += 1
            continue

        # An Edge is a heading followed within a line or two by REQUIREMENTS.
        lookahead = ' '.join(l.strip() for l in lines[i + 1:i + 3])
        is_edge = lookahead.startswith('REQUIREMENTS:')
        hindrance = HINDRANCE.match(line)

        if not is_edge and not hindrance:
            i += 1
            continue

        name = (hindrance.group(1) if hindrance else line).strip()
        requirements = ''
        j = i + 1
        if is_edge:
            while j < len(lines) and not lines[j].strip().startswith('REQUIREMENTS:'):
                j += 1
            requirements = lines[j].strip()[len('REQUIREMENTS:'):].strip()
            j += 1
            # Requirements wrap: "Novice, Agility d8+," continues on the next
            # line, and without this the remainder ("Athletics d8+") was being
            # read as the first words of the rules text.
            while j < len(lines) and requirements.endswith(','):
                requirements = f'{requirements} {lines[j].strip()}'.strip()
                j += 1

        body = []
        while j < len(lines):
            nxt = lines[j].strip()
            if HEADING.match(nxt) and nxt not in NOISE and len(body) > 0:
                break
            body.append(nxt)
            j += 1

        entry = {'name': name, 'text': clean(body)}
        if not entry['text']:
            i = j
            continue
        if is_edge:
            entry['requirements'] = requirements
            edges.setdefault(name, entry)
        else:
            entry['severity'] = hindrance.group(0).split('(')[-1].rstrip(')').title()
            hindrances.setdefault(name, entry)
        i = j

    return {
        'source': 'Deadlands: The Weird West core rules (player extract)',
        'edges': sorted(edges.values(), key=lambda e: e['name']),
        'hindrances': sorted(hindrances.values(), key=lambda h: h['name']),
    }


if __name__ == '__main__':
    if not PDF.exists():
        sys.exit(f'rulebook not found at {PDF}')
    catalogue = parse(book_text())
    OUT.write_text(json.dumps(catalogue, indent=1, ensure_ascii=False) + '\n')
    print(f"{len(catalogue['edges'])} edges, {len(catalogue['hindrances'])} hindrances -> {OUT}")
