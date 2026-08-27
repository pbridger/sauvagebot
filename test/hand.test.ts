import { describe, expect, it } from 'vitest';
import { card } from '../src/game/cards.js';
import { isTokenState, newTokenState } from '../src/obr/binding.js';
import {
  addToHand,
  chooseFromHand,
  chosenCard,
  clearHand,
  handOf,
  hasChoice,
  setHand,
} from '../src/rules/hand.js';

const ace = card('SPADES', 14);
const five = card('HEARTS', 5);
const nine = card('CLUBS', 9);
const fresh = () => newTokenState('paige');

describe('reading a hand', () => {
  it('is nothing at all before the deal', () => {
    expect(handOf(fresh())).toBeUndefined();
    expect(chosenCard(fresh())).toBeUndefined();
  });

  /**
   * The reason this change needed no migration: every token dealt before the
   * hand existed carries a single `card`, and reads back as a hand of one.
   */
  it('reads an older single card as a hand of one', () => {
    const legacy = { ...fresh(), card: nine };
    expect(handOf(legacy)).toEqual({ cards: [nine], chosen: 0 });
    expect(hasChoice(legacy)).toBe(false);
  });

  it('clamps an index that has gone out of range rather than showing nothing', () => {
    const broken = { ...fresh(), cards: [ace, five], chosen: 7 };
    expect(handOf(broken)!.chosen).toBe(1);
    expect(chosenCard(broken)).toEqual(five);
  });
});

describe('dealing a hand', () => {
  it('keeps every card and marks the one acted on', () => {
    const dealt = setHand(fresh(), [ace, five, nine], five);
    expect(dealt.cards).toEqual([ace, five, nine]);
    expect(dealt.chosen).toBe(1);
    expect(chosenCard(dealt)).toEqual(five);
  });

  /** Everything that reads one card — badges, turn order, the wire — reads this. */
  it('writes `card` as the chosen one, for every reader that wants a single card', () => {
    expect(setHand(fresh(), [ace, five], five).card).toEqual(five);
  });

  it('falls back to the first card if the chosen one is not in the hand', () => {
    expect(setHand(fresh(), [ace, five], nine).card).toEqual(ace);
  });

  it('replaces a previous hand outright', () => {
    const first = setHand(fresh(), [ace, five], five);
    expect(setHand(first, [nine], nine).cards).toEqual([nine]);
  });
});

/**
 * A Benny buys **one more card**, and does not choose it for you. It used to
 * re-deal the character's whole hand — two fresh cards for one chip on a Level
 * Headed character, and the old ones binned. Reported 2026-08-26.
 */
describe('adding a card', () => {
  it('appends without disturbing what they are acting on', () => {
    const dealt = setHand(fresh(), [five], five);
    const after = addToHand(dealt, ace);
    expect(after.cards).toEqual([five, ace]);
    expect(chosenCard(after)).toEqual(five);
  });

  /**
   * Even when the new card is plainly better. Choosing is the player's, and an
   * app that pre-empts them is the same bug in a politer form — Paige has
   * Calculating, and may well want to stay on the five.
   */
  it('does not switch to the new card just because it is higher', () => {
    expect(chosenCard(addToHand(setHand(fresh(), [five], five), ace))).toEqual(five);
  });

  it('starts a hand for a combatant holding nothing', () => {
    const after = addToHand(fresh(), nine);
    expect(after.cards).toEqual([nine]);
    expect(chosenCard(after)).toEqual(nine);
  });

  it('makes a choice available where there was none', () => {
    expect(hasChoice(setHand(fresh(), [five], five))).toBe(false);
    expect(hasChoice(addToHand(setHand(fresh(), [five], five), ace))).toBe(true);
  });
});

describe('choosing from a hand', () => {
  const dealt = () => setHand(fresh(), [ace, five, nine], ace);

  it('moves what they act on, and `card` with it', () => {
    const after = chooseFromHand(dealt(), 2);
    expect(after.chosen).toBe(2);
    expect(after.card).toEqual(nine);
  });

  it('keeps every card, so the choice can be changed again', () => {
    expect(chooseFromHand(dealt(), 1).cards).toEqual([ace, five, nine]);
  });

  it('ignores an index that is not in the hand', () => {
    expect(chooseFromHand(dealt(), 9)).toEqual(dealt());
    expect(chooseFromHand(dealt(), -1)).toEqual(dealt());
  });

  it('does nothing to a combatant with no cards', () => {
    expect(chooseFromHand(fresh(), 0)).toEqual(fresh());
  });
});

describe('clearing a hand', () => {
  it('takes all three fields off, so the fight is really over', () => {
    const after = clearHand(setHand(fresh(), [ace, five], ace));
    expect(after.cards).toBeUndefined();
    expect(after.chosen).toBeUndefined();
    expect(after.card).toBeUndefined();
    expect(handOf(after)).toBeUndefined();
  });

  it('leaves the binding and the wounds alone', () => {
    const wounded = { ...setHand(fresh(), [ace], ace), wounds: 2 };
    const after = clearHand(wounded);
    expect(after.sheetId).toBe('paige');
    expect(after.wounds).toBe(2);
  });
});

describe('the token guard', () => {
  it('accepts a hand', () => {
    const dealt = setHand(fresh(), [ace, five], five);
    expect(isTokenState(JSON.parse(JSON.stringify(dealt)))).toBe(true);
  });

  it('rejects a hand that is not cards', () => {
    expect(isTokenState({ ...fresh(), cards: ['nope'] })).toBe(false);
    expect(isTokenState({ ...fresh(), cards: [ace], chosen: 'first' })).toBe(false);
  });
});
