/**
 * Critical Failure, and the places it changes what the app commits.
 *
 * p6: *"If a Wild Card rolls a 1 on both their Trait and Wild Die, they suffer a
 * Critical Failure."* p140: *"The attempt automatically fails… Critical Failures
 * cannot be rerolled, even with Bennies."*
 */
import { describe, expect, it } from 'vitest';
import { CRITICAL_MARK, criticalFailure, markCritical, rollTrait, totalsOf } from '../src/rules/traitRoll.js';
import { JavaRandom } from '../src/dice/javaRandom.js';
import { totalOf } from '../src/obr/rollLog.js';
import { resolveAimedAttack } from '../src/rules/targeting.js';
import { resoak, soak } from '../src/rules/damage.js';
import { newTokenState } from '../src/obr/binding.js';
import { soakBreakdown } from '../src/rules/status.js';
import type { DieEvent } from '../src/dice/roller.js';

const die = (value: number, role: DieEvent['role'], step = 0) => ({ value, role, step });

describe('spotting a Critical Failure', () => {
  /** Seed 4128 rolls `s4+2: [1; w1] + 2 = **3**` — the case that used to pass silently. */
  it('sees snake eyes from the real engine', () => {
    const roll = rollTrait({ die: 4, mod: 2, wildCard: true }, new JavaRandom(4128));
    expect(roll.explained).toContain('[1; w1]');
    expect(criticalFailure(roll.dice)).toBe(true);
  });

  it('needs the Wild Die to be a 1 as well', () => {
    expect(criticalFailure([die(1, 'trait'), die(5, 'wild')])).toBe(false);
    expect(criticalFailure([die(4, 'trait'), die(1, 'wild')])).toBe(false);
  });

  /** p140's Gatling: three Shooting dice and the Wild Die, three ones or more. */
  it('takes more than half across several dice, Wild Die included', () => {
    expect(criticalFailure([die(1, 'trait'), die(1, 'trait'), die(6, 'trait'), die(1, 'wild')])).toBe(true);
    expect(criticalFailure([die(1, 'trait'), die(1, 'trait'), die(6, 'trait'), die(3, 'wild')])).toBe(false);
  });

  /** The 1 an ace bought is the end of a die that exploded, not a die that came up 1. */
  it('ignores the dice an ace bought', () => {
    expect(criticalFailure([die(4, 'trait'), die(1, 'trait', 1), die(1, 'wild')])).toBe(false);
  });

  /** No Wild Die, no Critical Failure — an Extra's is the Marshal's call (p140). */
  it('never fires for an Extra', () => {
    expect(criticalFailure([die(1, 'trait')])).toBe(false);
  });
});

describe('what a Critical Failure says', () => {
  it('takes the engine\'s success off and leaves the total readable', () => {
    const marked = markCritical('s4+6: [1; w1] + 6 = **7** (success)');
    expect(marked).not.toContain('success');
    expect(marked).toContain(CRITICAL_MARK);
    expect(totalOf(marked)).toBe(7);
    expect(totalsOf(marked)).toEqual([7]);
  });
});

describe('an attack that Critically Fails', () => {
  it('misses whatever the total', () => {
    const hit = resolveAimedAttack({ total: 9, target: 5, targetBonus: 2 });
    expect(hit.hit).toBe(true);
    const crit = resolveAimedAttack({ total: 9, target: 5, targetBonus: 2, critical: true });
    expect(crit.hit).toBe(false);
    expect(crit.raises).toBe(0);
  });
});

describe('a Soak that Critically Fails', () => {
  /** p150: *"A Critical Failure increases the victim's Wound level by one."* */
  it('adds a wound and closes the window', () => {
    const hit = { ...newTokenState('s'), wounds: 2, shaken: true, soakable: 2 };
    const after = soak(hit, 9, 2, true);
    expect(after.wounds).toBe(3);
    expect(after.shaken).toBe(true);
    expect(after.soakable).toBeUndefined();
  });
});

