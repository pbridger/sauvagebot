"""
Every rulebook quote this project relies on, checked against the rulebook.

    python3 scripts/extract-rules.py      # first, if the extract is missing or stale
    python3 scripts/check-quotes.py       # every cited quote: found, where, and on which page
    python3 scripts/check-quotes.py --all # and every uncited quote of six words or more
    python3 scripts/check-quotes.py --all --context  # and, for each found quote, its
                                          # section heading and the sentence after it

A quote is anything in double quotes — straight or curly, optionally inside
`*…*` or backticks — that has a page citation (`p150`, `page 150`) within a short
distance after it. Quotes with no citation are mostly people (Damian, Paul) and
are not the book's to check.

Each quote is split at its ellipses, and every fragment of four words or more
must appear in the extract. Matching ignores case, whitespace, quote style and
dash style, which are typography rather than wording.

Why this exists: between August and October 2026 the rules were quoted from an
extract that interleaved the two columns of the page (see `extract-rules.py`),
and a sentence from Healing was shipped as a Soak rule. A quote that cannot be
found in a column-correct extract is a quote whose rule needs re-checking.
"""
import re, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO.parent
EXTRACT = ROOT / 'import' / 'DLWW_Core_player_extract.txt'
SOURCES = [
    *sorted((REPO / 'src').rglob('*.ts')),
    *sorted((REPO / 'extension' / 'src').rglob('*.ts')),
    *sorted((REPO / 'test').rglob('*.ts')),
    REPO / 'CHANGELOG.md',
    ROOT / 'MECHANICS-INVENTORY.md',
]

QUOTE = re.compile(r'[“"]([^“”"]{12,}?)[”"]')
CITE = re.compile(r'^[^\n"“”]{0,40}?\b(?:p|page\s+)(\d{1,3})\b')
CITE_BEFORE = re.compile(r'\b(?:p|page\s+)(\d{1,3})\b[^\n"“”]{0,12}$')


def norm(text):
    # A quote wrapped across comment or blockquote lines carries the prefixes.
    text = re.sub(r'\n[ \t]*(?://+|\*+|>+)?[ \t]*(?:>[ \t]*)?', ' ', text)
    text = text.lower()
    # Quote marks are typography: the book's “unstable platform” is the code's
    # 'unstable platform'. One mark for all of them.
    text = re.sub(r'[‘’`´“”"]', "'", text)
    text = re.sub(r'[−–—‒―]', '-', text)
    text = text.replace('­', '')
    text = re.sub(r'\*\*?', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def pages_of(extract):
    """(start offset in the normalised text, book page) for each page marker."""
    spans = []
    flat = []
    offset = 0
    for chunk in re.split(r'(=== (?:p\d+|unnumbered) \(pdf \d+\) ===)', extract):
        m = re.match(r'=== p(\d+)', chunk)
        if m:
            spans.append((offset, int(m.group(1))))
            continue
        n = norm(chunk)
        if n:
            flat.append(n)
            offset += len(n) + 1
    return ' '.join(flat), spans


HEADING = re.compile(r"^[A-Z0-9][A-Z0-9 &’'!,\-—()/:.]{2,60}$")


def headings_index(extract, book):
    """Every all-caps heading, with where it sits in the normalised text."""
    heads, offsets = [], []
    cursor = 0
    for para in extract.split('\n'):
        para = para.strip()
        if para.startswith('=== ') or para.isdigit() or not HEADING.match(para):
            continue
        at = book.find(norm(para), cursor)
        if at == -1:
            continue
        heads.append(para)
        offsets.append(at)
        cursor = at + 1
    return heads, offsets


def heading_before(heads, offsets, index):
    last = '?'
    for head, at in zip(heads, offsets):
        if at > index:
            break
        last = head
    return last


def page_at(spans, index):
    page = None
    for start, number in spans:
        if start > index:
            break
        page = number
    return page


def main():
    if not EXTRACT.exists():
        sys.exit(f'{EXTRACT} is missing — run scripts/extract-rules.py first')
    book, spans = pages_of(EXTRACT.read_text())
    raw_paragraphs, offsets = headings_index(EXTRACT.read_text(), book)
    seen = set()
    missing = []
    wrong_page = []
    found = 0
    contexts = []
    for path in SOURCES:
        if not path.exists():
            continue
        text = path.read_text()
        for m in QUOTE.finditer(text):
            cite = CITE.match(text[m.end():]) or CITE_BEFORE.search(text[max(0, m.start() - 60):m.start()])
            quote = m.group(1)
            # Uncited, a quote counts as the book's only in the house style for
            # book quotes — `*"…"*` or a backticked `"…"` — which is how the code
            # quotes the rules and not how it quotes people.
            styled = text[max(0, m.start() - 2):m.start()].endswith(('*', '`'))
            if not cite and not ('--all' in sys.argv and styled and len(norm(quote).split()) >= 6):
                continue
            page = int(cite.group(1)) if cite else 0
            key = (norm(quote), page)
            if key in seen:
                continue
            seen.add(key)
            line = text.count('\n', 0, m.start()) + 1
            where = f'{path.relative_to(ROOT)}:{line}'
            fragments = [f for f in re.split(r'…|\.\.\.', quote) if len(norm(f).split()) >= 4]
            if not fragments:
                continue
            located = [book.find(norm(f)) for f in fragments]
            if any(i == -1 for i in located):
                lost = [f for f, i in zip(fragments, located) if i == -1]
                missing.append((where, page, quote, lost))
                continue
            found += 1
            if '--context' in sys.argv:
                contexts.append((where, page, quote, located[0]))
            actual = {page_at(spans, i) for i in located}
            # A quote can run onto the next page; anything further is a wrong cite.
            if page and not any(p is not None and abs(p - page) <= 1 for p in actual):
                wrong_page.append((where, page, sorted(p for p in actual if p), quote))

    print(f'{found} cited quotes found in the book.\n')
    print(f'== NOT FOUND ({len(missing)}) — wording that is not in the book as quoted ==')
    for where, page, quote, lost in missing:
        print(f'\n{where}  ({f"cites p{page}" if page else "no citation"})\n  "{quote[:220]}"')
        for f in lost:
            print(f'  missing: "{norm(f)[:160]}"')
    if contexts:
        # The check that finds quotes cannot find a quote read under the wrong
        # heading: the Healing sentence that became a Soak rule is word for word
        # on p150. So, for reading through by hand: the section each quote sits
        # in, and the sentence it ends in plus the next — where a dropped "if"
        # or "except" would be.
        print(f'\n== IN CONTEXT ({len(contexts)}) ==')
        for where, page, quote, at in contexts:
            heading = heading_before(raw_paragraphs, offsets, at)
            end = book.find('. ', at + len(norm(re.split(r'…|\.\.\.', quote)[0])))
            after = book[at:book.find('. ', end + 2) + 1 if end != -1 else at + 300]
            print(f'\n{where} — under "{heading}"\n  quote: "{norm(quote)[:160]}"\n  book:  "{after[:420]}"')
    print(f'\n== WRONG PAGE ({len(wrong_page)}) — found, but not where it says ==')
    for where, page, actual, quote in wrong_page:
        print(f'{where}  cites p{page}, found on p{actual}: "{quote[:100]}"')


if __name__ == '__main__':
    main()
