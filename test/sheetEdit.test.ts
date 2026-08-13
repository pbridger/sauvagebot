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
  setSkill,
  setText,
  setWildCard,
  updateEntry,
} from '../src/rules/sheetEdit.js';

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
    expect(sheet.edges.at(-1)).toEqual({ name: 'LUCK', text: 'Draw an extra chip.' });

    sheet = removeEntry(sheet, 'edges', sheet.edges.length - 1);
    expect(sheet.edges).toHaveLength(reggie.edges.length);
  });

  it('drops the text when it is emptied, rather than storing a blank string', () => {
    const sheet = updateEntry(reggie, 'edges', 0, { text: '  ' });
    expect('text' in sheet.edges[0]!).toBe(false);
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
