import { describe, expect, it } from 'vitest';
import {
  GM_WILD_CARD_BENNIES,
  NoBenniesError,
  STARTING_BENNIES,
  award,
  jokersWild,
  marshalPool,
  spend,
  startOfSession,
} from '../src/rules/bennies.js';

/**
 * Checked against DLWW_Core_player_extract.pdf p141–142 rather than memory —
 * which matters here, because the module this replaced was built from memory
 * and was wrong about the mechanic entirely.
 */
describe('starting a session', () => {
  it('gives every Wild Card three', () => {
    expect(STARTING_BENNIES).toBe(3);
    expect(startOfSession()).toBe(3);
  });

  it('does not carry unused ones over — use them or lose them', () => {
    // Not `previous + 3`: the count is replaced outright.
    expect(startOfSession()).toBe(3);
  });

  it('adds an Edge bonus such as Luck', () => {
    expect(startOfSession(1)).toBe(4);
    expect(startOfSession(2)).toBe(5);
  });

  it('gives the Marshal one per player character', () => {
    expect(marshalPool(4)).toBe(4);
    expect(marshalPool(0)).toBe(0);
    expect(marshalPool(-2)).toBe(0);
  });

  it('gives a GM Wild Card two of their own', () => {
    expect(GM_WILD_CARD_BENNIES).toBe(2);
  });
});

describe('spending', () => {
  it('takes one', () => {
    expect(spend(3)).toBe(2);
    expect(spend(3, 2)).toBe(1);
  });

  it('refuses to go negative', () => {
    expect(() => spend(0)).toThrow(NoBenniesError);
    expect(() => spend(1, 2)).toThrow(NoBenniesError);
  });

  it('awards', () => {
    expect(award(2)).toBe(3);
    expect(award(2, 3)).toBe(5);
  });
});

describe("Joker's Wild", () => {
  const table = new Map([
    ['reggie', 3],
    ['jed', 1],
    ['paige', 0],
  ]);

  it('gives every player character one when a Joker is dealt', () => {
    expect([...jokersWild(table, true)]).toEqual([
      ['reggie', 4],
      ['jed', 2],
      ['paige', 1],
    ]);
  });

  it('gives nothing when no Joker came up', () => {
    expect([...jokersWild(table, false)]).toEqual([...table]);
  });

  it('gives one each, not one per Joker', () => {
    // "If two Jokers come up the party still only gets one though!" — so the
    // caller passes a single flag, and two Jokers cannot pay out twice.
    const once = jokersWild(table, true);
    expect(once.get('reggie')).toBe(4);
  });

  it('does not mutate the counts it was given', () => {
    jokersWild(table, true);
    expect(table.get('reggie')).toBe(3);
  });
});
