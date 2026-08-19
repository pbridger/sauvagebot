import { describe, expect, it } from 'vitest';
import { abilityNotes, classify, describeNote, notesForTrait } from '../src/rules/abilities.js';
import { emptySheet, type NamedEntry, type Sheet } from '../src/rules/sheet.js';

/** A sheet with the skills the party's cards actually carry. */
function sheetWith(over: Partial<Sheet> = {}): Sheet {
  return {
    ...emptySheet('sir-ed', 'Sir Ed'),
    skills: {
      Notice: { die: 8 },
      Survival: { die: 8 },
      Stealth: { die: 6 },
      Healing: { die: 4 },
      Research: { die: 6 },
      Taunt: { die: 8 },
    },
    ...over,
  };
}

const edge = (name: string, text?: string): NamedEntry => (text ? { name, text } : { name });

/**
 * Every case below is verbatim from the party's cards or from Coffin Rock. The
 * point of this module is that it *refuses* to guess, so most of these assert
 * that something is left alone.
 */
describe('classifying an edge', () => {
  const sheet = sheetWith();

  /** The cleanest possible case, and one of only two on the whole party. */
  it('marks a plain skill bonus', () => {
    const note = classify(sheet, edge('Alertness', 'Nothing escapes your attention. You add +2 to all Notice rolls.'), 'edge');
    expect(note.klass).toBe('note');
    expect(note.effects).toEqual([
      { trait: 'Notice', value: 2, when: 'You add +2 to all Notice rolls.' },
    ]);
  });

  /** Two skills, one number, and the scope is a place the app cannot see. */
  it('hangs a note on each skill a bonus names', () => {
    const note = classify(
      sheet,
      edge(
        'Woodsman',
        "You're at home in the wilderness. Add +2 to Survival rolls and Stealth rolls made in the wild (but not in towns or underground).",
      ),
      'edge',
    );
    expect(note.effects.map((e) => e.trait).sort()).toEqual(['Stealth', 'Survival']);
    // The wording travels with it, because "in the wild" is the whole condition
    // and the app has no idea whether it is true.
    expect(note.effects[0]?.when).toContain('in the wild');
  });

  /**
   * A reroll is a reminder, never a number: the player rerolls. This is the
   * largest mechanical group on the party's cards and it needs no machinery.
   */
  it('marks a reroll without inventing a bonus', () => {
    const note = classify(
      sheet,
      edge('Guts', 'You get a free reroll on Fear tests.'),
      'edge',
    );
    expect(note.klass).toBe('note');
    expect(note.note).toMatch(/reroll/i);
    expect(note.effects.every((e) => e.value === undefined)).toBe(true);
  });

  /** The app draws the cards, so this one it really does have to do itself. */
  it('knows which edges it already applies', () => {
    for (const name of ['Level-Headed', 'Improved Level Headed', 'Quick', 'Hesitant']) {
      expect(classify(sheet, edge(name, 'Draw an additional Action Card.'), 'edge').klass).toBe(
        'wired',
      );
    }
  });

  it('leaves a narrative edge visibly inert', () => {
    const note = classify(sheet, edge('Agent', 'You serve the mysterious Agency.'), 'edge');
    expect(note.klass).toBe('text');
    expect(note.effects).toEqual([]);
  });

  /**
   * A stat block names its edges without restating them — every edge in Coffin
   * Rock. Saying so beats guessing the rule from the name.
   */
  it('says so when there is no rules text at all', () => {
    const note = classify(sheet, edge('Trademark Weapon (Pickaxe)'), 'edge');
    expect(note.klass).toBe('text');
    expect(note.note).toMatch(/Named without its rules text/);
  });

  /** Damage is a row too — this is the one PC edge that changes a fight. */
  it('hangs Champion on damage', () => {
    const note = classify(
      sheet,
      edge('Champion', 'You are favored by the Almighty and add +2 to damage rolls versus supernaturally evil creatures.'),
      'edge',
    );
    expect(note.effects).toEqual([
      {
        trait: 'Damage',
        value: 2,
        when: 'You are favored by the Almighty and add +2 to damage rolls versus supernaturally evil creatures.',
      },
    ]);
  });
});

