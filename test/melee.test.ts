/**
 * The Fighting dialogue's arithmetic.
 *
 * Agreed at the table on 2026-09-12 — *"the best way of solving most of the melee
 * issues was just to get the Fighting dialogue to match the Shooting dialogue"* —
 * so these are the three modifiers a melee attack has that a shot does not.
 */
import { describe, expect, it } from 'vitest';
import {
  GANG_UP_MAX,
  SWINGS,
  TWO_WEAPONS,
  UNARMED_DEFENDER,
  WILD_ATTACK,
  costsVulnerable,
  gangUpMod,
  meleeTotal,
  swingDamage,
  swingMod,
  twoWeaponsMod,
  unarmedDefenderMod,
} from '../src/rules/melee.js';
import { calledShotMod } from '../src/rules/shot.js';

describe('ganging up', () => {
  it('is nothing at all when nobody else is in it', () => {
    expect(gangUpMod(0)).toBeUndefined();
  });

  /** *"If three gremlins attack a single hero, each of them adds +2"* — p156. */
  it('counts the additional attackers, not the crowd', () => {
    expect(gangUpMod(2)?.value).toBe(2);
  });

  it("stops at the book's cap", () => {
    expect(gangUpMod(9)?.value).toBe(GANG_UP_MAX);
  });

  /** The second half of the rule nets allies off before it gets here. */
  it('cannot go negative, however many allies are stood around the defender', () => {
    expect(gangUpMod(-3)).toBeUndefined();
  });
});

describe('a wild attack', () => {
  it('adds to the attack and to the damage, by the same amount', () => {
    expect(swingMod('wild')?.value).toBe(WILD_ATTACK);
    expect(swingDamage('wild')).toBe(WILD_ATTACK);
  });

  it('does nothing when it is not declared', () => {
    expect(swingMod('ordinary')).toBeUndefined();
    expect(swingDamage('ordinary')).toBe(0);
  });

  /** Paul, 2026-10-09: the app sets Vulnerable when a Wild Attack is rolled. */
  it('is the only swing that leaves the attacker Vulnerable', () => {
    expect(SWINGS.filter(costsVulnerable)).toEqual(['wild']);
  });
});

/**
 * `"The attacker adds +2 or +4 to any Fighting roll and subtracts a like amount
 * from damage if they hit… and can't be combined with Wild Attack."` — p165.
 */
describe('a desperate attack', () => {
  it('buys accuracy with damage, point for point', () => {
    expect(swingMod('desperate2')?.value).toBe(2);
    expect(swingDamage('desperate2')).toBe(-2);
    expect(swingMod('desperate4')?.value).toBe(4);
    expect(swingDamage('desperate4')).toBe(-4);
  });

  /** One union, so a Wild-and-Desperate attack is not a value that exists. */
  it('cannot be combined with a wild attack', () => {
    expect(meleeTotal({ swing: 'desperate4' }).mods.map((mod) => mod.key)).toEqual(['desperate']);
  });

  it('costs no Vulnerable', () => {
    expect(costsVulnerable('desperate2')).toBe(false);
    expect(costsVulnerable('desperate4')).toBe(false);
  });
});

describe('an unarmed defender', () => {
  it("is worth the book's two points to an armed attacker", () => {
    expect(unarmedDefenderMod(true)?.value).toBe(UNARMED_DEFENDER);
    expect(unarmedDefenderMod(false)).toBeUndefined();
  });
});

/** `"A character armed with two melee weapons adds +1…"` — p165. */
describe('two weapons', () => {
  it("is worth the book's one point", () => {
    expect(twoWeaponsMod(true)?.value).toBe(TWO_WEAPONS);
    expect(twoWeaponsMod(false)).toBeUndefined();
  });

  /** "if the foe has a single weapon **or is unarmed**" — so it stacks with the +2. */
  it('stacks with an unarmed foe', () => {
    expect(meleeTotal({ unarmedFoe: true, twoWeapons: true }).total).toBe(UNARMED_DEFENDER + TWO_WEAPONS);
  });

  it('says natural weapons cancel it, since nothing here can tell', () => {
    expect(twoWeaponsMod(true)?.note).toMatch(/natural weapons/);
  });
});

describe('a whole melee attack', () => {
  it('sums what is declared and nothing that is not', () => {
    const { total, mods } = meleeTotal({ gangUp: 2, swing: 'wild', unarmedFoe: true });
    expect(total).toBe(2 + WILD_ATTACK + UNARMED_DEFENDER);
    expect(mods.map((mod) => mod.key)).toEqual(['gang-up', 'wild', 'unarmed-foe']);
  });

  it('carries the wound penalty and the hand dial, as a shot does', () => {
    expect(meleeTotal({ situation: -2, dial: -1 }).total).toBe(-3);
  });

  it('takes a called shot from the same rule the shot panel uses', () => {
    const called = calledShotMod(-2);
    expect(meleeTotal({ calledShot: called }).total).toBe(called?.value);
  });

  it('is nothing when nothing is declared', () => {
    expect(meleeTotal({})).toEqual({ mods: [], total: 0 });
  });
});
