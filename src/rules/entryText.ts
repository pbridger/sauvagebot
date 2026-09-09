/**
 * Rules prose, broken into something a page can lay out.
 *
 * Damian, 2026-09-08, over a screenshot of Superior Kung Fu: *"this block of
 * unformatted text is a little impractical!"* — 2,600 characters covering seven
 * different styles, printed as one paragraph, with the book's bullets arriving as
 * `□`. Both halves of that are this module's problem.
 *
 * **The boxes are a control character.** The PDF's bullet extracts as `U+0084`,
 * which is a C1 control code with no glyph, so every browser draws the missing
 * character box. It is in six catalogue entries and, far more awkwardly, in the
 * `rules-text` dictionaries of rooms that were saved before the catalogue shipped —
 * so repairing the data file alone would leave the party's own rooms broken.
 * Cleaning it here fixes both at once, and costs nothing for text that is fine.
 *
 * **The wall is a list that lost its line breaks.** Where those bullets are, the
 * book has one item per style. Restoring them turns an unreadable block into seven
 * scannable entries without touching a word of the prose.
 *
 * Pure and string-in/blocks-out, so the layout can be tested without a DOM and the
 * same reading is available to anything that needs it.
 */

/**
 * Characters the book uses as a bullet, however they survived extraction.
 *
 * `U+0084` is the one this was written for; the rest are the shapes a PDF bullet
 * commonly turns into, included so a re-extraction with different settings does not
 * quietly reintroduce the same bug in a new disguise.
 */
const BULLETS = /[\u0084\u2022\u25aa\u25cf\u00b7]/g;

/**
 * The rest of the C1 block. None of it is printable, all of it draws as a box, and
 * whatever meaning it carried did not survive the PDF — so anything still here once
 * the bullets have been claimed is simply removed.
 */
const CONTROLS = /[\u0080-\u009f]/g;

export interface TextBlock {
  kind: 'paragraph' | 'item';
  text: string;
  /**
   * The bold run an item starts with — *"EAGLE CLAW: The warrior holds…"*. The
   * book sets these as run-in headings, and keeping them apart is what makes a
   * long list scannable rather than merely broken up.
   */
  heading?: string;
}

/**
 * A run-in heading: capitals up to the first colon.
 *
 * Deliberately narrow. It matches *"EAGLE CLAW:"* and *"SHUAI CHAO:"* and does not
 * match a sentence that happens to contain a colon, because a false positive here
 * bolds half a paragraph. Length-capped for the same reason.
 */
const RUN_IN = /^([A-Z][A-Z' ’-]{2,28}):\s*/;

/** Strip the unprintable, leaving the wording exactly as it was. */
export function cleanEntryText(text: string): string {
  return (
    text
      .replace(BULLETS, '\n• ')
      .replace(CONTROLS, '')
      .replace(/[ \t]+/g, ' ')
      // The bullet was mid-sentence, so the space that preceded it has become a
      // trailing space at the end of the line above.
      .replace(/ *\n */g, '\n')
      .trim()
  );
}

/**
 * Break prose into paragraphs and list items.
 *
 * A single paragraph in, a single paragraph out: nothing here reformats text that
 * was already readable, which is nearly every entry in the book.
 */
export function entryBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  for (const chunk of cleanEntryText(text).split(/\n+/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const bulleted = trimmed.startsWith('•');
    const body = bulleted ? trimmed.slice(1).trim() : trimmed;
    if (!body) continue;

    const runIn = bulleted ? RUN_IN.exec(body) : null;
    blocks.push({
      kind: bulleted ? 'item' : 'paragraph',
      text: runIn ? body.slice(runIn[0].length) : body,
      ...(runIn ? { heading: runIn[1] } : {}),
    });
  }
  return blocks;
}

/**
 * The named items in an entry — the seven kung fu styles, the Arcane Backgrounds.
 *
 * Falls out of the same parse, and is what an Edge with a choice attached needs in
 * order to offer that choice. Empty for an ordinary entry, which is the signal that
 * there is nothing to choose.
 */
export function entryOptions(text: string): string[] {
  return entryBlocks(text)
    .filter((block) => block.kind === 'item' && block.heading)
    .map((block) => block.heading!);
}

/** The clause for one named option, for showing a chosen style and nothing else. */
export function entryOption(text: string, name: string): TextBlock | undefined {
  const wanted = name.trim().toUpperCase();
  return entryBlocks(text).find((block) => block.heading?.toUpperCase() === wanted);
}

/**
 * The entry with only the chosen option's clause left in it.
 *
 * Damian: *"not replicate the full text of all the different Styles"*. Applied
 * before anything measures the text, because the sheet decides whether to offer a
 * **More** toggle by comparing the full entry against the book's one-line summary —
 * and with six of seven styles removed the "full" version can be the shorter of the
 * two, so a toggle chosen on the raw length would offer to show *less*.
 *
 * Round-trips: the result is bulleted text that reads back through `entryBlocks`
 * exactly as it went in, so there is one parse and one set of rules for layout.
 */
export function narrowEntry(text: string, choice: string | undefined): string {
  if (!choice?.trim()) return text;
  const wanted = choice.trim().toUpperCase();
  return entryBlocks(text)
    .filter((block) => block.kind !== 'item' || block.heading?.toUpperCase() === wanted)
    .map((block) =>
      block.kind === 'item'
        ? `\n• ${block.heading ? `${block.heading}: ` : ''}${block.text}`
        : block.text,
    )
    .join('\n');
}
