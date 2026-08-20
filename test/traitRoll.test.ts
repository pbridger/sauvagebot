import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JavaRandom } from '../src/dice/javaRandom.js';
import { parseArchetypeCards } from '../src/rules/importArchetypeCard.js';
import {
  rollAttribute,
  rollSkill,
  rollTrait,
  totalsOf,
  traitExpression,
} from '../src/rules/traitRoll.js';

const reggie = parseArchetypeCards(
  readFileSync(fileURLToPath(new URL('./fixtures/reggie-kane.html', import.meta.url)), 'utf8'),
)[0]!;

describe('trait expressions', () => {
  it('uses the bot’s own syntax, so players see familiar output', () => {
    expect(traitExpression({ die: 8, wildCard: true })).toBe('s8');
    expect(traitExpression({ die: 8, mod: 1, wildCard: true })).toBe('s8+1');
    expect(traitExpression({ die: 4, mod: -2, wildCard: true })).toBe('s4-2');
    expect(traitExpression({ die: 6, mod: 0, wildCard: false })).toBe('e6');
  });
});

describe('rolling off a sheet', () => {
  it('rolls a trained skill at its die', () => {
    const { expression } = rollSkill(reggie, 'Shooting', 0, new JavaRandom(1));
    expect(expression).toBe('s8');
  });

  it('rolls an untrained skill at d4−2', () => {
    expect(rollSkill(reggie, 'Piloting', 0, new JavaRandom(1)).expression).toBe('s4-2');
  });

  it('folds a situational modifier in with the trait modifier', () => {
    expect(rollSkill(reggie, 'Shooting', -2, new JavaRandom(1)).expression).toBe('s8-2');
    expect(rollAttribute(reggie, 'vigor', 1, new JavaRandom(1)).expression).toBe('s6+1');
  });

  it('gives an Extra no Wild Die', () => {
    const extra = { ...reggie, wildCard: false };
    expect(rollSkill(extra, 'Fighting', 0, new JavaRandom(1)).expression).toBe('e8');
  });

  it('produces the engine’s explanation, showing both dice for a Wild Card', () => {
    const { explained } = rollTrait({ die: 8, wildCard: true }, new JavaRandom(42));
    // e.g. "s8: [5; w3] = **5**" — the shape the bot has always produced.
    expect(explained).toMatch(/^s8:/);
    expect(explained).toMatch(/w\d/);
    expect(explained).toMatch(/\*\*-?\d+\*\*/);
  });

  it('is deterministic for a seed, exactly as the bot is', () => {
    const a = rollTrait({ die: 8, mod: 1, wildCard: true }, new JavaRandom(7)).explained;
    const b = rollTrait({ die: 8, mod: 1, wildCard: true }, new JavaRandom(7)).explained;
    expect(a).toBe(b);
  });
});

/**
 * `"Rate of Fire is how many Shooting dice you roll when firing that weapon"` —
 * p147. The engine has always been able to do this; nothing had asked it to.
 */
describe('firing more than one shot', () => {
  it('leaves a single die spelled exactly as it was', () => {
    expect(traitExpression({ die: 8, wildCard: true })).toBe('s8');
    expect(traitExpression({ die: 8, wildCard: true, count: 1 })).toBe('s8');
    expect(traitExpression({ die: 8, mod: -2, wildCard: false, count: 1 })).toBe('e8-2');
  });

  it('counts the dice when there are more', () => {
    expect(traitExpression({ die: 8, wildCard: true, count: 3 })).toBe('3s8');
    expect(traitExpression({ die: 8, mod: 1, wildCard: true, count: 3 })).toBe('3s8+1');
    expect(traitExpression({ die: 6, mod: -2, wildCard: false, count: 2 })).toBe('2e6-2');
  });

  /**
   * Three trait dice plus the Wild Die, lowest dropped — which is the rule:
   * "the Wild Die can take the place of a Shooting die if it winds up rolling
   * higher. They still can't hit more targets than the weapon's Rate of Fire."
   */
  it('reports one total per shot, not per die rolled', () => {
    const result = rollTrait({ die: 8, mod: 1, wildCard: true, count: 3 }, new JavaRandom(34));
    expect(totalsOf(result.explained)).toHaveLength(3);
  });

  it('reports one total for an ordinary roll', () => {
    const result = rollTrait({ die: 8, wildCard: true }, new JavaRandom(34));
    expect(totalsOf(result.explained)).toHaveLength(1);
  });

  /**
   * The trap: the engine bolds its raise counts as well as its totals, so
   * `**10** (success; **1** raise)` has two bold numbers and one total.
   */
  it('does not mistake a bolded raise count for a total', () => {
    const line =
      '3s8+1: [6; 6; 8+3; w6+3] + 1 = **7** (success), **10** (success; **1** raise), ' +
      '**12** (success; **2** raises)';
    expect(totalsOf(line)).toEqual([7, 10, 12]);
  });

  it('reads a negative total', () => {
    expect(totalsOf('e4-2: [1] - 2 = **-1**')).toEqual([-1]);
  });

  /** Nothing to read rather than a wrong guess. */
  it('gives up on a line with no result at all', () => {
    expect(totalsOf('s8: could not parse')).toEqual([]);
    expect(totalsOf('')).toEqual([]);
  });
});
