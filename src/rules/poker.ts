/**
 * Poker hand evaluation, for Huckster deals with the devil.
 *
 * Unlike everything else Deadlands-specific, this file has no edition-dependent
 * numbers in it — poker is poker. What the book decides is how many cards a
 * huckster draws and what each hand buys them; that mapping lives with the
 * hex-casting code, not here. So this can be built and pinned before the rules
 * check.
 *
 * Jokers are treated as wild when `wildJokers` is set. The black joker's
 * backlash is a casting rule, not a hand-evaluation rule, and is handled by the
 * caller — which can see the drawn cards.
 */
import { RANK_NAMES, SUITS, cardToString, type Card, type SuitName } from '../game/cards.js';

export const HAND_CATEGORIES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Five of a Kind',
] as const;

export type HandCategory = (typeof HAND_CATEGORIES)[number];

export interface HandRank {
  category: HandCategory;
  /** Category index followed by tiebreakers, comparable lexicographically. */
  score: number[];
  /** The five cards the hand was scored on — a wild joker appears as what it stood in for. */
  cards: Card[];
  /** Everything that was dealt, jokers as themselves. */
  drawn: Card[];
}

const JOKER_RANK = 15;
const NATURAL_SUITS: SuitName[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];

export function isJoker(c: Card): boolean {
  return c.rank === JOKER_RANK;
}

/** Lexicographic compare of two hands. Positive means `a` beats `b`. */
export function compareHands(a: HandRank, b: HandRank): number {
  return compareScores(a.score, b.score);
}

/** Evaluate exactly five natural (non-joker) cards. */
function rankFive(cards: Card[]): { category: HandCategory; score: number[] } {
  const ranks = cards.map((c) => c.rank).sort((x, y) => y - x);
  const flush = cards.every((c) => c.suit === cards[0]!.suit);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);

  // Group ranks by multiplicity, then by rank — the standard tiebreak order.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, n]) => n).join('');
  const byGroup = groups.map(([r]) => r);

  const distinct = [...new Set(ranks)];
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0]! - distinct[4]! === 4) straightHigh = distinct[0]!;
    // The wheel: A-2-3-4-5, where the ace plays low and the hand is five-high.
    else if (distinct[0] === 14 && distinct[1] === 5 && distinct[4] === 2) straightHigh = 5;
  }

  const of = (category: HandCategory, ...tiebreak: number[]) => ({
    category,
    score: [HAND_CATEGORIES.indexOf(category), ...tiebreak],
  });

  if (shape === '5') return of('Five of a Kind', byGroup[0]!);
  if (straightHigh && flush) return of('Straight Flush', straightHigh);
  if (shape === '41') return of('Four of a Kind', ...byGroup);
  if (shape === '32') return of('Full House', ...byGroup);
  if (flush) return of('Flush', ...ranks);
  if (straightHigh) return of('Straight', straightHigh);
  if (shape === '311') return of('Three of a Kind', ...byGroup);
  if (shape === '221') return of('Two Pair', ...byGroup);
  if (shape === '2111') return of('Pair', ...byGroup);
  return of('High Card', ...ranks);
}

function* combinations<T>(items: T[], k: number): Generator<T[]> {
  const n = items.length;
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    yield idx.map((i) => items[i]!);
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]!++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
}

function fullDeck(): Card[] {
  const out: Card[] = [];
  for (const suit of NATURAL_SUITS) for (let rank = 2; rank <= 14; rank++) out.push({ suit, rank });
  return out;
}

/**
 * Best five-card hand from any number of cards.
 *
 * Wild jokers are resolved by brute force: every joker is tried as every card in
 * the deck. That is 52^j combinations, and hucksters draw single-digit hands, so
 * the cost is trivial and the result is exactly right — which a heuristic
 * substitution would not be.
 */
export function bestHand(drawn: Card[], options: { wildJokers?: boolean } = {}): HandRank {
  if (drawn.length < 5) throw new Error(`need at least 5 cards, got ${drawn.length}`);

  const jokers = drawn.filter(isJoker);
  const naturals = drawn.filter((c) => !isJoker(c));

  if (!options.wildJokers || jokers.length === 0) {
    // A joker that is not wild cannot form part of a hand at all.
    if (naturals.length < 5) throw new Error('not enough non-joker cards to make a hand');
    return { ...pickBest(naturals), drawn };
  }

  const deck = fullDeck();
  let best: Omit<HandRank, 'drawn'> | undefined;

  const substitute = (remaining: number, pool: Card[]): void => {
    if (remaining === 0) {
      const candidate = pickBest(pool);
      if (!best || compareScores(candidate.score, best.score) > 0) best = candidate;
      return;
    }
    for (const c of deck) substitute(remaining - 1, [...pool, c]);
  };
  substitute(jokers.length, naturals);

  return { ...best!, drawn };
}

/** Best five of `pool`, which must already have every wild card substituted. */
function pickBest(pool: Card[]): Omit<HandRank, 'drawn'> {
  let best: Omit<HandRank, 'drawn'> | undefined;
  for (const five of combinations(pool, 5)) {
    const rank = rankFive(five);
    if (!best || compareScores(rank.score, best.score) > 0) best = { ...rank, cards: five };
  }
  if (!best) throw new Error('no five-card combination available');
  return best;
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function describeHand(hand: HandRank): string {
  const held = hand.drawn.map(cardToString).join(' ');
  const used = hand.cards.map(cardToString).join(' ');
  return used === held ? `${hand.category} [${used}]` : `${hand.category} [${held} → ${used}]`;
}

/** Parse "AS", "10H", "2c" — convenience for tests and for typing a hand in by hand. */
export function parseCard(text: string): Card {
  const match = /^(10|[2-9]|[JQKA])([CDHS])$/i.exec(text.trim());
  if (!match) throw new Error(`not a card: ${text}`);
  const rank = RANK_NAMES.indexOf(match[1]!.toUpperCase() as (typeof RANK_NAMES)[number]) + 2;
  const suit = NATURAL_SUITS.find((s) => SUITS[s].name && s.startsWith(match[2]!.toUpperCase()))!;
  return { suit, rank };
}
