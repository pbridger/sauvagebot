"""
The rulebook as reading-order text, for checking rules against.

    python3 scripts/extract-rules.py            # writes import/DLWW_Core_player_extract.txt
    python3 scripts/extract-rules.py --check    # and verifies the known-hard pages

## Why this exists

Every rule quoted in this codebase between August and October 2026 came from
`pdftotext` in its default mode, and that mode is **not** column order. Poppler
splits each column into several "flows" and interleaves them by height, so on a
two-column page it can emit a left-column paragraph, then three right-column
ones, then the rest of the left. On p150 that put Healing's *"A Critical Failure
increases the victim's Wound level by one"* between two paragraphs of Soak
Rolls, and the app shipped a Soak rule the book does not have. Elsewhere it
interleaved single *lines* from the two columns. Paul caught it from the printed
page on 2026-10-10. See MECHANICS-INVENTORY §28.

## How this does it instead

`pdftotext -bbox-layout` reports every text block with its box. Poppler's blocks
are reliable — it is only their *order* that is not — so this rebuilds the order
from geometry, the way the page is actually read:

1. **Furniture out.** The vertical running title in the outer margin, and the
   page number, which becomes the page marker instead.
2. **Columns.** The gutter sits at x≈238–244 on every page, odd and even. A block
   wholly left of it is left column, wholly right is right column, and one that
   crosses it is full-width: a table row, a banner, a page-wide box.
3. **Bands.** Full-width blocks cut the page into horizontal bands. Each band is
   read left column top to bottom, then right column, then the full-width block
   below it. A small cell that sits beside a full-width row (a table's first
   column) is read as part of that row, left to right.

Within a block, Poppler's line order is right, so a paragraph is always whole.
What could still be wrong is the order of whole blocks around a mid-page table,
which is why every block is its own paragraph here: a quote that fits inside one
is reliable regardless.

The book is not ours to publish, so the output goes to `import/`, next to the
PDF, and never into this repository.
"""
import html, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / 'import' / 'DLWW_Core_player_extract.pdf'
OUT = ROOT / 'import' / 'DLWW_Core_player_extract.txt'

GUTTER_LEFT = 238.0   # the right edge of left-column text never passes this…
GUTTER_RIGHT = 243.0  # …and right-column text never starts before this
SLACK = 4.0
MARGIN = 32.0         # the vertical running title lives within this of the edge
FOOTER = 680.0        # page numbers sit below this

BLOCK = re.compile(
    r'<block xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</block>', re.S
)
LINE = re.compile(r'<line [^>]*>(.*?)</line>', re.S)
WORD = re.compile(r'<word [^>]*>(.*?)</word>', re.S)
WORD_BOX = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', re.S
)
PROSE_GAP = 12.0      # the widest gap between two words of running text
LONG_LINE = 100.0     # a line of column text is at least this wide; a table cell is not
LONG_SHARE = 0.43     # share of long lines that marks text rather than a table
PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)


def join_lines(lines):
    """Lines of one block into one paragraph, mending words broken at line ends."""
    text = ''
    for line in lines:
        if not text:
            text = line
        elif text.endswith('\u00ad'):          # soft hyphen: one word, rejoin
            text = text[:-1] + line
        elif text.endswith('-') and line[:1].islower():
            text = text + line                # "Fleet-" + "footed": keep the hyphen
        else:
            text = text + ' ' + line
    # C1 control characters are the book's decorative glyphs (the bullet drawn
    # between a term and its definition comes through as \x84 or \x90). Left in,
    # they sit between "Hitting the head or" and "vital organs…" and break the
    # sentence for anything that searches it.
    return re.sub(r'[\x80-\x9f]', '', text.replace('\u00ad', '')).strip()


def words_of(line):
    return [
        (float(a), float(b), float(c), float(d), html.unescape(t))
        for a, b, c, d, t in WORD_BOX.findall(line)
    ]


def running(words):
    """Words that read as one line of text: no gap a table cell would leave."""
    return all(b[0] - a[2] < PROSE_GAP for a, b in zip(words, words[1:]))