describe('rerolling a Soak with a Benny', () => {
  const hit = { ...newTokenState('s'), wounds: 2, shaken: true, soakable: 2 };

  /** It replaces the first Soak rather than soaking a second time on top. */
  it('replaces the first result', () => {
    const first = soak(hit, 2, 2); // failed: 2 wounds stay
    const second = resoak(hit, first, first, 8, 2); // raise: both soaked
    expect(second.wounds).toBe(0);
    expect(second.shaken).toBe(false);
  });

  it('puts the Shaken back when the reroll does worse', () => {
    const first = soak(hit, 8, 2); // both soaked, Shaken cleared
    const second = resoak(hit, first, first, 5, 2); // one soaked
    expect(second.wounds).toBe(1);
    expect(second.shaken).toBe(true);
  });

  it('keeps whatever happened to the token in between', () => {
    const first = soak(hit, 2, 2); // 2 wounds
    const meanwhile = { ...first, wounds: 3 }; // hit again before the reroll
    expect(resoak(hit, first, meanwhile, 5, 2).wounds).toBe(2);
  });
});

describe('the modifiers a Soak takes', () => {
  /** Nobody soaks a bullet worse in the dark, and a Soak is not an action. */
  it('leaves out the dark, running and multi-actions', () => {
    const state = { wounds: 1, fatigue: 0, conditions: ['dark', 'running', 'multi2'] };
    expect(soakBreakdown(state).total).toBe(-1);
  });

  it('keeps Distracted, Fatigue, the earlier wounds and the hand dial', () => {
    const state = { wounds: 1, fatigue: 1, mod: -1, conditions: ['distracted'] };
    expect(soakBreakdown(state).total).toBe(-1 - 1 - 2 - 1);
  });
});

/**
 * The Joker: `"…add +2 to all Trait and damage rolls this round!"` — p145. Read
 * off the card being acted on, which is what ends it: the next deal replaces it.
 */
import { JOKER_BONUS, jokerBonus } from '../src/rules/initiative.js';
import { BLACK_JOKER, COLOR_JOKER } from '../src/game/cards.js';
import { rollBreakdown } from '../src/rules/status.js';

describe('acting on a Joker', () => {
  const ace = { suit: 'spades', rank: 14 } as unknown as Parameters<typeof jokerBonus>[0];

  it('is worth +2, from either Joker', () => {
    expect(jokerBonus(BLACK_JOKER)).toBe(JOKER_BONUS);
    expect(jokerBonus(COLOR_JOKER)).toBe(JOKER_BONUS);
  });

  it('is nothing on any other card, or none', () => {
    expect(jokerBonus(ace)).toBe(0);
    expect(jokerBonus(undefined)).toBe(0);
  });

  it('reaches every trait roll through the breakdown, and Soak', () => {
    const state = { wounds: 1, fatigue: 0, card: BLACK_JOKER };
    const mods = rollBreakdown(state);
    expect(mods.total).toBe(-1 + JOKER_BONUS);
    expect(mods.parts.at(-1)).toMatchObject({ label: 'Joker', value: JOKER_BONUS });
    expect(soakBreakdown(state).total).toBe(-1 + JOKER_BONUS);
  });

  /** The next round's deal replaces the card, and the bonus goes with it. */
  it('ends when the card does', () => {
    expect(rollBreakdown({ wounds: 0, fatigue: 0 }).total).toBe(0);
  });
});

/** Elan: +2 to a Benny reroll of a trait, Soak included. */
import { ELAN_BONUS, hasElan, raisedBy } from '../src/rules/traitRoll.js';

describe('Elan', () => {
  it('is read off the edge list', () => {
    expect(hasElan([{ name: 'ELAN' }])).toBe(true);
    expect(hasElan([{ name: 'Elan' }, { name: 'Scout' }])).toBe(true);
    expect(hasElan([{ name: 'Scout' }])).toBe(false);
  });

  it('moves the modifier inside the expression, for one die or several', () => {
    expect(raisedBy('s8-1', ELAN_BONUS)).toBe('s8+1');
    expect(raisedBy('s8', ELAN_BONUS)).toBe('s8+2');
    expect(raisedBy('s6-2', ELAN_BONUS)).toBe('s6');
    expect(raisedBy('3s8-2', ELAN_BONUS)).toBe('3s8');
    expect(raisedBy('e6+1', ELAN_BONUS)).toBe('e6+3');
  });

  it('refuses an expression it does not recognise', () => {
    expect(raisedBy('2d6+1', ELAN_BONUS)).toBeUndefined();
  });
});
