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
