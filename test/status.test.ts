import { describe, expect, it } from 'vitest';
import { newTokenState, type TokenState } from '../src/obr/binding.js';
import {
  MAX_FATIGUE,
  badgeText,
  describeStatus,
  isIncapacitated,
  maxWounds,
  setFatigue,
  setShaken,
  setWounds,
  traitPenalty,
} from '../src/rules/status.js';

const state = (over: Partial<TokenState> = {}): TokenState => ({
  ...newTokenState('reggie'),
  ...over,
});

describe('the penalty every trait roll picks up', () => {
  it('is −1 per wound and −1 per fatigue level', () => {
    expect(traitPenalty(state())).toBe(0);
    expect(traitPenalty(state({ wounds: 2 }))).toBe(-2);
    expect(traitPenalty(state({ fatigue: 1 }))).toBe(-1);
    expect(traitPenalty(state({ wounds: 2, fatigue: 1 }))).toBe(-3);
  });

  it('ignores Shaken, which restricts what you may do rather than the roll', () => {
    expect(traitPenalty(state({ shaken: true }))).toBe(0);
  });

  it('does not run away past the maximum', () => {
    expect(traitPenalty(state({ wounds: 9, fatigue: 9 }))).toBe(-(3 + MAX_FATIGUE));
  });
});

describe('incapacitation', () => {
  it('takes four wounds for a Wild Card', () => {
    expect(maxWounds(true)).toBe(3);
    expect(isIncapacitated(state({ wounds: 3 }), true)).toBe(false);
    expect(isIncapacitated(state({ wounds: 4 }), true)).toBe(true);
  });

  it('takes one for an Extra', () => {
    expect(maxWounds(false)).toBe(0);
    expect(isIncapacitated(state({ wounds: 1 }), false)).toBe(true);
  });

  it('happens on fatigue too', () => {
    expect(isIncapacitated(state({ fatigue: 2 }), true)).toBe(false);
    expect(isIncapacitated(state({ fatigue: 3 }), true)).toBe(true);
  });
});

describe('clicking the track', () => {
  it('clamps to one past the maximum, which is the Incapacitated step', () => {
    expect(setWounds(state(), 9, true).wounds).toBe(4);
    expect(setWounds(state(), 9, false).wounds).toBe(1);
    expect(setFatigue(state(), 9).fatigue).toBe(3);
  });

  it('never goes negative', () => {
    expect(setWounds(state({ wounds: 1 }), -3, true).wounds).toBe(0);
    expect(setFatigue(state({ fatigue: 1 }), -3).fatigue).toBe(0);
  });

  it('leaves the binding alone', () => {
    const next = setShaken(setWounds(state(), 2, true), true);
    expect(next.sheetId).toBe('reggie');
    expect(next).toEqual({ sheetId: 'reggie', wounds: 2, fatigue: 0, shaken: true });
  });
});

describe('display', () => {
  it('describes the sheet status in words', () => {
    expect(describeStatus(state(), true)).toBe('Unharmed');
    expect(describeStatus(state({ wounds: 1 }), true)).toBe('1 wound');
    expect(describeStatus(state({ wounds: 2, fatigue: 1, shaken: true }), true)).toBe(
      '2 wounds, Fatigued, Shaken',
    );
    expect(describeStatus(state({ fatigue: 2 }), true)).toBe('Exhausted');
    expect(describeStatus(state({ wounds: 4 }), true)).toBe('Incapacitated');
  });

  it('keeps the token badge terse', () => {
    expect(badgeText(state(), true)).toBe('');
    expect(badgeText(state({ wounds: 2 }), true)).toBe('2W');
    expect(badgeText(state({ wounds: 1, fatigue: 1, shaken: true }), true)).toBe('1W 1F !');
    expect(badgeText(state({ wounds: 1 }), false)).toBe('OUT');
  });
});
