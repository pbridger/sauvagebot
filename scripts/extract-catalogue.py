"""
Build a structured catalogue of Edges and Hindrances from the rulebook.

Two passes over the same PDF, because the book presents the same material twice
in layouts that need opposite treatment.

**The entries.** Body pages are two-column, and `pdftotext` reading one whole
interleaves the columns into nonsense. Each column is extracted separately with a
crop box and then concatenated, which restores reading order.

**The summaries.** The book also prints its own one-line version of every entry,
in tables at the back — the designers' precis, leading with the mechanic. That is
what a character sheet wants; the full entry goes behind a control. Those tables
run the full page width, so the body's column crop would slice them in half
("+2 to Noti"), and they are read whole. The Edge table further defeats
line-based parsing outright, because a tall row centres its name vertically and
the summary straddles it — so it is parsed from word coordinates instead. See
`edge_summaries`.

Coverage is deliberately incomplete rather than approximate: an entry whose name
does not match one the body pass already found is dropped, not guessed at. 215 of
280 entries get a summary; the rest are setting-specific Edges the book documents
only in their own chapters, and the UI falls back to their full text.

Run from the repo root with the PDF at ../import/:
    python3 scripts/extract-catalogue.py
"""
import html, json, re, subprocess, sys
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


# A page footer, which `-layout` leaves on a line of its own at the foot of the
# column. The crop is narrower than the page, so a three-digit number is often
# clipped to its last digit or two — which is why this matches 1-3 digits rather
# than a plausible page range.
FOOTER = re.compile(r'^\s*\d{1,3}\s*$')


def clean(body: list[str]) -> str:
    # Footers are dropped *before* the join, while they are still identifiable by
    # being alone on their line.
    #
    # This replaced a substitution that ran after the join and deleted any 1-3
    # digit number followed by a capital letter. It was written to remove those
    # same footers and did, but it also silently ate numbers that were part of a
    # sentence: "5 Power Points" became "Power Points", and "a Grade 1 Agent"
    # became "a Grade Agent" three times over in AGENCY PROMOTION. Numbers are
    # the load-bearing part of a rules text, and that one dropped them wherever
    # the next word happened to be capitalised.
    text = ' '.join(line.strip() for line in body if not FOOTER.match(line))
    text = re.sub(r'\s+', ' ', text)
    # Soft hyphens mark where the typesetter broke a word across a line. Removing
    # the character rejoins the word — "hard\xadships" is "hardships". The old
    # pattern only matched one that had a space after it, so the ones inside a
    # line survived into the JSON as invisible junk.
    text = text.replace('­', '')
    return text.strip()


# ---------------------------------------------------------------- summaries
#
# The book prints its own one-line version of every Edge and Hindrance, and it is
# far better than anything this script could synthesise from the full entry: it is
# the designers' own precis, it leads with the mechanic, and it is what a player
# actually wants on a character sheet. The full text goes behind a control; this
# is what shows.
#
# These pages are laid out across the full page width, so the two-column crop used
# for the body would slice them in half — "+2 to Noti". They are read whole.
EDGE_SUMMARY_PAGES = range(107, 113)
HINDRANCE_SUMMARY_PAGES = range(104, 106)

# "Edge   Requirements   Summary". The columns start where those two words start,
# and the indent shifts from page to page, so it is read off each header rather
# than hard-coded.
TABLE_HEAD = re.compile(r'^\s*Edge\s+Requirements\s+Summary')
# How far left of its heading each column's content may start, in points.
NAME_GUTTER = 20
SUM_GUTTER = 6
# The table proper, horizontally. The book prints its running header as rotated
# text down *both* page edges — "DEADLANDS: THE WEIRD WEST" at x=8-25 on the left
# of a verso page, "Makin' Heroes" at x=451-468 on the right of a recto — and
# `-bbox` reports each word on whatever visual line it happens to sit beside. The
# left one landed in the name column and lost that row; the right one landed in
# the summary column and appended "Makin' Heroes" to the rules text. The table
# itself never passes x=437.
#
# Constants rather than the "Edge" heading's own position, because on page 107 the
# heading is indented to x=67 while its column of names begins at x=40.
PAGE_MARGIN = 25
PAGE_RIGHT = 445
# Vertical gap that separates one table row from the next. The book leads summary
# lines about 10pt apart within a row and about 14.5pt apart between rows.
ROW_GAP = 12
# "Ugly (Minor/Major): The character is physically unattractive…"
# The same rotated running header, as `-layout` renders it: alone on a line. The
# coordinate-based Edge parser excludes it by position; this one reads text, so it
# has to recognise it. Without this, Obligation's summary ended "…hours. Makin'
# Heroes".
RUNNING_HEAD = re.compile(r"^(Makin' Heroes|DEADLANDS: THE WEIRD WEST)$")
HINDRANCE_LINE = re.compile(
    r"^(?P<name>[A-Z][A-Za-z’'\- ]*?)\s*\((?P<sev>Minor|Major|Minor/Major)\):\s*(?P<text>.*)$")


