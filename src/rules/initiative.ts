/**
 * Initiative, dealt from the action deck.
 *
 * ## Why this does not reuse `Deck.getCardByParams`
 *
 * It reuses the deck — the cards, the Java-identical shuffle, the joker flag —
 * but not that method. `Deck.getCardByParams` has an upstream bug faithfully
 * preserved by the port: Level Headed combines with `normalSortingOrder = false`
 * and so keeps the *worst* of two cards, identical to Hesitant. The Discord bot
 * must stay behaviour-identical to the Java it replaced, and the conformance
 * corpus pins that. The VTT has no such obligation, so it implements the rule as
 * written: Level Headed keeps the best.
 *
 * That divergence is deliberate and is the one place the two surfaces disagree.
 *
 * ## State
 *
 * The remaining deck and the round number live in scene metadata — a fight
 * belongs to a scene. Each combatant's card lives on their own token, which
 * means five bandits sharing one sheet still get five different cards, and no
 * shared list has to be kept in step with the tokens.
 *
 * !! Edge behaviour is SWADE-standard, from memory, pending the book. !!
 */
import {
  BLACK_JOKER,
  COLOR_JOKER,
  Deck,
  compareCards,
  sameCard,
  type Card,
} from '../game/cards.js';
import type { JavaRandom } from '../dice/javaRandom.js';
import type { Sheet } from './sheet.js';

/** The lowest card Quick will accept; anything below is redrawn. */
export const LOWEST_QUICK_RANK = 6;

export interface InitiativeEdges {
  quick: boolean;
  levelHeaded: boolean;
  improvedLevelHeaded: boolean;
  hesitant: boolean;
}

export const NO_EDGES: InitiativeEdges = {
  quick: false,
  levelHeaded: false,
  improvedLevelHeaded: false,
  hesitant: false,
};

/**
 * Read the initiative edges off a sheet by name.
 *
 * Order matters: "Improved Level Headed" contains "Level Headed", so the
 * improved form is tested first and the plain one only when it is absent.
 */
export function initiativeEdges(sheet: Sheet): InitiativeEdges {
  const names = [...sheet.edges, ...sheet.hindrances]
    .map((entry) => entry.name.toLowerCase())
    .join(' | ');
  const improved = /improved\s+level[\s-]?headed/.test(names);
  return {
    quick: /\bquick\b/.test(names),
    improvedLevelHeaded: improved,
    levelHeaded: !improved && /level[\s-]?headed/.test(names),
    hesitant: /\bhesitant\b/.test(names),
  };
}

export function isJoker(card: Card): boolean {
  return sameCard(card, BLACK_JOKER) || sameCard(card, COLOR_JOKER);
}

/** How many cards this character draws before choosing. */
export function drawCount(edges: InitiativeEdges): number {
  if (edges.improvedLevelHeaded) return 3;
  if (edges.levelHeaded || edges.hesitant) return 2;
  return 1;
}

/**
 * Choose from the drawn cards.
 *
 * Hesitant takes the worst; everything else takes the best. A joker overrides
 * Hesitant — a joker is always good news, and letting the hindrance discard one
 * would be a harsher reading than the rules support.
 */
export function chooseCard(cards: readonly Card[], edges: InitiativeEdges): Card | undefined {
  if (cards.length === 0) return undefined;
  const sorted = [...cards].sort(compareCards);
  if (edges.hesitant && !cards.some(isJoker)) return sorted[0];
  return sorted[sorted.length - 1];
}

export interface Draw {
  /** Everything drawn, in the order dealt. */
  cards: Card[];
  /** The one they act on. */
  card: Card;
}

/**
 * Deal one character's initiative.
 *
 * Quick redraws anything below a six, keeping every card drawn so the panel can
 * show what happened. The redraw stops if the deck runs dry mid-hand.
 */
export function dealOne(deck: Deck, edges: InitiativeEdges): Draw | undefined {
  const cards: Card[] = [];
  for (let i = 0; i < drawCount(edges); i++) {
    const next = deck.getNextCard();
    if (next) cards.push(next);
  }
  if (cards.length === 0) return undefined;

  if (edges.quick) {
    // Redraw while the card they would act on is too low. Level Headed already
    // took the best, so Quick only fires when even that was poor.
    for (;;) {
      const current = chooseCard(cards, edges);
      if (!current || isJoker(current) || current.rank >= LOWEST_QUICK_RANK) break;
      const next = deck.getNextCard();
      if (!next) break;
      cards.push(next);
    }
  }

  const card = chooseCard(cards, edges);
  return card ? { cards, card } : undefined;
}

export interface Combatant {
  tokenId: string;
  name: string;
  card?: Card;
  /** True for the character whose turn it is. */
  onDeck?: boolean;
}

/**
 * Turn order: highest card first, suit breaking ties, jokers on top.
 *
 * `compareCards` already orders rank then suit, and gives jokers rank 15, so
 * this is that order reversed. Combatants with no card sort to the bottom
 * rather than disappearing — they are in the fight, just not dealt in yet.
 */
export function turnOrder<T extends { card?: Card; name: string }>(combatants: readonly T[]): T[] {
  return [...combatants].sort((a, b) => {
    if (!a.card && !b.card) return a.name.localeCompare(b.name);
    if (!a.card) return 1;
    if (!b.card) return -1;
    return compareCards(b.card, a.card);
  });
}

/** Serialisable deck state, so a fight survives a reload and every client agrees. */
export interface InitiativeState {
  round: number;
  /** Cards still to be dealt, drawn from the end. */
  deck: Card[];
  /** Set when a joker has been dealt; the deck is reshuffled after the round. */
  jokerDealt: boolean;
}

export function newInitiative(random: JavaRandom): InitiativeState {
  const deck = new Deck(random);
  return { round: 0, deck: deck.remaining(), jokerDealt: false };
}

export function isInitiativeState(value: unknown): value is InitiativeState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<InitiativeState>;
  return (
    typeof state.round === 'number' &&
    Array.isArray(state.deck) &&
    typeof state.jokerDealt === 'boolean'
  );
}

export interface DealResult {
  state: InitiativeState;
  /** Card assignments, by token id. */
  draws: Map<string, Draw>;
  /** True when a joker came out and the deck must be reshuffled after this round. */
  jokerDealt: boolean;
}

/**
 * Deal a round to everyone.
 *
 * Reshuffles first when a joker went out last round, or when the deck has too
 * few cards left to deal the whole table — running out halfway would give the
 * last few combatants no card at all, which is worse than a reshuffle.
 */
export function dealRound(
  state: InitiativeState,
  all: readonly { tokenId: string; edges: InitiativeEdges; out?: boolean }[],
  random: JavaRandom,
): DealResult {
  // An Incapacitated character is out of the fight until they are healed, so
  // they get no card. Dealing them one both wastes a card and puts a body in
  // the turn order the GM then has to skip by hand every round.
  const combatants = all.filter((c) => !c.out);
  // Worst case each combatant needs three cards, plus Quick redraws.
  const needed = combatants.reduce((sum, c) => sum + drawCount(c.edges) + 2, 0);
  const fresh = state.jokerDealt || state.deck.length < needed;
  const deck = fresh ? new Deck(random) : Deck.restore(state.deck, random);

  const draws = new Map<string, Draw>();
  for (const combatant of combatants) {
    const draw = dealOne(deck, combatant.edges);
    if (draw) draws.set(combatant.tokenId, draw);
  }

  const jokerDealt = [...draws.values()].some((draw) => draw.cards.some(isJoker));
  return {
    state: { round: state.round + 1, deck: deck.remaining(), jokerDealt },
    draws,
    jokerDealt,
  };
}