/**
 * Rule 2 of the plan. Sir Ed's card already reads `Agility d6-1` — Elderly was
 * applied by whoever authored it — so anything that offered the penalty again
 * would count it twice.
 */
describe('effects already baked into the printed numbers', () => {
  it('warns rather than offering a derived-stat change', () => {
    const note = classify(
      sheetWith(),
      edge(
        'Elderly (Major)',
        "You're getting on in years. This grants you 5 extra skill points but subtracts 1 from Pace, running, Agility, Strength, and Vigor rolls.",
      ),
      'hindrance',
    );
    expect(note.klass).toBe('note');
    expect(note.note).toMatch(/Already included in the printed Pace/);
  });

  it('keeps that note off the trait rows, so nobody dials it in', () => {
    const notes = abilityNotes(
      sheetWith({
        hindrances: [
          {
            name: 'Elderly (Major)',
            text: 'This subtracts 1 from Pace, running, Agility, Strength, and Vigor rolls.',
          },
        ],
      }),
    );
    expect(notesForTrait(notes, 'Pace')).toEqual([]);
  });
});

/**
 * The case that forced clause-by-clause reading. Coffin Rock's Construct pairs
 * a `+2` with the word "damage" only if the two sentences are read as one — and
 * the resulting tooltip would offer a bonus nobody wrote.
 */
describe('not pairing a number with a word from a different sentence', () => {
  const construct =
    '+2 to recover from being Shaken. Arrows, Bolts, firearms and Piercing attacks do half damage. Fearless. Immune to disease and poison.';

  it('leaves Construct to the Marshal', () => {
    const note = classify(sheetWith(), edge('Construct', construct), 'ability');
    expect(note.klass).toBe('text');
  });

  /** Which is right: halving damage is what the damage adjustment is for. */
  it('still reads a bonus written in the same clause', () => {
    const note = classify(
      sheetWith(),
      edge('Sharp Senses', 'They get a +1 to all Notice rolls.'),
      'ability',
    );
    expect(note.effects).toEqual([
      { trait: 'Notice', value: 1, when: 'They get a +1 to all Notice rolls.' },
    ]);
  });
});

describe('what the sheet shows', () => {
  it('gathers every entry on the sheet', () => {
    const notes = abilityNotes(
      sheetWith({
        edges: [{ name: 'Alertness', text: 'You add +2 to all Notice rolls.' }],
        hindrances: [{ name: 'Curious (Major)', text: 'You are drawn to new things.' }],
        powers: [{ name: 'Size +1', text: 'Bigger than a man.' }],
      }),
    );
    expect(notes.map((n) => n.kind)).toEqual(['edge', 'hindrance', 'ability']);
    expect(notes.map((n) => n.klass)).toEqual(['note', 'text', 'text']);
  });

  it('finds the notes for one trait row', () => {
    const notes = abilityNotes(
      sheetWith({
        edges: [
          { name: 'Alertness', text: 'You add +2 to all Notice rolls.' },
          { name: 'Healer', text: 'Add +2 to Healing rolls.' },
        ],
      }),
    );
    expect(notesForTrait(notes, 'Notice').map((n) => n.entry.name)).toEqual(['Alertness']);
    expect(notesForTrait(notes, 'Healing').map((n) => n.entry.name)).toEqual(['Healer']);
    expect(notesForTrait(notes, 'Stealth')).toEqual([]);
  });

  /** The tooltip is the whole feature: it has to name the edge and its wording. */
  it('writes a line a player can act on', () => {
    const note = classify(
      sheetWith(),
      edge('Woodsman', 'Add +2 to Survival rolls made in the wild.'),
      'edge',
    );
    expect(describeNote(note, 'Survival')).toBe(
      'Woodsman +2 — Add +2 to Survival rolls made in the wild.',
    );
  });
});
