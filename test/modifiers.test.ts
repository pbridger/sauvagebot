import { describe, expect, it } from 'vitest';
import {
  MANUAL_RANGE,
  SITUATIONS,
  clearModifiers,
  describeMods,
  formatMod,
  hasCondition,
  setManualMod,
  situationalTotal,
  situationsOf,
  toggleCondition,
} from '../src/rules/modifiers.js';
import { isTokenState, newTokenState, type TokenState } from '../src/obr/binding.js';
import { rollBreakdown, statusMods, traitPenalty } from '../src/rules/status.js';

const state = (over: Partial<TokenState> = {}): TokenState => ({
  ...newTokenState('reggie'),
  ...over,
});

describe('the condition list', () => {
  it('carries the values the book prints', () => {
    const value = (key: string): number | undefined =>
      SITUATIONS.find((s) => s.key === key)?.value;
    // Illumination, p157.
    expect(value('dim')).toBe(-2);
    expect(value('dark')).toBe(-4);
    expect(value('pitch')).toBe(-6);
    // Unstable Platform p165, Distracted p154, Running p151.
    expect(value('unstable')).toBe(-2);
    expect(value('distracted')).toBe(-2);
    expect(value('running')).toBe(-2);
  });

  it('holds nothing that depends on the target of one attack', () => {
    // Cover, The Drop, Gang Up and Range belong to a single attack against a
    // single target. Left standing on a character they would follow them into
    // their next Notice roll — see the module comment.
    const labels = SITUATIONS.map((s) => s.label.toLowerCase()).join(' ');
    for (const excluded of ['cover', 'drop', 'gang up', 'range', 'called shot']) {
      expect(labels, excluded).not.toContain(excluded);
    }
  });

  it('gives every condition a note saying where it comes from', () => {
    for (const situation of SITUATIONS) {
      expect(situation.note.length, situation.key).toBeGreaterThan(20);
    }
  });
});

describe('setting conditions', () => {
  it('toggles one on and off', () => {
    const dark = toggleCondition(state(), 'dark');
    expect(hasCondition(dark, 'dark')).toBe(true);
    expect(situationalTotal(dark)).toBe(-4);
    expect(hasCondition(toggleCondition(dark, 'dark'), 'dark')).toBe(false);
  });

  it('replaces rather than stacks within a group', () => {
    // You cannot be in Dim light and Pitch Darkness at once; summing them to −8
    // would be a quiet wrong answer.
    const lit = toggleCondition(toggleCondition(state(), 'dim'), 'pitch');
    expect(situationsOf(lit).map((s) => s.key)).toEqual(['pitch']);
    expect(situationalTotal(lit)).toBe(-6);
  });

  it('sums across different groups', () => {
    const rough = toggleCondition(toggleCondition(state(), 'dark'), 'unstable');
    expect(situationalTotal(rough)).toBe(-6);
  });

  it('ignores a key it does not know', () => {
    expect(toggleCondition(state(), 'nonsense')).toEqual(state());
    expect(situationsOf({ conditions: ['nonsense'] })).toEqual([]);
  });

  it('adds the manual dial on top, clamped', () => {
    expect(setManualMod(state(), 2).mod).toBe(2);
    expect(setManualMod(state(), 99).mod).toBe(MANUAL_RANGE);
    expect(setManualMod(state(), -99).mod).toBe(-MANUAL_RANGE);
    expect(situationalTotal(setManualMod(toggleCondition(state(), 'dim'), 1))).toBe(-1);
  });

  it('clears everything at once, which is what keeps a stale -4 from riding along', () => {
    const messy = setManualMod(toggleCondition(state(), 'dark'), -2);
    expect(situationalTotal(clearModifiers(messy))).toBe(0);
  });

  it('is nothing at all when never set', () => {
    expect(situationalTotal(state())).toBe(0);
    expect(situationalTotal(undefined)).toBe(0);
  });
});

describe('formatting', () => {
  it('signs a modifier and shows nothing for zero', () => {
    expect(formatMod(2)).toBe('+2');
    expect(formatMod(-2)).toBe('-2');
    expect(formatMod(0)).toBe('');
  });

  it('itemises a breakdown', () => {
    expect(
      describeMods([
        { label: '2 wounds', value: -2, kind: 'status' },
        { label: 'Dark', value: -4, kind: 'situational' },
      ]),
    ).toBe('2 wounds -2, Dark -4');
  });
});

/**
 * The breakdown is what a trait button labels itself with *and* what it rolls.
 * They used to be computed separately, which is a disagreement nobody sees.
 */
describe('the whole breakdown', () => {
  it('adds the red half to the green half', () => {
    const hurt = toggleCondition(state({ wounds: 2, fatigue: 1 }), 'dark');
    const breakdown = rollBreakdown(hurt);
    expect(breakdown.status).toBe(-3);
    expect(breakdown.situational).toBe(-4);
    expect(breakdown.total).toBe(-7);
  });

  it('never disagrees with traitPenalty about the status half', () => {
    for (const wounds of [0, 1, 2, 3, 4]) {
      for (const fatigue of [0, 1, 2, 3]) {
        const s = state({ wounds, fatigue });
        expect(rollBreakdown(s).status, `${wounds}w ${fatigue}f`).toBe(traitPenalty(s));
        expect(statusMods(s).reduce((sum, m) => sum + m.value, 0)).toBe(traitPenalty(s));
      }
    }
  });

  it('names each part so the sheet and log can colour it', () => {
    const parts = rollBreakdown(
      setManualMod(toggleCondition(state({ wounds: 1, fatigue: 2 }), 'unstable'), 1),
    ).parts;
    expect(parts).toEqual([
      { label: '1 wound', value: -1, kind: 'status' },
      { label: 'Exhausted', value: -2, kind: 'status' },
      { label: 'Unstable Platform', value: -2, kind: 'situational' },
      { label: 'Modifier', value: 1, kind: 'situational' },
    ]);
  });

  it('is empty for a character with no token bound', () => {
    expect(rollBreakdown(undefined)).toEqual({
      status: 0,
      situational: 0,
      total: 0,
      parts: [],
    });
  });
});

/**
 * Paul's room has tokens bound since before any of this existed. A guard that
 * required the new fields would reject those bindings, and every wound on the
 * map would appear to vanish.
 */
describe('tokens bound before modifiers existed', () => {
  it('still validates without the new fields', () => {
    expect(isTokenState({ sheetId: 'reggie', wounds: 2, fatigue: 0, shaken: true })).toBe(true);
  });

  it('validates with them', () => {
    expect(isTokenState({ ...state(), mod: -1, conditions: ['dark'] })).toBe(true);
  });

  it('rejects a malformed one', () => {
    expect(isTokenState({ ...state(), mod: 'lots' })).toBe(false);
    expect(isTokenState({ ...state(), conditions: [4] })).toBe(false);
  });
});
