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

/**
 * Gear as the books actually write it. Every case here was a weapon the sheet
 * showed as an inert item — see MECHANICS-INVENTORY.md §5.
 */
describe('weapons written the way books write them', () => {
  /**
   * The whole of Coffin Rock. A book's column heading already said what the
   * numbers are, so the entry does not repeat it — and requiring the word
   * "Range" meant *every weapon in the adventure* parsed as a plain item, with
   * no attack button and nothing for the targeting table to band a shot against.
   */
  it('reads a bare range and a bare damage', () => {
    const { weapons } = parseGear('Colt Dragoon (12/24/48, 2d6+1, shots 6, AP 1)');
    expect(weapons).toHaveLength(1);
    expect(weapons[0]).toMatchObject({ range: '12/24/48', damage: '2d6+1', ap: 1 });
  });

  /** `d6+d4` is the ordinary melee notation in Deadlands Reloaded. */
  it('reads damage made of two die groups', () => {
    expect(parseGear('Bowie Knife (d6+d4+1)').weapons[0]).toMatchObject({ damage: 'd6+d4+1' });
    expect(parseGear('Sledgehammer (d10+d8, Parry -1)').weapons[0]).toMatchObject({
      damage: 'd10+d8',
      notes: 'Parry -1',
    });
  });

  it('still reads the keyword form the PC cards use', () => {
    const { weapons } = parseGear('Colt Rainmaker (Range 12/24/48, damage 2d6, RoF 1, AP 1)');
    expect(weapons[0]).toMatchObject({ range: '12/24/48', damage: '2d6', rof: 1, ap: 1 });
  });

  /** A shotgun's variable damage survives as written, for the reader to pick from. */
  it('keeps a ranged damage figure intact', () => {
    expect(parseGear('double barrel shotgun (12/24/48, 1-3d6, RoF 1-2)').weapons[0]).toMatchObject({
      damage: '1-3d6',
    });
  });

  /**
   * Paige's LeMat is a revolver with a shotgun barrel under it. Read as one
   * weapon, the shotgun half vanished and the `Shots 1` left in the notes
   * belonged to it — so the pistol read as a one-shot gun.
   */
  it('splits a two-mode weapon into a row each', () => {
    const { weapons } = parseGear(
      'LeMat Revolver (pistol—Range 12/24/49, Damage 2d6, RoF 1, Shots 9 or Range; ' +
        'shotgun—Range 5/10/20, Damage 1-3d6, RoF 1, Shots 1)',
    );
    expect(weapons).toHaveLength(2);
    expect(weapons[0]).toMatchObject({ name: 'LeMat Revolver (pistol)', range: '12/24/49' });
    expect(weapons[1]).toMatchObject({ name: 'LeMat Revolver (shotgun)', range: '5/10/20', damage: '1-3d6' });
  });

  /** A semicolon between a stat and a note is not two weapons. */
  it('does not split armour that merely has a semicolon in it', () => {
    const { armor, weapons } = parseGear(
      'armored vest (+2; subtract 2 from bullet damage before applying AP)',
    );
    expect(weapons).toHaveLength(0);
    expect(armor[0]?.name).toBe('armored vest');
  });

  /** Still not a weapon just because it carries a bonus. */
  it('leaves a badge alone', () => {
    const { weapons, items } = parseGear('Agency badge (+1 Persuasion to lawful types)');
    expect(weapons).toHaveLength(0);
    expect(items[0]?.name).toBe('Agency badge');
  });

  /**
   * Natural weapons reach the attack list the same way anything else does — by
   * being written on the gear line. A creature's `Claws: d6+d4` can be copied
   * across as `Claws (d6+d4)` and it becomes an attack with no new machinery.
   */
  it('reads a natural weapon typed in as gear', () => {
    const { weapons } = parseGear('Claws (d6+d4), Bloody Mud Blast (2/4/8, 2d6)');
    expect(weapons.map((w) => w.name)).toEqual(['Claws', 'Bloody Mud Blast']);
    expect(weapons[1]).toMatchObject({ range: '2/4/8', damage: '2d6' });
  });
});