def full_page(page: int) -> str:
    return subprocess.run(
        ['pdftotext', '-f', str(page), '-l', str(page), '-layout', str(PDF), '-'],
        capture_output=True, text=True).stdout


def tidy(text: str) -> str:
    return re.sub(r'\s+', ' ', text).replace('­', '').strip()


WORD = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')


def page_words(page: int) -> list[tuple[float, float, float, str]]:
    """Every word on the page as (xMin, xMax, yCentre, text), reading order."""
    xml = subprocess.run(
        ['pdftotext', '-f', str(page), '-l', str(page), '-bbox-layout', str(PDF), '-'],
        capture_output=True, text=True).stdout
    out = []
    for x0, y0, x1, y1, text in WORD.findall(xml):
        if text.strip():
            out.append((float(x0), float(x1), (float(y0) + float(y1)) / 2,
                        html.unescape(text)))
    return out


def edge_summaries(known: set[str]) -> dict[str, str]:
    """
    Read the Edge summary table.

    Done on word coordinates rather than on `-layout` text, because the table
    defeats line-based parsing outright. A tall row centres its name vertically,
    so the summary straddles it:

        |                          Character may spend Bennies to Soak damage for
        | Ace          N, A d8
        |                          their vehicle and ignores up to 2 points…

    Read as lines, "Ace" owns only the blank between its two summary lines, and
    six of the party's own edges came out bare — Investigator, Level-Headed, Holy
    Warrior, Agency Promotion, Rock and Roll!, Strong Willed. With coordinates the
    row is recoverable: names and summary fragments are matched by how close they
    sit vertically, which is the same cue the eye uses.

    Names still wrap ("Arcane" / "Background"), so fragments are glued while the
    result keeps spelling something the body extraction defined. Anything that
    matches no known entry is dropped rather than guessed at.
    """
    found: dict[str, str] = {}
    carried: tuple[float, float] | None = None

    for page in EDGE_SUMMARY_PAGES:
        words = page_words(page)

        # Each table on the page announces itself with its own header row, and a
        # page can carry two. The header also fixes the column positions, which
        # shift between tables.
        heads = []
        for x0, x1, y, text in words:
            if text == 'Edge':
                row = [w for w in words if abs(w[2] - y) < 4]
                cols = {w[3]: w[0] for w in row}
                if 'Requirements' in cols and 'Summary' in cols:
                    heads.append((y, x0, cols['Requirements'], cols['Summary']))
        heads.sort()

        # A table running over a page break does not repeat its header, and the
        # rows above the *next* table's header belong to it. Page 109 has no
        # header at all and page 112 opens mid-table, so requiring one skipped
        # both — which is where Level Headed, Rock and Roll! and Strong Willed
        # were going. Carry the last known columns onto whatever precedes.
        if carried and (not heads or heads[0][0] > 80):
            heads.insert(0, (0.0, *carried))
        if not heads:
            continue
        carried = (heads[-1][1], heads[-1][2], heads[-1][3])

        for i, (top, _edge_x, req_x, sum_x) in enumerate(heads):
            bottom = heads[i + 1][0] if i + 1 < len(heads) else 1e9
            # Anything outside the table's own left margin is the running header
            # printed down the edge of the page. It sits at x=8 where the table
            # starts at x=40, and being on the same line as a row it was landing
            # in the name column — "DEADLANDS: Calculating" matches nothing, so
            # the row was dropped.
            body = [w for w in words
                    if top + 4 < w[2] < bottom
                    and PAGE_MARGIN <= w[0] and w[1] <= PAGE_RIGHT]

            # Group into visual lines, then split each by column.
            lines: dict[int, list] = {}
            for w in body:
                lines.setdefault(round(w[2] / 3), []).append(w)

            names: list[tuple[float, str]] = []
            bits: list[tuple[float, str]] = []
            for key in sorted(lines):
                row = sorted(lines[key])
                y = sum(w[2] for w in row) / len(row)
                # The Requirements column is centre-aligned, so its content
                # starts well left of where its heading does — "N, A d8," begins
                # 13pt left of the word "Requirements". Splitting on the heading
                # position pulled the first requirement into Acrobat's name and
                # lost the row. Both boundaries sit inside the gutter instead.
                left = ' '.join(w[3] for w in row if w[0] < req_x - NAME_GUTTER)
                right = ' '.join(w[3] for w in row if w[0] >= sum_x - SUM_GUTTER)
                # Section titles ("SOCIAL EDGES") and the running footer.
                if left and not left.isupper():
                    names.append((y, left))
                if right:
                    bits.append((y, right))

            # Glue a name that wrapped onto the next line back together.
            merged: list[tuple[float, str]] = []
            for y, text in names:
                if merged and normal(f'{merged[-1][1]} {text}') in known:
                    merged[-1] = (merged[-1][0], f'{merged[-1][1]} {text}')
                else:
                    merged.append((y, text))
            merged = [(y, t) for y, t in merged if normal(t) in known]
            if not merged:
                continue

            # Group the summary fragments into rows before matching them to a
            # name, using the fact that the table leads lines ~10pt apart inside a
            # row and ~14.5pt apart between rows.
            #
            # Matching each fragment to its nearest name instead — which is the
            # obvious thing, and is exactly right when every row is the same
            # height — put the boundary halfway between two name centres. Rows are
            # centred but not equally tall, so a tall row next to a short one has
            # its edge somewhere else entirely: Brute began with the tail of
            # Brawny's requirements, and Scout lost its own first line to the row
            # above. Blocks make the boundary the book's own line spacing.
            blocks: list[list[tuple[float, str]]] = []
            for y, text in sorted(bits):
                if blocks and y - blocks[-1][-1][0] <= ROW_GAP:
                    blocks[-1].append((y, text))
                else:
                    blocks.append([(y, text)])

            # A name belongs to the block its own line falls inside — the name is
            # centred in the row, so it is bracketed by its summary rather than
            # sitting above it.
            def distance(block: list[tuple[float, str]], y: float) -> float:
                top, bottom = block[0][0], block[-1][0]
                return 0.0 if top <= y <= bottom else min(abs(top - y), abs(bottom - y))

            for block in blocks:
                at = min(range(len(merged)), key=lambda k: distance(block, merged[k][0]))
                found.setdefault(normal(merged[at][1]), tidy(' '.join(t for _, t in block)))

    return found


