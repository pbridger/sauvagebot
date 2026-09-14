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


# ---------------------------------------------------------------------------
# The common gear chapter
# ---------------------------------------------------------------------------
#
# Everything above reads the weapon tables, which span the full page width. The
# *goods* tables do not: they sit in the book's ordinary two-column body, so the
# full-width read interleaves the two columns into nonsense — "Ax, wood $2 5
# Spectacles $5 —" on one line. They need the column crop `extract-catalogue.py`
# uses, which is the opposite trick for the opposite layout, and so they get their
# own pass rather than another entry in HEADERS.
#
# The one exception is AMMUNITION, which *is* full width and is sliced in half by
# the column crop. It is read from the whole-page text with the same row parser.

# Column crop boxes, in points, for a 477x729 page. Same values as
# `extract-catalogue.py`, and for the same reasons — see the note there before
# changing either edge.
COLUMNS = ((28, 205), (236, 208))

# Only rows under one of these headings are taken. The book is full of two-column
# prose that would otherwise offer up the occasional line ending in a number, and
# a catalogue with invented entries is worse than a short one.
COMMON_SECTIONS = {
    'CLOTHES', 'FOOD & DRINK', 'GENERAL EQUIPMENT', 'FUNDAMENTS',
    'GUN ACCESSORIES', 'HATS', 'SERVICES', 'TRANSPORTATION', 'AMMUNITION',
}
# Printed as `LIQUOR (TRIPLE OR MORE FOR THE " GOOD STUFF")`, which no sane
# heading pattern is going to match.
COMMON_PREFIXES = ('LIQUOR',)

# Prices come in dollars and cents, and ammunition is priced by the box: `$2/20`
# is two dollars for twenty rounds. Weight is the untidy one — a dash for
# negligible, `5/50 ft.` per fifty feet, `5 (full)/1` for a canteen full and
# empty, `1 oz` for ore.
COST = r'(?:\$\.?[\d.,]+(?:/\d+)?|\d+¢(?:/\d+)?)'
WEIGHT = (
    r'(?:[—–]|\d+ \(full\)/[\d.]+|[\d.]+/[\d.]+(?: ft\.)?'
    r'|[\d.]+ ?(?:oz\.?|lbs?\.?)|[\d.]+)'
)
ROW = re.compile(rf'^(?P<name>\S.*?)\s\s+(?P<cost>{COST})\s+(?P<weight>{WEIGHT})(?:\s+(?P<notes>\S.*))?$')

# Mechanics the book states in a note. Lifting them into their own fields is what
# makes a poncho different from a hat: `armor` already exists and is what the
# sheet reads.
# How much of a line can still be part of a name that wrapped. See `parse_common`.
NAME_TAIL = 40

ARMOR_NOTE = re.compile(r'\bArmor \+(\d+)')
MIN_STR_NOTE = re.compile(r'\bMin\.? Str\.? (d\d+)')


def column_text(first: int, last: int) -> str:
    """Both columns of a range of pages, each read whole, in reading order."""
    return '\n'.join(
        subprocess.run(
            ['pdftotext', '-f', str(page), '-l', str(page), '-layout',
             '-x', str(x), '-y', '30', '-W', str(w), '-H', '710', str(PDF), '-'],
            capture_output=True, text=True).stdout
        for page in range(first, last + 1)
        for x, w in COLUMNS
    )


def chapter(first_heading: str, last_heading: str) -> tuple[int, int]:
    """The page range a run of tables occupies, found by its own headings.

    By heading rather than by page number, because a page number is a fact about
    one copy of one PDF and the heading is a fact about the book. Scoping matters
    more here than it looks: the book prints a **second** `CLOTHES` table in the
    Smith & Robards catalogue, and an unscoped pass files six-hundred-dollar
    owl-eye goggles beside two-dollar longjohns.
    """
    pages = subprocess.run(
        ['pdftotext', '-layout', str(PDF), '-'], capture_output=True, text=True
    ).stdout.split('\f')
    first = next(i for i, page in enumerate(pages, 1) if first_heading in page)
    last = next(
        i for i, page in enumerate(pages, 1) if i >= first and last_heading in page
    )
    return first, last


