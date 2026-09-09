import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArchetypeCards } from '../src/rules/importArchetypeCard.js';
import { traitDie } from '../src/rules/sheet.js';
import {
  addEntry,
  newCharacter,
  parseDie,
  parseMod,
  pruneEmptyEntries,
  removeEntry,
  setAttribute,
  setDerived,
  setRunning,
  setSkill,
  setText,
  setWildCard,
  updateEntry,
  setMaxWounds,
} from '../src/rules/sheetEdit.js';
import { woundLimit } from '../src/rules/status.js';
import { emptySheet } from '../src/rules/sheet.js';

const reggie = parseArchetypeCards(
  readFileSync(fileURLToPath(new URL('./fixtures/reggie-kane.html', import.meta.url)), 'utf8'),
)[0]!;

describe('traits', () => {
  it('sets a die, and a modifier only when there is one', () => {
    expect(setSkill(reggie, 'Fighting', 10).skills.Fighting).toEqual({ die: 10 });
    expect(setSkill(reggie, 'Fighting', 10, 2).skills.Fighting).toEqual({ die: 10, mod: 2 });
    expect(setSkill(reggie, 'Fighting', 10, 0).skills.Fighting).toEqual({ die: 10 });
  });

  it('clearing a skill removes it rather than storing a zero', () => {
    const cleared = setSkill(reggie, 'Fighting', undefined);
    expect('Fighting' in cleared.skills).toBe(false);
    // …which is what makes it roll as untrained rather than as a d0.
    expect(traitDie(cleared, 'Fighting')).toEqual({ die: 4, mod: -2 });
  });

  it('never mutates the sheet it was given', () => {
    const before = JSON.stringify(reggie);
    setSkill(reggie, 'Fighting', 12, 3);
    setAttribute(reggie, 'vigor', undefined);
    expect(JSON.stringify(reggie)).toBe(before);
  });

  it('edits attributes the same way', () => {
    expect(setAttribute(reggie, 'vigor', 12, -1).attributes.vigor).toEqual({ die: 12, mod: -1 });
  });
});

describe('derived stats', () => {
  it('sets and clears', () => {
    expect(setDerived(reggie, 'parry', 8).parry).toBe(8);
    expect('parry' in setDerived(reggie, 'parry', undefined)).toBe(false);
    expect('parry' in setDerived(reggie, 'parry', NaN)).toBe(false);
  });

  /**
   * The running die is the only field on this block that overrides a derivation
   * rather than holding a value, so clearing it has to genuinely remove the key
   * — leaving `{ die: 6 }` behind would silently stop the sheet reading its own
   * Edges without ever saying so. `runningDie` proves the other half.
   */
  it('sets and clears the running die override', () => {
    expect(setRunning(reggie, 10).running).toEqual({ die: 10 });
    expect(setRunning(reggie, 4, -1).running).toEqual({ die: 4, mod: -1 });
    // Zero is no modifier, the same as everywhere else a die and a mod are typed.
    expect(setRunning(reggie, 8, 0).running).toEqual({ die: 8 });
    expect('running' in setRunning(setRunning(reggie, 10), undefined)).toBe(false);
  });

  it('leaves the running die alone by default, so the prose still speaks', () => {
    expect(reggie.running).toBeUndefined();
  });

  it('drops the card’s "7(5)" shorthand once the numbers are edited by hand', () => {
    expect(reggie.toughnessRaw).toBe('7(5)');
    expect(setDerived(reggie, 'toughness', 9).toughnessRaw).toBeUndefined();
    expect(setDerived(reggie, 'armor', 4).toughnessRaw).toBeUndefined();
    // Editing an unrelated stat leaves it alone.
    expect(setDerived(reggie, 'pace', 8).toughnessRaw).toBe('7(5)');
  });
});