def merged_across_gutter(lines):
    """
    Whether Poppler glued the two columns into one block.

    The second way the default extraction went wrong, and the one that survives
    block-level reordering: on some pages Poppler builds *lines* that run straight
    across the gutter — p163's *"Characters may “ready” up to two items Because of
    this, shotguns add +2"* is the Readying rule's left column and the Shotguns
    rule's right column on one line — or, as there, whole lines alternate between
    the columns inside one block. A real full-width block (a table row, a banner)
    has a word across the gutter, or cells with table-sized gaps; a merged one has
    neither, and has running text on both sides.
    """
    if len(lines) < 3:
        return False
    sides = set()
    segments = []
    odd = 0
    for words in lines:
        if any(w[0] < GUTTER_LEFT and w[2] > GUTTER_RIGHT for w in words):
            return False
        left = [w for w in words if w[2] <= GUTTER_LEFT + SLACK]
        right = [w for w in words if w[0] >= GUTTER_RIGHT - SLACK]
        if left and right and not (running(left) and running(right)):
            odd += 1                          # table cells, or a stretched heading
        for part, name in ((left, 'L'), (right, 'R')):
            if part:
                sides.add(name)
                segments.append(max(w[2] for w in part) - min(w[0] for w in part))
    # Two shapes of the same mistake: halves glued onto one line, and whole lines
    # alternating left, right, left within one block (p163 is the second). And
    # running text, not a table: Poppler makes each table cell its own short line,
    # so a table row passes every test above. Column text is long lines.
    long = sum(1 for width in segments if width >= LONG_LINE)
    # One stretched heading in fifty lines of glued text does not make a table.
    #
    # The threshold is measured, not guessed: over all 81 candidate blocks in this
    # book, every table scores 0.40 or less (gear tables 0.14–0.33, the Edge
    # summary 0.40) and every glued run of prose 0.46 or more — the lowest being
    # p82, whose columns run round narrow sidebar boxes.
    return sides == {'L', 'R'} and long >= LONG_SHARE * len(segments) and odd <= 0.1 * len(lines)


