import { describe, expect, it } from 'vitest';
import {
  StatBlockError,
  derivedParry,
  derivedToughness,
  parseStatBlock,
  parseStatBlocks,
} from '../src/rules/statBlock.js';

/** The three creatures printed in the player extract, verbatim. */
const ATTENDANT = `ATTENDANT
Attributes: Agility d4, Smarts d4, Spirit d4, Strength d4, Vigor d4
Skills: Athletics d4, Fighting d4, Notice d4, Shooting d4, Stealth d6
Pace: 4; Parry: 4; Toughness: 4
Special Abilities:
  Claw: Str+d4.
  Construct: +2 to recover from being Shaken; ignore 1 point of Wound penalties.
  Fearless: Immune to fear and Intimidation.`;

const BODYGUARD = `BODYGUARD
Attributes: Agility d8, Smarts d4, Spirit d6, Strength d6, Vigor d6
Skills: Athletics d6, Fighting d6, Intimidation d6, Notice d4, Shooting d4, Stealth d4
Pace: 6; Parry: 5; Toughness: 7 (2)
Edges: First Strike
Gear: Melee attack (Str+d6).
Special Abilities:
  Armor +2: Hardened skin.
  Fearless: Immune to fear and Intimidation.`;

const SENTINEL = `SENTINEL
Attributes: Agility d6, Smarts d6, Spirit d8, Strength d12+2, Vigor d10
Skills: Athletics d6, Fighting d10, Intimidation d10, Notice d8
Pace: 6; Parry: 7; Toughness: 13 (4)
Edges: Arcane Resistance, Sweep (Imp).
Gear: Melee attack (Str+d8).
Special Abilities:
  Armor +4: Stone skin.
  Size 2: Sentinels are 8' tall and very dense.`;

describe('reading a stat block', () => {
  const bodyguard = parseStatBlock(BODYGUARD);

  it('takes the name from the first line', () => {
    expect(bodyguard.name).toBe('BODYGUARD');
    expect(bodyguard.id).toBe('bodyguard');
  });

  it('treats it as an Extra unless it says Wild Card', () => {
    expect(bodyguard.wildCard).toBe(false);
    expect(parseStatBlock(`${BODYGUARD}\nWild Card`).wildCard).toBe(true);
  });

  it('reads the attributes', () => {
    expect(bodyguard.attributes).toEqual({
      agility: { die: 8 },
      smarts: { die: 4 },
      spirit: { die: 6 },
      strength: { die: 6 },
      vigor: { die: 6 },
    });
  });

  it('reads an attribute with a modifier', () => {
    expect(parseStatBlock(SENTINEL).attributes.strength).toEqual({ die: 12, mod: 2 });
  });

  it('reads the skills', () => {
    expect(parseStatBlock(SENTINEL).skills).toEqual({
      Athletics: { die: 6 },
      Fighting: { die: 10 },
      Intimidation: { die: 10 },
      Notice: { die: 8 },
    });
  });

  it('reads the derived line, splitting Toughness from armour', () => {
    expect(bodyguard.pace).toBe(6);
    expect(bodyguard.parry).toBe(5);
    expect(bodyguard.toughness).toBe(7);
    expect(bodyguard.armor).toBe(2);
  });

  it('reads edges, gear and special abilities', () => {
    expect(bodyguard.edges).toEqual([{ name: 'First Strike' }]);
    expect(bodyguard.gear).toBe('Melee attack (Str+d6).');
    expect(bodyguard.powers?.map((p) => p.name)).toEqual(['Armor +2', 'Fearless']);
  });

  it('does not split a comma inside brackets', () => {
    const sheet = parseStatBlock(`MOOK
Attributes: Agility d6, Vigor d6
Skills: Fighting d6
Gear: Colt (Range 12/24/48, damage 2d6), knife`);
    expect(sheet.gear).toContain('Range 12/24/48, damage 2d6');
  });

  it('refuses something that is not a stat block', () => {
    expect(() => parseStatBlock('just some prose about a bandit')).toThrow(StatBlockError);
    expect(() => parseStatBlock('')).toThrow(StatBlockError);
  });
});

/**
 * The derived-stat formulas, checked against blocks the book itself printed —
 * which is the only way to know the reading of "half your Fighting die type" is
 * the intended one.
 */