describe('text fields', () => {
  it('clears an optional field when emptied', () => {
    expect('quote' in setText(reggie, 'quote', '   ')).toBe(false);
    expect(setText(reggie, 'quote', ' howdy ').quote).toBe('howdy');
  });

  it('refuses to blank the name', () => {
    expect(setText(reggie, 'name', '   ').name).toBe(reggie.name);
  });

  it('does not change the id when the name changes', () => {
    // Deriving a new id on rename would write to a new key and orphan the old one.
    const renamed = setText(reggie, 'name', 'SOMEONE ELSE');
    expect(renamed.name).toBe('SOMEONE ELSE');
    expect(renamed.id).toBe(reggie.id);
  });

  it('toggles Wild Card, which decides whether rolls get a Wild Die', () => {
    expect(setWildCard(reggie, false).wildCard).toBe(false);
  });
});

describe('edges and hindrances', () => {
  it('adds, updates and removes', () => {
    let sheet = addEntry(reggie, 'edges', { name: 'LUCK' });
    expect(sheet.edges.at(-1)).toEqual({ name: 'LUCK' });

    sheet = updateEntry(sheet, 'edges', sheet.edges.length - 1, { text: 'Draw an extra chip.' });
    expect(sheet.edges.at(-1)).toEqual({
      name: 'LUCK',
      text: 'Draw an extra chip.',
      edited: true,
    });

    sheet = removeEntry(sheet, 'edges', sheet.edges.length - 1);
    expect(sheet.edges).toHaveLength(reggie.edges.length);
  });

  it('drops the text when it is emptied, rather than storing a blank string', () => {
    const sheet = updateEntry(reggie, 'edges', 0, { text: '  ' });
    expect('text' in sheet.edges[0]!).toBe(false);
    // And it stops counting as an edit, so the book may fill the gap again.
    expect('edited' in sheet.edges[0]!).toBe(false);
  });

  it('marks typed text as a person’s, so saving cannot throw it away', () => {
    // Damian, 2026-09-08: edits to an Edge the rulebook knows kept vanishing,
    // because `splitSheet` could not tell them from an imported card summary.
    const sheet = updateEntry(reggie, 'edges', 0, { text: 'Only in daylight.' });
    expect(sheet.edges[0]?.edited).toBe(true);
  });

  it('does not mark text that is the book’s own wording', () => {
    // The editor fills the box from the catalogue when you pick an Edge by name.
    // Marking that would pin the book's prose to the sheet — 2,600 chars for
    // Superior Kung Fu — inside a 15,000 char room, for text that ships anyway.
    const book = 'The full printed wording.';
    const sheet = updateEntry(reggie, 'edges', 0, { text: book }, book);
    expect(sheet.edges[0]?.edited).toBeUndefined();
    expect(sheet.edges[0]?.text).toBe(book);
  });

  it('marks it once it differs from the book, however slightly', () => {
    const book = 'The full printed wording.';
    const sheet = updateEntry(reggie, 'edges', 0, { text: `${book} Ours: at night only.` }, book);
    expect(sheet.edges[0]?.edited).toBe(true);
  });

  it('does not mark an entry edited when only the name changes', () => {
    expect(updateEntry(reggie, 'edges', 0, { name: 'GUTS' }).edges[0]?.edited).toBeUndefined();
  });

  it('sets and clears Size, which is a derived field like the rest', () => {
    // Zero is a real Size — a normal-sized person — and must survive, where blank
    // means "nothing recorded". `setDerived` only drops `undefined` and `NaN`.
    expect(setDerived(reggie, 'size', 3).size).toBe(3);
    expect(setDerived(reggie, 'size', 0).size).toBe(0);
    expect('size' in setDerived(setDerived(reggie, 'size', 3), 'size', undefined)).toBe(false);
  });

  it('records the option an Edge was taken with, and clears it when unset', () => {
    // Superior Kung Fu: the book's unit of choice is the taking, so two styles is
    // two entries with the same name rather than a list on one.
    const picked = updateEntry(reggie, 'edges', 0, { choice: 'EAGLE CLAW' });
    expect(picked.edges[0]?.choice).toBe('EAGLE CLAW');
    expect('choice' in updateEntry(picked, 'edges', 0, { choice: '' }).edges[0]!).toBe(false);
  });

  it('does not count choosing an option as editing the text', () => {
    // Otherwise picking a style would pin the book's own wording onto the sheet.
    expect(updateEntry(reggie, 'edges', 0, { choice: 'MANTIS' }).edges[0]?.edited).toBeUndefined();
  });

  it('trims a name on the way in', () => {
    expect(updateEntry(reggie, 'edges', 0, { name: '  GUTS  ' }).edges[0]?.name).toBe('GUTS');
  });

  it('removes the right one when two share a name', () => {
    let sheet = addEntry(reggie, 'edges', { name: 'GUTS', text: 'first' });
    sheet = addEntry(sheet, 'edges', { name: 'GUTS', text: 'second' });
    sheet = removeEntry(sheet, 'edges', sheet.edges.length - 2);
    expect(sheet.edges.at(-1)?.text).toBe('second');
  });

  it('prunes rows that were added but never filled in', () => {
    const sheet = pruneEmptyEntries(addEntry(reggie, 'edges', { name: '  ' }));
    expect(sheet.edges).toHaveLength(reggie.edges.length);
  });
});

