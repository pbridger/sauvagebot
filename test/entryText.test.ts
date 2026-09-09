import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  cleanEntryText,
  entryBlocks,
  entryOption,
  entryOptions,
  narrowEntry,
} from '../src/rules/entryText.js';

/** The bullet as it actually comes out of the PDF: a C1 control with no glyph. */
const BOX = '';

describe('cleaning up what the PDF gave us', () => {
  it('turns the unprintable bullet into a real one', () => {
    expect(cleanEntryText(`Before. ${BOX} ONE: first.`)).toBe('Before.\n• ONE: first.');
  });

  it('removes any other C1 control rather than drawing a box', () => {
    expect(cleanEntryText('ab')).toBe('ab');
  });

  it('leaves ordinary prose exactly as it was', () => {
    const text = 'Add +2 to Notice rolls — and −2 to Stealth.';
    expect(cleanEntryText(text)).toBe(text);
  });

  it('collapses the runs of spaces a two-column extract leaves behind', () => {
    expect(cleanEntryText('one    two')).toBe('one two');
  });
});

describe('breaking an entry into blocks', () => {
  const kungFu = `Background. Choose one of the options below.${BOX} DRUNKEN STYLE: Opponents subtract 2.${BOX} EAGLE CLAW: Unarmed attacks are AP 4.`;

  it('keeps a plain entry as one paragraph', () => {
    // Nearly every entry in the book is already readable and must not be
    // rearranged in the name of formatting the six that are not.
    const blocks = entryBlocks('Add +2 to Notice rolls.');
    expect(blocks).toEqual([{ kind: 'paragraph', text: 'Add +2 to Notice rolls.' }]);
  });

  it('splits the lead-in from the list', () => {
    const blocks = entryBlocks(kungFu);
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      text: 'Background. Choose one of the options below.',
    });
    expect(blocks).toHaveLength(3);
  });

  it('pulls the run-in heading off each item', () => {
    expect(entryBlocks(kungFu)[1]).toEqual({
      kind: 'item',
      heading: 'DRUNKEN STYLE',
      text: 'Opponents subtract 2.',
    });
  });

  it('does not mistake a mid-sentence colon for a heading', () => {
    const blocks = entryBlocks(`Lead.${BOX} They may act: quickly, or not at all.`);
    expect(blocks[1]?.heading).toBeUndefined();
    expect(blocks[1]?.text).toBe('They may act: quickly, or not at all.');
  });

  it('survives an empty string and a bullet with nothing after it', () => {
    expect(entryBlocks('')).toEqual([]);
    expect(entryBlocks(BOX)).toEqual([]);
  });
});

describe('the options inside an entry', () => {
  it('lists the named items, and nothing for an ordinary entry', () => {
    const text = `Lead.${BOX} ONE: first.${BOX} TWO: second.`;
    expect(entryOptions(text)).toEqual(['ONE', 'TWO']);
    expect(entryOptions('Add +2 to Notice rolls.')).toEqual([]);
  });

  it('finds one option’s clause, case-insensitively', () => {
    const text = `Lead.${BOX} EAGLE CLAW: AP 4.`;
    expect(entryOption(text, 'eagle claw')?.text).toBe('AP 4.');
    expect(entryOption(text, 'mantis')).toBeUndefined();
  });
});

/**
 * Against the shipped book rather than a fixture, because the bug was in the data:
 * six entries carry `U+0084` and Superior Kung Fu is the one Damian hit.
 */
describe('the real catalogue', () => {
  const catalogue = JSON.parse(
    readFileSync(fileURLToPath(new URL('../src/rules/catalogue.json', import.meta.url)), 'utf8'),
  ) as { edges: { name: string; text?: string }[]; hindrances: { name: string; text?: string }[] };

  it('finds the eight kung fu styles', () => {
    const entry = catalogue.edges.find((e) => e.name === 'SUPERIOR KUNG FU');
    expect(entry).toBeDefined();
    const styles = entryOptions(entry!.text ?? '');
    expect(styles).toContain('EAGLE CLAW');
    expect(styles).toContain('WING CHUN');
    // Seven, not the eight a first reading of the screenshot suggested: the
    // panel had simply cut the last one off.
    expect(styles).toHaveLength(7);
  });

  it('leaves no box-drawing controls anywhere in the book', () => {
    const all = [...catalogue.edges, ...catalogue.hindrances];
    const dirty = all.filter((e) => /[-]/.test(cleanEntryText(e.text ?? '')));
    expect(dirty.map((e) => e.name)).toEqual([]);
  });
});

describe('narrowing an entry to one option', () => {
  const text = `Lead in.${BOX} ONE: first.${BOX} TWO: second.`;

  it('keeps the lead-in and the chosen clause, and drops the rest', () => {
    const narrowed = narrowEntry(text, 'TWO');
    expect(narrowed).toContain('Lead in.');
    expect(narrowed).toContain('second');
    expect(narrowed).not.toContain('first');
  });

  it('reads back through the same parser, so there is one set of rules', () => {
    expect(entryBlocks(narrowEntry(text, 'ONE'))).toEqual([
      { kind: 'paragraph', text: 'Lead in.' },
      { kind: 'item', heading: 'ONE', text: 'first.' },
    ]);
  });

  it('leaves the entry alone when nothing is chosen', () => {
    expect(narrowEntry(text, undefined)).toBe(text);
    expect(narrowEntry(text, '  ')).toBe(text);
  });

  it('makes the full text shorter, which is why it runs before anything measures it', () => {
    // The More/Less toggle compares this against the book's summary, and offering
    // to expand into *less* text is the failure this ordering prevents.
    expect(narrowEntry(text, 'ONE').length).toBeLessThan(text.length);
  });
});
