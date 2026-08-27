/** Port of the `cards` package: Rank, Suit, Card, Deck, plus initiative's DrawCardResult. */

import type { JavaRandom } from '../dice/javaRandom.js';

export const RANK_NAMES = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', 'Joker',
] as const;

export const SUITS = {
  CLUBS: { name: '♣', value: 1 },
  DIAMONDS: { name: '♦', value: 2 },
  HEARTS: { name: '♥', value: 3 },
  SPADES: { name: '♠', value: 4 },
  COLOR: { name: '🃏', value: 5 },
  BLACK: { name: '🂿', value: 6 },
} as const;

export type SuitName = keyof typeof SUITS;

export interface Card {
  suit: SuitName;
  /** 2..14 for pip/face cards, 15 for jokers. */
  rank: number;
}

export function card(suit: SuitName, rank: number): Card {
  return { suit, rank };
}

export function cardToString(c: Card): string {
  return c.rank === 15 ? SUITS[c.suit].name : `${RANK_NAMES[c.rank - 2]}${SUITS[c.suit].name}`;
}

/** Rank first, then suit — matching `Card.compareTo`. */
export function compareCards(a: Card, b: Card): number {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  const av = SUITS[a.suit].value;
  const bv = SUITS[b.suit].value;
  return av === bv ? 0 : av < bv ? -1 : 1;
}

/** Hearts and diamonds print red; the jokers follow their own colour. */
export function isRedSuit(c: Card): boolean {
  return c.suit === 'HEARTS' || c.suit === 'DIAMONDS' || c.suit === 'COLOR';
}

/**
 * The glyphs `isRedSuit` would say yes to, as they appear in a string.
 *
 * Derived from `SUITS` rather than written out, so a change to a symbol cannot
 * leave the two disagreeing — which would show up as one suit quietly going
 * black in the roll log and nowhere else.
 */
const RED_GLYPHS: ReadonlySet<string> = new Set<string>(
  (Object.keys(SUITS) as SuitName[])
    .filter((suit) => isRedSuit({ suit, rank: 2 }))
    .map((suit) => SUITS[suit].name),
);

/**
 * Split a line of text into runs, marking the ones that are a red suit symbol.
 *
 * For the roll log, which is assembled as text and so was printing hearts and
 * diamonds in black while the initiative list showed them red — reported
 * 2026-08-27. Pure and string-only on purpose: the log's renderer is DOM
 * assembly that no test covers, and this is the part of it worth pinning.
 *
 * Adjacent characters of the same kind stay in one run, so a line with no cards
 * in it comes back as a single piece and costs one span.
 */
export function splitRedSuits(text: string): { text: string; red: boolean }[] {
  const runs: { text: string; red: boolean }[] = [];
  for (const ch of text) {
    const red = RED_GLYPHS.has(ch);
    const last = runs[runs.length - 1];
    if (last && last.red === red) last.text += ch;
    else runs.push({ text: ch, red });
  }
  return runs;
}

/**
 * A card as the VTT should display it.
 *
 * Identical to `cardToString` except for the jokers, which that function renders
 * as the Unicode playing-card glyphs. Those have almost no font coverage — on
 * Paul's machine the black joker came out as a row of black bars — so they are
 * spelled out instead. `cardToString` itself is left alone: the Discord bot's
 * output is pinned by the conformance corpus.
 */
export function cardLabel(c: Card): string {
  if (c.rank === 15) return 'JKR';
  return cardToString(c);
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export const BLACK_JOKER: Card = card('BLACK', 15);
export const COLOR_JOKER: Card = card('COLOR', 15);
export const LOWEST_CARD: Card = card('CLUBS', 2);
/** Quick redraws anything below the six of clubs. */
export const LOWEST_QUICK_CARD: Card = card('CLUBS', 6);

function buildInitialDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'] as const) {
    for (let rank = 2; rank <= 14; rank++) deck.push(card(suit, rank));
  }
  deck.push(COLOR_JOKER, BLACK_JOKER);
  return deck;
}

const INITIAL_DECK = buildInitialDeck();

export interface DrawCardResult {
  cards: Card[];
  bestCard: Card | undefined;
}

function findBestCard(cards: Card[]): Card {
  const sorted = [...cards].sort(compareCards);
  return sorted[sorted.length - 1]!;
}

function findWorstCard(cards: Card[]): Card {
  const sorted = [...cards].sort(compareCards);
  return sorted[0]!;
}