def hindrance_summaries(known: set[str]) -> dict[str, str]:
    """
    Read the Hindrance summary, which is running prose rather than a table:
    "Ugly (Minor/Major): The character is physically unattractive…", wrapping onto
    following lines until the next name.
    """
    found: dict[str, str] = {}
    name, body = '', []

    def flush() -> None:
        if name and normal(name) in known and body:
            found.setdefault(normal(name), tidy(' '.join(body)))

    for page in HINDRANCE_SUMMARY_PAGES:
        for line in full_page(page).splitlines():
            if FOOTER.match(line) or not line.strip():
                continue
            if RUNNING_HEAD.match(line.strip()):
                continue
            start = HINDRANCE_LINE.match(line.strip())
            if start:
                flush()
                name, body = start.group('name'), [start.group('text')]
            elif name:
                body.append(line.strip())
        flush()
        name, body = '', []
    return found


def normal(name: str) -> str:
    """Match the catalogue's own loose comparison, so "Elan" finds "ELAN"."""
    return re.sub(r'[^A-Z0-9]+', ' ', name.upper()).strip()


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


def attach_summaries(catalogue: dict) -> tuple[int, int]:
    """Hang the book's one-liners on the entries they belong to."""
    edge_names = {normal(e['name']) for e in catalogue['edges']}
    hind_names = {normal(h['name']) for h in catalogue['hindrances']}
    edges, hinds = edge_summaries(edge_names), hindrance_summaries(hind_names)
    for entry in catalogue['edges']:
        if found := edges.get(normal(entry['name'])):
            entry['summary'] = found
    for entry in catalogue['hindrances']:
        if found := hinds.get(normal(entry['name'])):
            entry['summary'] = found
    return (sum('summary' in e for e in catalogue['edges']),
            sum('summary' in h for h in catalogue['hindrances']))


if __name__ == '__main__':
    if not PDF.exists():
        sys.exit(f'rulebook not found at {PDF}')
    catalogue = parse(book_text())
    got_e, got_h = attach_summaries(catalogue)
    OUT.write_text(json.dumps(catalogue, indent=1, ensure_ascii=False) + '\n')
    n_e, n_h = len(catalogue['edges']), len(catalogue['hindrances'])
    print(f'{n_e} edges, {n_h} hindrances -> {OUT}')
    print(f'summaries: {got_e}/{n_e} edges, {got_h}/{n_h} hindrances')
    for entry in catalogue['edges'] + catalogue['hindrances']:
        if 'summary' not in entry:
            print(f'  no summary: {entry["name"]}')