describe('derived stats', () => {
  it('matches the book on Parry for all three creatures', () => {
    // Fighting d4 -> 4, d6 -> 5, d10 -> 7.
    expect(derivedParry(parseStatBlock(ATTENDANT))).toBe(4);
    expect(derivedParry(parseStatBlock(BODYGUARD))).toBe(5);
    expect(derivedParry(parseStatBlock(SENTINEL))).toBe(7);
  });

  it('matches the book on Toughness where Size does not intervene', () => {
    expect(derivedToughness(parseStatBlock(ATTENDANT))).toBe(4);
    expect(derivedToughness(parseStatBlock(BODYGUARD))).toBe(7);
    // The Sentinel is Size 2, which the book adds on top: 2 + 5 + 4 + 2 = 13.
    expect(derivedToughness(parseStatBlock(SENTINEL), 2)).toBe(13);
  });

  it('gives Parry 2 to something with no Fighting', () => {
    const sheet = parseStatBlock('MOOK\nAttributes: Vigor d6\nSkills: Notice d4');
    expect(sheet.parry).toBe(2);
  });

  it('computes what a block leaves out', () => {
    const sheet = parseStatBlock('MOOK\nAttributes: Vigor d8\nSkills: Fighting d8');
    expect(sheet.parry).toBe(6);
    expect(sheet.toughness).toBe(6);
  });

  it('prefers what the block states over what it would compute', () => {
    const sheet = parseStatBlock(
      'MOOK\nAttributes: Vigor d6\nSkills: Fighting d6\nPace: 5; Parry: 9; Toughness: 12',
    );
    expect(sheet.parry).toBe(9);
    expect(sheet.toughness).toBe(12);
  });
});

describe('pasting several at once', () => {
  it('splits a page into one sheet per creature', () => {
    const sheets = parseStatBlocks(`${ATTENDANT}\n\n${BODYGUARD}\n\n${SENTINEL}`);
    expect(sheets.map((s) => s.name)).toEqual(['ATTENDANT', 'BODYGUARD', 'SENTINEL']);
    expect(sheets[1]?.toughness).toBe(7);
  });

  it('handles a single block without splitting it', () => {
    expect(parseStatBlocks(BODYGUARD)).toHaveLength(1);
  });
});

/**
 * Real text from the books the table is actually using, pasted verbatim. Every
 * case here is something that was being lost in silence — see
 * MECHANICS-INVENTORY.md §4.
 */
