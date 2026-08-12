import { describe, expect, it } from 'vitest';
import { BLACK_JOKER, COLOR_JOKER, type Card } from '../src/game/cards.js';
import {
  HAND_CATEGORIES,
  bestHand,
  compareHands,
  describeHand,
  parseCard,
} from '../src/rules/poker.js';

const hand = (text: string): Card[] => text.split(/\s+/).map(parseCard);
const categoryOf = (cards: Card[]) => bestHand(cards).category;

describe('hand categories', () => {
  it.each([
    ['AS KS QS JS 10S', 'Straight Flush'],
    ['5C 4C 3C 2C AC', 'Straight Flush'], // the wheel, as a flush
    ['9H 9C 9D 9S 2C', 'Four of a Kind'],
    ['8H 8C 8D 3S 3C', 'Full House'],
    ['AH JH 9H 5H 2H', 'Flush'],
    ['9H 8C 7D 6S 5C', 'Straight'],
    ['AS KH QD JC 10S', 'Straight'],
    ['5H 4C 3D 2S AC', 'Straight'], // ace plays low
    ['QH QC QD 7S 2C', 'Three of a Kind'],
    ['KH KC 4D 4S 9C', 'Two Pair'],
    ['7H 7C AD 5S 2C', 'Pair'],
    ['AH JC 9D 5S 3C', 'High Card'],
  ])('%s is a %s', (cards, expected) => {
    expect(categoryOf(hand(cards))).toBe(expected);
  });

  it('does not read K-A-2-3-4 as a straight', () => {
    expect(categoryOf(hand('KH AC 2D 3S 4C'))).toBe('High Card');
  });
});

describe('ordering', () => {
  it('ranks the categories in the conventional order', () => {
    const examples: [string, string][] = [
      ['High Card', 'AH JC 9D 5S 3C'],
      ['Pair', '7H 7C AD 5S 2C'],
      ['Two Pair', 'KH KC 4D 4S 9C'],
      ['Three of a Kind', 'QH QC QD 7S 2C'],
      ['Straight', '9H 8C 7D 6S 5C'],
      ['Flush', 'AH JH 9H 5H 2H'],
      ['Full House', '8H 8C 8D 3S 3C'],
      ['Four of a Kind', '9H 9C 9D 9S 2C'],
      ['Straight Flush', 'AS KS QS JS 10S'],
    ];
    for (let i = 1; i < examples.length; i++) {
      const better = bestHand(hand(examples[i]![1]));
      const worse = bestHand(hand(examples[i - 1]![1]));
      expect(compareHands(better, worse)).toBeGreaterThan(0);
    }
    // And the order asserted above is the order the category list declares.
    expect(examples.map(([c]) => c)).toEqual(HAND_CATEGORIES.slice(0, 9));
  });

  it('breaks ties within a category', () => {
    const higherPair = bestHand(hand('KH KC 4D 7S 9C'));
    const lowerPair = bestHand(hand('QH QC 4D 7S 9C'));
    expect(compareHands(higherPair, lowerPair)).toBeGreaterThan(0);

    // Same pair, better kicker.
    const goodKicker = bestHand(hand('KH KC AD 7S 9C'));
    expect(compareHands(goodKicker, higherPair)).toBeGreaterThan(0);

    // Identical hands in different suits tie — poker does not rank suits.
    expect(compareHands(bestHand(hand('KH KC 4D 7S 9C')), higherPair)).toBe(0);
  });

  it('scores the wheel as five-high, below a six-high straight', () => {
    expect(compareHands(bestHand(hand('6H 5C 4D 3S 2C')), bestHand(hand('5H 4C 3D 2S AC'))))
      .toBeGreaterThan(0);
  });
});

describe('more than five cards', () => {
  it('takes the flush over the trips it has to break up to get it', () => {
    // Five hearts, and three kings if you keep KH back. The flush wins.
    const seven = hand('AH KH 9H 5H 2H KC KD');
    const result = bestHand(seven);
    expect(result.category).toBe('Flush');
    expect(result.cards.every((c) => c.suit === 'HEARTS')).toBe(true);
  });

  it('finds a straight spread across seven cards', () => {
    expect(categoryOf(hand('2C 9H 8C 7D 6S 5C KD'))).toBe('Straight');
  });

  it('scores only five cards, never six', () => {
    expect(bestHand(hand('AH KH QH JH 10H 9H')).cards).toHaveLength(5);
  });
});