def side_blocks(lines, keep):
    """One side of a merged block, re-cut into paragraphs at its vertical gaps."""
    rows = []
    for words in lines:
        mine = [w for w in words if keep(w)]
        if mine:
            rows.append((min(w[1] for w in mine), max(w[3] for w in mine), mine))
    out = []
    spacing = sorted(b[0] - a[0] for a, b in zip(rows, rows[1:])) or [0]
    usual = spacing[len(spacing) // 2]
    current = []
    for i, row in enumerate(rows):
        if current and usual and row[0] - current[-1][0] > 1.5 * usual:
            out.append(current)
            current = []
        current.append(row)
    if current:
        out.append(current)
    blocks = []
    for group in out:
        words = [w for _, _, ws in group for w in ws]
        blocks.append({
            'x0': min(w[0] for w in words), 'y0': group[0][0],
            'x1': max(w[2] for w in words), 'y1': group[-1][1],
            'text': join_lines([' '.join(w[4] for w in ws) for _, _, ws in group]),
        })
    return blocks


def blocks_of(body, width):
    out = []
    for m in BLOCK.finditer(body):
        x0, y0, x1, y1 = map(float, m.groups()[:4])
        raw = LINE.findall(m.group(5))
        if x0 < GUTTER_LEFT - SLACK and x1 > GUTTER_RIGHT + SLACK:
            lines = [words_of(l) for l in raw]
            if merged_across_gutter(lines):
                out.extend(side_blocks(lines, lambda w: w[2] <= GUTTER_LEFT + SLACK))
                out.extend(side_blocks(lines, lambda w: w[0] >= GUTTER_RIGHT - SLACK))
                continue
        lines = [' '.join(html.unescape(w) for w in WORD.findall(l)).strip() for l in raw]
        text = join_lines([l for l in lines if l])
        if not text:
            continue
        out.append({'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'text': text})
    return out


def read_page(body, width):
    page_no = None
    kept = []
    for b in blocks_of(body, width):
        narrow = b['x1'] - b['x0'] < 30
        if narrow and (b['x1'] < MARGIN or b['x0'] > width - MARGIN):
            continue                                      # vertical running title
        if b['y0'] > FOOTER and re.fullmatch(r'\d{1,3}', b['text']):
            page_no = int(b['text'])                      # the page number
            continue
        kept.append(b)

    def side(b):
        if b['x1'] <= GUTTER_LEFT + SLACK:
            return 'L'
        if b['x0'] >= GUTTER_RIGHT - SLACK:
            return 'R'
        return 'W'

    wide = sorted((b for b in kept if side(b) == 'W'), key=lambda b: b['y0'])
    narrow = [b for b in kept if side(b) != 'W']

    # A narrow block beside a wide one is a cell of the same row.
    rows = [[w] for w in wide]
    loose = []
    for b in narrow:
        for row in rows:
            w = row[0]
            overlap = min(b['y1'], w['y1']) - max(b['y0'], w['y0'])
            if overlap > 0.5 * min(b['y1'] - b['y0'], w['y1'] - w['y0']):
                row.append(b)
                break
        else:
            loose.append(b)

    paragraphs = []
    top = -1.0
    for row in rows + [None]:
        bottom = row[0]['y0'] if row else float('inf')
        band = [b for b in loose if top <= b['y0'] < bottom]
        for col in ('L', 'R'):
            for b in sorted((b for b in band if side(b) == col), key=lambda b: b['y0']):
                paragraphs.append(b['text'])
        if row:
            paragraphs.append(' | '.join(c['text'] for c in sorted(row, key=lambda c: c['x0'])))
            top = row[0]['y0']
    return page_no, paragraphs


def extract():
    xml = subprocess.run(
        ['pdftotext', '-bbox-layout', str(PDF), '-'], capture_output=True, text=True, check=True
    ).stdout
    out = []
    for index, (w, h, body) in enumerate(PAGE.findall(xml), 1):
        page_no, paragraphs = read_page(body, float(w))
        marker = f'p{page_no}' if page_no is not None else 'unnumbered'
        out.append(f'=== {marker} (pdf {index}) ===')
        out.extend(p + '\n' for p in paragraphs)
    return '\n'.join(out) + '\n'


def flat(text):
    return re.sub(r'\s+', ' ', text)


# Passages that the old extraction got wrong, each as (before, after): `after`
# must follow `before` with nothing from another column in between. Add one
# whenever a page is found to read wrongly.
CHECKS = [
    # p163: Readying (left column) and Shotguns (right) were glued line by line.
    ('Because of this, shotguns add +2 to the user’s Shooting rolls',
     'and cause 3d6 damage at Short Range, 2d6 at Medium, and 1d6 at Long.'),
    ('Characters may “ready” up to two items per turn as a free action.', 'Readying means'),
    # p29: One Arm sat in the same glued block as Pacifist.
    ('ONE ARM (MAJOR)', 'By birth or battle, your hero lost an arm.'),
    # p150: Soak Rolls is three paragraphs in the left column, then Healing.
    ('SOAK ROLLS After rolling damage but before actually applying any Wounds',
     'If the character Soaks all the Wounds from an attack'),
    ('If the character Soaks all the Wounds from an attack',
     'Characters can’t Soak more than once per attack'),
    ('HEALING The Healing skill is used to remove Wounds',
     'A success removes one Wound, and a raise removes two'),
]


def check(text):
    t = flat(text)
    failed = 0
    for before, after in CHECKS:
        i = t.find(before)
        j = t.find(after)
        ok = i != -1 and j != -1 and 0 <= j - (i + len(before)) < 600
        print(('ok  ' if ok else 'FAIL') + f'  {before[:50]!r} -> {after[:50]!r}')
        failed += not ok
    return failed


if __name__ == '__main__':
    text = extract()
    OUT.write_text(text)
    print(f'wrote {OUT} ({len(text):,} chars)')
    if '--check' in sys.argv:
        sys.exit(1 if check(text) else 0)
