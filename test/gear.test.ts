import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArchetypeCards } from '../src/rules/importArchetypeCard.js';
import {
  damageDiceOptions,
  damageExpression,
  explodeDice,
  isRollableDamage,
  parseGear,
  weaponSkill,
} from '../src/rules/gear.js';

const reggie = parseArchetypeCards(
  readFileSync(fileURLToPath(new URL('./fixtures/reggie-kane.html', import.meta.url)), 'utf8'),
)[0]!;

describe('parsing the real gear line', () => {
  const gear = parseGear(reggie.gear);

  it('finds the weapons with their stats', () => {
    expect(gear.weapons).toEqual([
      { name: 'Colt Rainmaker', range: '12/24/48', damage: '2d6', rof: 1, ap: 1 },
      {
        name: 'Gatling pistol',
        range: '12/24/48',
        damage: '2d6',
        rof: 3,
        ap: 1,
        notes: 'must fire full RoF',
      },
      { name: 'knife', damage: 'Str+d4' },
    ]);
  });

  it('keeps a note that is not one of the recognised stats', () => {
    expect(gear.weapons[1]?.notes).toBe('must fire full RoF');
  });

  it('separates armour, which is written as a bare bonus', () => {
    expect(gear.armor).toEqual([
      {
        name: 'armored vest',
        detail: '+2; subtract 2 from bullet damage before applying AP',
      },
    ]);
  });

  it('does not mistake the vest for a weapon, though its text says "damage" and "AP"', () => {
    expect(gear.weapons.map((w) => w.name)).not.toContain('armored vest');
  });

  it('does not mistake a +1 skill bonus for armour', () => {
    // "Agency badge (+1 Persuasion to lawful types)" starts with a bonus but is
    // not armour. Only a standalone bonus counts.
    expect(gear.armor.map((a) => a.name)).toEqual(['armored vest']);
  });

  it('keeps everything else as plain items, losing nothing', () => {
    expect(gear.items).toEqual([
      { name: 'spare Gatling drum' },
      { name: '.32 ammo', detail: '×50' },
      { name: 'disguise kit' },
      { name: 'Agency badge', detail: '+1 Persuasion to lawful types' },
    ]);
  });

  it('pulls the money out', () => {
    expect(gear.money).toBe('$135');
  });

  it('accounts for every comma-separated entry on the line', () => {
    const total =
      gear.weapons.length + gear.armor.length + gear.items.length + (gear.money ? 1 : 0);
    expect(total).toBe(9);
  });
});

describe('edge cases', () => {
  it('handles no gear at all', () => {
    expect(parseGear(undefined)).toEqual({ weapons: [], armor: [], items: [] });
    expect(parseGear('')).toEqual({ weapons: [], armor: [], items: [] });
  });

  it('does not split on a comma inside brackets', () => {
    const gear = parseGear('Shotgun (Range 12/24/48, damage 1-3d6), hat');
    expect(gear.weapons).toHaveLength(1);
    expect(gear.items).toEqual([{ name: 'hat' }]);
  });

  it('falls back to a plain item rather than dropping something unrecognised', () => {
    const gear = parseGear('mysterious artifact (glows faintly on Tuesdays)');
    expect(gear.items).toEqual([
      { name: 'mysterious artifact', detail: 'glows faintly on Tuesdays' },
    ]);
  });

  it('reads a weapon written with only damage', () => {
    expect(parseGear('sabre (Str+d6)').weapons).toEqual([{ name: 'sabre', damage: 'Str+d6' }]);
  });

  it('tolerates a trailing full stop and stray whitespace', () => {
    expect(parseGear('  rope ,  lantern .  ').items).toEqual([
      { name: 'rope' },
      { name: 'lantern' },
    ]);
  });
});

describe('damage expressions', () => {
  it('substitutes the wielder’s Strength die', () => {
    // Reggie has Strength d4, so his knife does d4+d4 — not a fixed number.
    expect(damageExpression('Str+d4', 4)).toBe('d4!+d4!');
    expect(damageExpression('Str+d6', 12)).toBe('d12!+d6!');
  });

  it('makes every damage die explode, because damage aces', () => {
    // The card writes 2d6; rolling that unexploded silently caps damage at 12.
    expect(damageExpression('2d6', 8)).toBe('2d6!');
    expect(damageExpression('2d6+1', 8)).toBe('2d6!+1');
  });

  it('does not double up an exclamation that is already there', () => {
    expect(explodeDice('2d6!')).toBe('2d6!');
    expect(explodeDice('d8!+d6')).toBe('d8!+d6!');
  });

  it('leaves a flat modifier alone', () => {
    expect(explodeDice('2d6+3')).toBe('2d6!+3');
  });

  it('drops the Strength term rather than producing nonsense when it is unknown', () => {
    expect(damageExpression('Str+d4', undefined)).toBe('d4!');
  });
});

describe('which skill swings the weapon', () => {
  const gear = parseGear(reggie.gear);

  it('shoots anything with a range', () => {
    expect(weaponSkill(gear.weapons[0]!)).toBe('Shooting');
    expect(weaponSkill(gear.weapons[1]!)).toBe('Shooting');
  });

  it('fights anything doing Strength-based damage', () => {
    expect(weaponSkill(gear.weapons[2]!)).toBe('Fighting');
  });

  it('falls back on the name when there is neither', () => {
    expect(weaponSkill({ name: 'scattergun' })).toBe('Shooting');
    expect(weaponSkill({ name: 'cavalry sabre' })).toBe('Fighting');
  });
});

/**
 * A shotgun does one, two or three dice depending on the range band. The sheet
 * cannot know the range, so it offers all three rather than guessing — and
 * deliberately does not label which is which, because that mapping has not been
 * checked against the book.
 */
describe('ranged damage', () => {
  it('lays a shotgun out as the three rolls it stands for', () => {
    expect(damageDiceOptions('1–3d6')).toEqual(['1d6', '2d6', '3d6']);
  });

  it('reads a hyphen as well as the en-dash the book prints', () => {
    expect(damageDiceOptions('1-3d6')).toEqual(['1d6', '2d6', '3d6']);
  });

  it('carries a modifier onto every option', () => {
    expect(damageDiceOptions('1–2d6+1')).toEqual(['1d6+1', '2d6+1']);
  });

  it('offers nothing for damage that is already one expression', () => {
    // These are rollable as they stand, and each is a shape the parser has been
    // wrong about before.
    for (const damage of ['2d6', '2d6+1', 'Str+d4', 'Str+d4+1', '2d6–1']) {
      expect(damageDiceOptions(damage), damage).toEqual([]);
      expect(isRollableDamage(damage), damage).toBe(true);
    }
  });

  it('agrees with isRollableDamage about which is which', () => {
    // Every damage the sheet refuses to roll as one expression must have options
    // to offer instead, or the cell falls back to dead text.
    expect(isRollableDamage('1–3d6')).toBe(false);
    expect(damageDiceOptions('1–3d6').length).toBeGreaterThan(0);
  });

  it('refuses a nonsensical range rather than emitting a hundred buttons', () => {
    expect(damageDiceOptions('3–1d6')).toEqual([]);
    expect(damageDiceOptions('1–99d6')).toEqual([]);
  });
});
