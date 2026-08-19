import { describe, expect, it } from 'vitest';
import { newTokenState, type TokenState } from '../src/obr/binding.js';
import {
  MAX_FATIGUE,
  MAX_WOUNDS_EXTRA,
  MAX_WOUNDS_WILD_CARD,
  damageBadge,
  describeStatus,
  isIncapacitated,
  maxWounds,
  setFatigue,
  setShaken,
  setWounds,
  traitPenalty,
  woundLimit,
} from '../src/rules/status.js';

/** The two ordinary wound tracks, as the character rather than as a flag. */
const WILD = { wildCard: true };
const EXTRA = { wildCard: false };

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
    expect(isIncapacitated(state({ wounds: 3 }), WILD)).toBe(false);
    expect(isIncapacitated(state({ wounds: 4 }), WILD)).toBe(true);
  });

  it('takes one for an Extra', () => {
    expect(maxWounds(false)).toBe(0);
    expect(isIncapacitated(state({ wounds: 1 }), EXTRA)).toBe(true);
  });

  it('happens on fatigue too', () => {
    expect(isIncapacitated(state({ fatigue: 2 }), WILD)).toBe(false);
    expect(isIncapacitated(state({ fatigue: 3 }), WILD)).toBe(true);
  });
});

describe('clicking the track', () => {
  it('clamps to one past the maximum, which is the Incapacitated step', () => {
    expect(setWounds(state(), 9, WILD).wounds).toBe(4);
    expect(setWounds(state(), 9, EXTRA).wounds).toBe(1);
    expect(setFatigue(state(), 9).fatigue).toBe(3);
  });

  it('never goes negative', () => {
    expect(setWounds(state({ wounds: 1 }), -3, WILD).wounds).toBe(0);
    expect(setFatigue(state({ fatigue: 1 }), -3).fatigue).toBe(0);
  });

  it('leaves the binding alone', () => {
    const next = setShaken(setWounds(state(), 2, WILD), true);
    expect(next.sheetId).toBe('reggie');
    expect(next).toEqual({ sheetId: 'reggie', wounds: 2, fatigue: 0, shaken: true });
  });
});

describe('display', () => {
  it('describes the sheet status in words', () => {
    expect(describeStatus(state(), WILD)).toBe('Unharmed');
    expect(describeStatus(state({ wounds: 1 }), WILD)).toBe('1 wound');
    expect(describeStatus(state({ wounds: 2, fatigue: 1, shaken: true }), WILD)).toBe(
      '2 wounds, Fatigued, Shaken',
    );
    expect(describeStatus(state({ fatigue: 2 }), WILD)).toBe('Exhausted');
    expect(describeStatus(state({ wounds: 4 }), WILD)).toBe('Incapacitated');
  });

  it('keeps the damage badge terse', () => {
    expect(damageBadge(state(), WILD)).toBe('');
    expect(damageBadge(state({ wounds: 2 }), WILD)).toBe('2W');
    expect(damageBadge(state({ wounds: 1, fatigue: 1 }), WILD)).toBe('1W 1F');
    expect(damageBadge(state({ wounds: 1 }), EXTRA)).toBe('OUT');
  });

  it('leaves Shaken out of the damage badge, since the two are independent', () => {
    // Shaken and unwounded must still show on the token, and a wounded
    // character who is not Shaken must not look Shaken.
    expect(damageBadge(state({ shaken: true }), WILD)).toBe('');
    expect(damageBadge(state({ wounds: 2, shaken: true }), WILD)).toBe('2W');
  });
});

/**
 * Coffin Rock's Blood Men are **Henchmen**: *"Blood Men get a Wild Die as though
 * they were Wild Cards"* — the wild die without the wound track. `wildCard` was
 * one boolean deciding three separate things, and this is the smaller fix Paul
 * asked for: override the one that differs.
 */
describe('a Henchman', () => {
  const henchman = { wildCard: true, maxWounds: 0 };
  const state = { wounds: 1, fatigue: 0, shaken: false };

  it('goes down on the first wound, like an Extra', () => {
    expect(woundLimit(henchman)).toBe(0);
    expect(isIncapacitated(state, henchman)).toBe(true);
  });

  it('is not what a plain Wild Card does', () => {
    expect(woundLimit({ wildCard: true })).toBe(MAX_WOUNDS_WILD_CARD);
    expect(isIncapacitated(state, { wildCard: true })).toBe(false);
  });

  it('clamps its wound track to the override', () => {
    expect(setWounds({ ...state, wounds: 0 }, 3, henchman).wounds).toBe(1);
    expect(setWounds({ ...state, wounds: 0 }, 3, { wildCard: true }).wounds).toBe(3);
  });

  /**
   * Bennies need no help: `bennyBank` filters on `wildCard && pc`, so an NPC
   * Henchman draws none whatever this says.
   */
  it('still takes the wound penalty on its trait rolls', () => {
    expect(traitPenalty({ wounds: 1, fatigue: 0 })).toBe(-1);
  });

  /**
   * `woundLimit` takes the character, never a bare flag.
   *
   * It did accept a boolean at first, so that the call sites which only had
   * `sheet.wildCard` to hand could stay as they were — and all ten of them did,
   * which meant the override reached none of the UI. A Blood Man was
   * `maxWounds: 0` in the data and took three wounds on screen, and nothing
   * failed to compile. Requiring the sheet makes that a type error.
   */
  it('takes the character rather than a flag', () => {
    expect(woundLimit(WILD)).toBe(MAX_WOUNDS_WILD_CARD);
    expect(woundLimit(EXTRA)).toBe(MAX_WOUNDS_EXTRA);
  });
});