/** Mirrors `DrawCardResult.combineWith`, including that it sorts `cards` in place. */
function combineWith(target: DrawCardResult, other: DrawCardResult, normalSortingOrder: boolean): DrawCardResult {
  target.cards.push(...other.cards);
  target.cards.sort(compareCards);
  target.bestCard = normalSortingOrder ? findBestCard(target.cards) : findWorstCard(target.cards);
  return target;
}

const IMPROVED_LEVELHEADED = 'i';
const LEVELHEADED = 'l';
const QUICK = 'q';
const HESITANT = 'h';

/** Java's `Collections.shuffle`: Fisher-Yates from the end, using `nextInt(i)`. */
function javaShuffle<T>(list: T[], random: JavaRandom): void {
  for (let i = list.length; i > 1; i--) {
    const j = random.nextInt(i);
    const tmp = list[i - 1]!;
    list[i - 1] = list[j]!;
    list[j] = tmp;
  }
}

export class Deck {
  private currentDeck: Card[] = [];
  shuffleNeeded = false;
  jokerDealt = false;

  constructor(private readonly random: JavaRandom) {
    this.shuffle();
  }

  /**
   * A deck resumed from a saved list of remaining cards.
   *
   * Needed because the VTT keeps the deck in scene metadata between rounds, so
   * dealing has to pick up where the last client left off rather than starting
   * from a fresh shuffle. Bot behaviour is untouched.
   */
  static restore(cards: readonly Card[], random: JavaRandom): Deck {
    const deck = new Deck(random);
    deck.currentDeck = [...cards];
    deck.shuffleNeeded = false;
    deck.jokerDealt = false;
    return deck;
  }

  /** The cards still to be dealt, in deal order (drawn from the end). */
  remaining(): Card[] {
    return [...this.currentDeck];
  }

  shuffle(): void {
    this.currentDeck = [...INITIAL_DECK];
    javaShuffle(this.currentDeck, this.random);
    this.shuffleNeeded = false;
    this.jokerDealt = false;
  }

  isEmpty(): boolean {
    return this.currentDeck.length === 0;
  }

  size(): number {
    return this.currentDeck.length;
  }

  /** Draws from the end of the list, flagging when a joker leaves the deck. */
  getNextCard(): Card | undefined {
    const c = this.currentDeck.pop();
    if (c === undefined) return undefined;
    if (sameCard(c, BLACK_JOKER) || sameCard(c, COLOR_JOKER)) {
      this.jokerDealt = true;
    }
    return c;
  }

  getCard(): DrawCardResult {
    const c = this.getNextCard();
    const cards = c === undefined ? [] : [c];
    return { cards, bestCard: c };
  }

  /**
   * Draws for one character given their initiative edges/hindrances:
   *   `h` Hesitant, `l` Level Headed, `i` Improved Level Headed, `q` Quick.
   *
   * NB: faithful to upstream, Level Headed combines with `normalSortingOrder = false`, i.e. it
   * keeps the *worst* of the drawn cards — the same as Hesitant. That looks like an upstream bug
   * (Level Headed should keep the best) but is preserved here so the port is behaviour-identical;
   * see OBR-INTEGRATION-PLAN.md loose ends.
   */
  getCardByParams(paramsInput: string | undefined): DrawCardResult {
    let limit = LOWEST_CARD;
    let params = (paramsInput ?? '').trim().toLowerCase();
    let count = 1;

    if (params.length > 0) {
      if (params.includes(HESITANT)) {
        return this.getHesitantResult();
      }
      if (params.includes(IMPROVED_LEVELHEADED)) {
        count = 3;
        params = params.split(IMPROVED_LEVELHEADED).join('');
      } else if (params.includes(LEVELHEADED)) {
        count = 2;
        params = params.split(LEVELHEADED).join('');
      }
      if (params.includes(QUICK)) {
        limit = LOWEST_QUICK_CARD;
      }
    }

    let result: DrawCardResult = { cards: [], bestCard: undefined };
    for (let i = 0; i < count; i++) {
      result = combineWith(result, this.getCard(), false);
    }
    while (result.bestCard !== undefined && compareCards(result.bestCard, limit) < 0) {
      result = combineWith(result, this.getCard(), true);
    }
    return result;
  }

  private getHesitantResult(): DrawCardResult {
    const result: DrawCardResult = { cards: [], bestCard: undefined };
    const c1 = this.getNextCard();
    const c2 = this.getNextCard();
    if (c1) combineWith(result, { cards: [c1], bestCard: c1 }, false);
    if (c2) combineWith(result, { cards: [c2], bestCard: c2 }, false);
    return result;
  }
}