describe('new characters', () => {
  it('slugs the name into an id', () => {
    expect(newCharacter('Lucky Delacroix').id).toBe('lucky-delacroix');
  });

  it('does not collide with an existing character', () => {
    const first = newCharacter('Bandit');
    const second = newCharacter('Bandit', [first]);
    const third = newCharacter('Bandit', [first, second]);
    expect([second.id, third.id]).toEqual(['bandit-2', 'bandit-3']);
  });

  it('falls back to a usable id for a name with no letters', () => {
    expect(newCharacter('???').id).toBe('character');
  });

  it('starts as a Wild Card with nothing filled in', () => {
    const sheet = newCharacter();
    expect(sheet.wildCard).toBe(true);
    expect(sheet.edges).toEqual([]);
    expect(sheet.attributes).toEqual({});
  });
});

describe('parsing input', () => {
  it('reads a die from either "8" or "d8"', () => {
    expect(parseDie('8')).toBe(8);
    expect(parseDie('d8')).toBe(8);
    expect(parseDie('d7')).toBeUndefined();
    expect(parseDie('')).toBeUndefined();
  });

  it('treats blank, zero and nonsense as no modifier', () => {
    expect(parseMod('+2')).toBe(2);
    expect(parseMod('-1')).toBe(-1);
    expect(parseMod('')).toBeUndefined();
    expect(parseMod('0')).toBeUndefined();
    expect(parseMod('banana')).toBeUndefined();
  });
});

/**
 * The wound-track override. Coffin Rock's Blood Men are Henchmen — a wild die on
 * an Extra's track — and this is the control that expresses it.
 */
describe('overriding the wound track', () => {
  const sheet = { ...emptySheet('blood-man', 'Blood Man'), wildCard: true };

  it('sets a track that is not the one Wild Card implies', () => {
    const henchman = setMaxWounds(sheet, 0);
    expect(henchman.maxWounds).toBe(0);
    expect(woundLimit(henchman)).toBe(0);
    expect(henchman.wildCard).toBe(true);
  });

  /**
   * Cleared rather than written as the default number, so a character whose Wild
   * Card status is flipped later goes back to following it.
   */
  it('clears back to the default', () => {
    const cleared = setMaxWounds(setMaxWounds(sheet, 0), undefined);
    expect('maxWounds' in cleared).toBe(false);
    expect(woundLimit(cleared)).toBe(3);
    expect(woundLimit({ ...cleared, wildCard: false })).toBe(0);
  });

  it('refuses a negative or fractional track', () => {
    expect(setMaxWounds(sheet, -2).maxWounds).toBe(0);
    expect(setMaxWounds(sheet, 2.6).maxWounds).toBe(3);
  });
});
