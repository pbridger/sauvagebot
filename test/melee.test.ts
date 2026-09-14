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
  UNARMED_DEFENDER,
  WILD_ATTACK,
  gangUpMod,
  meleeTotal,
  unarmedDefenderMod,
  wildAttackDamage,
  wildAttackMod,
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
    expect(wildAttackMod(true)?.value).toBe(WILD_ATTACK);
    expect(wildAttackDamage(true)).toBe(WILD_ATTACK);
  });

  it('does nothing when it is not declared', () => {
    expect(wildAttackMod(false)).toBeUndefined();
    expect(wildAttackDamage(false)).toBe(0);
  });

  /**
   * Vulnerable is the cost and is deliberately not applied here: it is a
   * condition on the attacker that outlives the roll, and nothing on this path
   * edits the attacker.
   */
  it('says what it costs rather than charging it', () => {
    expect(wildAttackMod(true)?.note).toMatch(/Vulnerable until the end of your next turn/);
  });
});

describe('an unarmed defender', () => {
  it("is worth the book's two points to an armed attacker", () => {
    expect(unarmedDefenderMod(true)?.value).toBe(UNARMED_DEFENDER);
    expect(unarmedDefenderMod(false)).toBeUndefined();
  });
});

describe('a whole melee attack', () => {
  it('sums what is declared and nothing that is not', () => {
    const { total, mods } = meleeTotal({ gangUp: 2, wild: true, unarmedFoe: true });
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