describe('reading blocks as books actually print them', () => {
  /**
   * Coffin Rock writes the header bare on most of its blocks. Requiring a colon
   * meant every special ability in the adventure was dropped, so Crawlin' Dead
   * arrived as an ordinary corpse with no Undead and no Fear.
   */
  it('reads Special Abilities with no colon after it', () => {
    const sheet = parseStatBlock(
      [
        "Crawlin' Dead",
        'Attributes: Agility d6, Smarts d4 Spirit d4',
        'Strength d6, Vigor d6',
        'Skills: Fighting d6, Intimidation d6, Notice d4',
        'Pace: 3; Parry: 5; Toughness: 7',
        'Special Abilities',
        '* Claws: d6+d4',
        '* Fearless: Crawlin’ dead are immune to Fear and Intimidation.',
      ].join('\n'),
    );
    expect(sheet.powers?.map((p) => p.name)).toEqual(['Claws', 'Fearless']);
  });

  /** The bullet is typography, not part of the ability's name. */
  it('strips the bullet from an ability name', () => {
    const sheet = parseStatBlock(
      [
        'Summoned Demon',
        'Attributes: Agility d8, Vigor d10',
        'Pace: 8; Parry: 7; Toughness: 10 (1)',
        'Special Abilities:',
        '* Armor +1: Demons have thick hide.',
        '• Size +2: Demons are nearly ten feet tall.',
      ].join('\n'),
    );
    expect(sheet.powers?.map((p) => p.name)).toEqual(['Armor +1', 'Size +2']);
  });

  /**
   * A stat block in a book is set in a narrow column, so any field of length
   * wraps. Belle Sygrove imported with an edge called "Snakeoil".
   */
  it('rejoins a wrapped Edges line', () => {
    const sheet = parseStatBlock(
      [
        'Belle Sygrove',
        'Attributes: Agility d6, Vigor d6',
        'Edges: Charismatic, Command, Snakeoil',
        'Salesman, Very Attractive',
      ].join('\n'),
    );
    expect(sheet.edges.map((e) => e.name)).toEqual([
      'Charismatic',
      'Command',
      'Snakeoil Salesman',
      'Very Attractive',
    ]);
  });

  /**
   * The wrap *and* a missing comma, which is how Coffin Rock prints it. Reading
   * only the last die left this creature with two of its five attributes.
   */
  it('reads several attributes run together without commas', () => {
    const sheet = parseStatBlock(
      ['Walkin’ Dead', 'Attributes: Agility d6, Smarts d4 Spirit d4 Strength', 'd6, Vigor d6'].join('\n'),
    );
    expect(Object.keys(sheet.attributes).sort()).toEqual([
      'agility',
      'smarts',
      'spirit',
      'strength',
      'vigor',
    ]);
  });

  /**
   * Animal intelligence. This one cost the most: the pattern was end-anchored,
   * so `Smarts d6 (A)` matched nothing and **110 of the 219 creatures we ship**
   * imported with no Smarts at all.
   */
  it('reads the animal-intelligence marker', () => {
    const sheet = parseStatBlock('Antelope\nAttributes: Agility d10, Smarts d6 (A), Vigor d6');
    expect(sheet.attributes.smarts).toEqual({ die: 6 });
    const tight = parseStatBlock('Insect Swarm\nAttributes: Agility d10, Smarts d4(A), Vigor d10');
    expect(tight.attributes.smarts).toEqual({ die: 4 });
  });

  /** A mindless thing has no Smarts, and that is not the same as failing to read one. */
  it('leaves a dashed attribute absent', () => {
    const sheet = parseStatBlock('Invisible Devourer\nAttributes: Agility d4, Smarts -, Vigor d8');
    expect(sheet.attributes.smarts).toBeUndefined();
    expect(sheet.attributes.agility).toEqual({ die: 4 });
  });

  /** Semicolons separate a list as readily as commas, and the bestiary uses both. */
  it('splits a skills list on semicolons too', () => {
    const sheet = parseStatBlock('Rabbit\nSkills: Fighting d6, Notice d10; Stealth d6');
    expect(Object.keys(sheet.skills).sort()).toEqual(['Fighting', 'Notice', 'Stealth']);
  });

  /**
   * The `Powers:` line was never read at all, so the adventure's antagonist
   * imported with none of his seven powers.
   */
  it('keeps the Powers line', () => {
    const sheet = parseStatBlock(
      [
        'Reverend Cheval',
        'Attributes: Agility d8, Vigor d8',
        'Powers: Armor, bolt, dispel, fear, puppet, smite; 20 PP',
        'Special Abilities',
        '* Hardy: A second Shaken result does not cause a wound.',
      ].join('\n'),
    );
    expect(sheet.powerNotes).toBe('Armor, bolt, dispel, fear, puppet, smite; 20 PP');
    // The two must not collide: Cheval has arcane powers *and* special abilities.
    expect(sheet.powers?.map((p) => p.name)).toEqual(['Hardy']);
  });

  /** Deadlands Reloaded gives every human a Charisma; SWADE has none. */
  it('reads Charisma, positive and negative', () => {
    expect(
      parseStatBlock('Belle\nAttributes: Agility d6\nCharisma: +6; Pace: 6; Parry: 5').charisma,
    ).toBe(6);
    expect(
      parseStatBlock('Deputies\nAttributes: Agility d6\nCharisma: –6; Pace: 6').charisma,
    ).toBe(-6);
  });

  /** A creature's prose must not be glued onto the field above it. */
  it('does not absorb following prose into the Gear line', () => {
    const sheet = parseStatBlock(
      [
        'Ike Turnbull',
        'Attributes: Agility d6, Vigor d6',
        'Gear: Pickaxe (2d6)',
        'Special Abilities',
        '* Berserk: He gains +2 to all Fighting rolls.',
      ].join('\n'),
    );
    expect(sheet.gear).toBe('Pickaxe (2d6)');
  });
});