def page_count() -> int:
    info = subprocess.run(['pdfinfo', str(PDF)], capture_output=True, text=True).stdout
    return int(info.split('Pages:')[1].split()[0])


def in_common_section(line: str) -> bool:
    return line in COMMON_SECTIONS or line.startswith(COMMON_PREFIXES)


def parse_common(text: str, only: set[str]) -> list[dict]:
    """Rows of `Item — Cost — Weight` from the goods tables.

    `only` is the set of headings whose rows are wanted, because the same parser
    is run twice over two different readings of the book: the goods tables from
    the column crop, AMMUNITION from the full-width text. Without it each pass
    would also pick up a mangled version of the other's tables.

    Four shapes of line that are not rows, and each has to be told from the other
    three rather than merely from a row. All four were found the hard way, by
    reading what the first version produced:

      - a **group**, like `Doctor visit` above its indented Office and House
        call. The rows under it are named for the service, not for the visit, so
        the group rides along — but only while the rows are *more indented than
        it is*. The first version let a group run until the next one, and
        produced forty items called "Restaurant, good — something".
      - a **wrapped note**, which is most of them. A note runs to several lines
        and only the first says `Notes:`, so the rest have to be recognised by
        what came before them rather than by what they look like.
      - a **wrapped name**: ghost rock ore's `most commonly sold at`.
      - **prose and page furniture**, which the column crop puts right alongside
        the tables.
    """
    items: list[dict] = []
    section = ''
    group = ''
    group_indent = 0
    in_notes = False
    # Whether the line just read could still be the tail of the name above it.
    # Closed by anything that is not one, which is what stops a paragraph being
    # absorbed a line at a time — see the note below.
    tail_open = False

    for raw in text.splitlines():
        # Two readings of the same line. `spaced` keeps the runs of whitespace
        # that separate the columns, which is the only thing telling a name from
        # a price; `stripped` collapses them, which is what heading matching
        # wants. Collapsing first and then looking for column gaps was the first
        # version, and it found none.
        spaced = raw.strip()
        stripped = re.sub(r'\s+', ' ', spaced)
        if not stripped:
            continue
        indent = len(raw) - len(raw.lstrip())

        if in_common_section(stripped):
            section = stripped.split(' (')[0].title() if stripped in only else ''
            group, in_notes, tail_open = '', False, False
            continue
        # Any other all-caps heading ends the table above it.
        if SECTION.match(stripped) and 'Notes' not in stripped:
            section, group, in_notes, tail_open = '', '', False, False
            continue
        if not section:
            continue
        # The column header, and the page numbers the crop sweeps up with it.
        if stripped.lower().startswith(('item ', 'type ')) or stripped.isdigit():
            continue

        if stripped.startswith('Notes:'):
            if items:
                items[-1]['notes'] = note_on(items[-1], stripped[len('Notes:'):])
                in_notes = True
            tail_open = False
            continue

        row = ROW.match(spaced)
        if row:
            # The book pads cells to align them — "Restaurant,        cheap".
            name = re.sub(r'\s+', ' ', row.group('name')).strip()
            if group and indent <= group_indent:
                group = ''
            item = {
                'name': f'{group} — {name}' if group else name,
                'category': section,
                'cost': row.group('cost'),
            }
            weight = row.group('weight')
            if weight not in DASHES:
                item['weight'] = weight
            notes = (row.group('notes') or '').strip()
            if notes:
                item['notes'] = notes
            items.append(item)
            in_notes, tail_open = False, True
            continue

        # Not a row. In order of how confident we can be about it.
        if in_notes and items:
            items[-1]['notes'] = note_on(items[-1], stripped)
            tail_open = False
        elif (
            stripped[0].isupper()
            and len(stripped) <= 28
            and ':' not in stripped
            and not stripped.endswith('.')
        ):
            # A heading for the rows beneath it. Ends with a full stop? Then it is
            # the tail of a sentence — `Fatigue.` closing the note on chaps — and
            # the first version made a group out of exactly that.
            group, group_indent, tail_open = stripped, indent, False
        elif tail_open and items and len(stripped) <= NAME_TAIL and ':' not in stripped:
            # The tail of a name that wrapped — `most commonly sold at` under
            # ghost rock ore, `meals)` under a boarding house.
            #
            # Bounded, because the alternative is prose. The paragraph about
            # rattler hide sits directly under the last row of the clothes table
            # and, unbounded, this line glued all five lines of it onto the name
            # of a winter coat. A wrapped cell is a few words; a paragraph is not.
            #
            # And it must run *unbroken* from the row. Length alone was not
            # enough: two lines in the middle of that same paragraph are short
            # enough to pass, and a name made of lines 3 and 5 of a paragraph is
            # worse than one made of all five, because it looks deliberate. The
            # first line of prose is what fails the test, and failing it closes
            # the door behind it.
            items[-1]['name'] = f"{items[-1]['name']} {stripped}".strip()
        else:
            tail_open = False

    for item in items:
        armor = ARMOR_NOTE.search(item.get('notes', ''))
        if armor:
            item['armor'] = armor.group(1)
        min_str = MIN_STR_NOTE.search(item.get('notes', ''))
        if min_str:
            item['minStr'] = min_str.group(1)
    return items