describe('wild jokers', () => {
  it('ignores jokers when they are not wild', () => {
    const cards = [...hand('AH KH QH JH 10H'), COLOR_JOKER];
    expect(bestHand(cards).category).toBe('Straight Flush');
  });

  it('refuses a hand that is short once jokers are excluded', () => {
    expect(() => bestHand([...hand('AH KH QH JH'), COLOR_JOKER])).toThrow(/not enough non-joker/);
  });

  it('completes a straight flush', () => {
    const cards = [...hand('AS KS QS JS'), COLOR_JOKER];
    const result = bestHand(cards, { wildJokers: true });
    expect(result.category).toBe('Straight Flush');
    expect(describeHand(result)).toContain('→');
  });

  it('makes five of a kind, which only wilds can', () => {
    const cards = [...hand('9H 9C 9D 9S'), BLACK_JOKER];
    expect(bestHand(cards, { wildJokers: true }).category).toBe('Five of a Kind');
  });

  it('picks the best use of two wilds', () => {
    const cards = [...hand('7H 7C 7D'), COLOR_JOKER, BLACK_JOKER];
    expect(bestHand(cards, { wildJokers: true }).category).toBe('Five of a Kind');
  });

  it('never scores worse with a wild than the same hand without it', () => {
    const natural = bestHand(hand('AH KH 9H 5H 2H'));
    const wild = bestHand([...hand('AH KH 9H 5H'), COLOR_JOKER], { wildJokers: true });
    expect(compareHands(wild, natural)).toBeGreaterThanOrEqual(0);
  });

  it('reports what was drawn alongside what was scored', () => {
    const cards = [...hand('AS KS QS JS'), COLOR_JOKER];
    const result = bestHand(cards, { wildJokers: true });
    expect(result.drawn).toHaveLength(5);
    expect(result.drawn.some((c) => c.rank === 15)).toBe(true);
    expect(result.cards.some((c) => c.rank === 15)).toBe(false);
  });
});

/**
 * The strongest check available without an oracle: enumerate every one of the
 * 2,598,960 five-card hands and compare the category counts to the published
 * figures. Any misclassification — a straight the wheel logic misses, a flush
 * counted as a straight flush — shifts a count and fails this.
 */
describe('exhaustive enumeration', () => {
  it('classifies all C(52,5) hands with the textbook frequencies', () => {
    const deck: Card[] = [];
    for (const suit of ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'] as const) {
      for (let rank = 2; rank <= 14; rank++) deck.push({ suit, rank });
    }

    const tally = new Map<string, number>();
    const five: Card[] = new Array(5);
    for (let a = 0; a < 48; a++) {
      five[0] = deck[a]!;
      for (let b = a + 1; b < 49; b++) {
        five[1] = deck[b]!;
        for (let c = b + 1; c < 50; c++) {
          five[2] = deck[c]!;
          for (let d = c + 1; d < 51; d++) {
            five[3] = deck[d]!;
            for (let e = d + 1; e < 52; e++) {
              five[4] = deck[e]!;
              const category = bestHand(five).category;
              tally.set(category, (tally.get(category) ?? 0) + 1);
            }
          }
        }
      }
    }

    expect(Object.fromEntries(tally)).toEqual({
      'Straight Flush': 40,
      'Four of a Kind': 624,
      'Full House': 3744,
      Flush: 5108,
      Straight: 10200,
      'Three of a Kind': 54912,
      'Two Pair': 123552,
      Pair: 1098240,
      'High Card': 1302540,
    });
  }, 120_000);
});

describe('parseCard', () => {
  it('round-trips through describeHand', () => {
    expect(describeHand(bestHand(hand('AS KS QS JS 10S')))).toBe('Straight Flush [A♠ K♠ Q♠ J♠ 10♠]');
  });

  it('rejects nonsense', () => {
    expect(() => parseCard('1S')).toThrow(/not a card/);
    expect(() => parseCard('AX')).toThrow(/not a card/);
  });
});