def note_on(item: dict, more: str) -> str:
    return f"{item.get('notes', '')} {more.strip()}".strip()


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

    return fold_modes(items)


# The category a duplicated weapon appears under a second time, and what that
# second appearance *is*. The book files a tomahawk twice — once under Melee
# Weapons with its Reach and Parry, once under Other Ranged Weapons with a range
# of 3/6/12 — because the two tables are organised by how you attack, not by what
# is in your hand. There is one tomahawk in the saddlebag.
SECOND_TABLE = {'Other Ranged Weapons': 'Thrown'}


def fold_modes(items: list[dict]) -> list[dict]:
    """Join a weapon that appears in two tables into one entry with two modes.

    The extractor reads tables, and the book's tables are a view of the gear
    rather than a list of it. Left as rows, the thrown entry is unreachable —
    `findGear` indexes by name and keeps the first — so a thrown knife could not
    be looked up at all, and nothing knew it was the same knife.

    `modes` is not new here: the LeMat's underslung shotgun barrel already uses
    it, and it means the same thing in both places. One object, more than one way
    to attack with it.
    """
    def key(name: str) -> str:
        return re.sub(r'[^A-Z0-9]+', ' ', re.sub(r'\([^)]*\)', '', name.upper())).strip()

    def rotations(name: str):
        """Every rotation of the words, because the two tables disagree on order.

        The melee table files by family so the entries sort together — "Club,
        War" — and the thrown table writes it the way a person says it, "War
        Club". `findGear` already reconciles the two this way for the names on a
        character's card; the same weapon in two of the book's own tables needs
        it for the same reason.
        """
        words = key(name).split(' ')
        return [' '.join(words[i:] + words[:i]) for i in range(len(words))]

    first: dict[str, dict] = {}
    out: list[dict] = []
    for item in items:
        label = SECOND_TABLE.get(item['category'])
        primary = next((first[k] for k in rotations(item['name']) if k in first), None)
        if label and primary is not None:
            # The mode carries what differs — its range, and anything the second
            # table says that the first did not. The name is what it *is*, so the
            # button on the sheet can be labelled from it.
            mode = {**item, 'name': label}
            primary.setdefault('modes', []).append(mode)
            continue
        first.setdefault(key(item['name']), item)
        out.append(item)
    return out


if __name__ == '__main__':
    if not PDF.exists():
        sys.exit(f'rulebook not found at {PDF}')
    # Weapons and armour from the full-width tables, goods from the two-column
    # body, and AMMUNITION from the full width again because it is the one goods
    # table printed across the page.
    whole = book_text()
    goods = COMMON_SECTIONS - {'AMMUNITION'}
    first, last = chapter('COMMON GEAR', 'TRANSPORTATION')
    gear = (
        parse(whole)
        + parse_common(column_text(first, last), goods)
        # AMMUNITION is the one goods table printed across the full page width,
        # so the column crop cuts it in half and it has to come from the other
        # reading. Its heading is distinctive enough not to need a page range.
        + parse_common(whole, {'AMMUNITION'})
    )
    OUT.write_text(json.dumps(
        {'source': 'Deadlands: The Weird West core rules (player extract)', 'items': gear},
        indent=1, ensure_ascii=False) + '\n')
    print(f'{len(gear)} items -> {OUT}')
