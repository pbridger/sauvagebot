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
 * belongs to a scene. Each combatant's card lives on their own token, so no
 * shared list has to be kept in step with the tokens.
 *
 * ## Groups
 *
 * A gang of Extras acts on **one** Action Card. The book takes it for granted
 * rather than stating it in the combat chapter: Tactician and the Command Edge
 * both hand a card to *"any allied Extra (or group of Extras sharing an Action
 * Card)"*, which is only meaningful if sharing is the normal case.
 *
 * `dealRound` takes an optional `group` per combatant and deals one hand per
 * group, then writes that same card onto every member's token. Storage does not
 * change: five bandits still hold five copies of one card rather than pointing
 * at a shared thing, which keeps the token the single source of truth for what
 * a body holds and leaves every reader — the map, the order, the redraw — alone.
 *
 * The caller chooses the key. In the panel it is the sheet id, which is the
 * table's own definition of "these are the same mooks".
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
 * Names, ordered the way a person reading a list of mooks expects.
 *
 * Numeric so that `Bandit 2` comes before `Bandit 10`. Plain `localeCompare`
 * puts them the other way round, which is invisible until a gang gets past nine
 * and then looks like the list is shuffled.
 */
const BY_NAME = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Shared so the roll log lists a gang in the same order the turn order does. */
export function compareNames(a: string, b: string): number {
  return BY_NAME.compare(a, b);
}

/**
 * Turn order: highest card first, suit breaking ties, jokers on top.
 *
 * `compareCards` already orders rank then suit, and gives jokers rank 15, so
 * this is that order reversed. Combatants with no card sort to the bottom
 * rather than disappearing — they are in the fight, just not dealt in yet.
 *
 * Equal cards break on the name, which matters now that a gang shares one: the
 * alternative is the sort's own stability, i.e. whatever order the tokens came
 * back from Owlbear in, which changes when somebody moves one. A block of mooks
 * that reorders itself between rounds is the Marshal losing their place.
 */
export function turnOrder<T extends { card?: Card; name: string }>(combatants: readonly T[]): T[] {
  return [...combatants].sort((a, b) => {
    if (!a.card && !b.card) return BY_NAME.compare(a.name, b.name);
    if (!a.card) return 1;
    if (!b.card) return -1;
    return compareCards(b.card, a.card) || BY_NAME.compare(a.name, b.name);
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

/** One combatant as the deal sees them. */
export interface Dealt {
  tokenId: string;
  edges: InitiativeEdges;
  /** Incapacitated, and so out of the fight until healed. */
  out?: boolean;
  /**
   * Who they act with. Everyone sharing a key gets one hand between them.
   *
   * Absent means alone, which is what a Wild Card always is. Not defaulted to
   * the sheet id down here — the rule that mooks off one stat block are one gang
   * is the *table's*, and this module should not be the place it is decided.
   */
  group?: string;
}

export interface DealResult {
  state: InitiativeState;
  /** Card assignments, by token id. Group members all appear, holding one card. */
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
  all: readonly Dealt[],
  random: JavaRandom,
): DealResult {
  // An Incapacitated character is out of the fight until they are healed, so
  // they get no card. Dealing them one both wastes a card and puts a body in
  // the turn order the GM then has to skip by hand every round.
  //
  // Filtered *before* grouping, so a gang with one member down still acts. The
  // other way round a single dead bandit would take the whole gang's card.
  const combatants = all.filter((c) => !c.out);

  // Insertion-ordered, so a given table deals the same way every time. An
  // ungrouped combatant gets a key of their own that no group id can collide
  // with — sheet ids are uuids and would never contain a NUL, but the guarantee
  // should not rest on that.
  const hands = new Map<string, Dealt[]>();
  for (const combatant of combatants) {
    const key = combatant.group ?? ` ${combatant.tokenId}`;
    hands.set(key, [...(hands.get(key) ?? []), combatant]);
  }

  // Worst case each *hand* needs three cards, plus Quick redraws. A gang is one
  // hand however many bodies are in it, which is most of why grouping keeps the
  // deck alive longer.
  const needed = [...hands.values()].reduce(
    (sum, members) => sum + drawCount(members[0]!.edges) + 2,
    0,
  );
  const fresh = state.jokerDealt || state.deck.length < needed;
  const deck = fresh ? new Deck(random) : Deck.restore(state.deck, random);

  const draws = new Map<string, Draw>();
  for (const members of hands.values()) {
    // The first member's Edges stand for the group's. Grouped combatants share a
    // stat block, so they share Quick and Level Headed too — and a group whose
    // members somehow differ has no honest answer here anyway, since one hand
    // cannot be drawn two ways.
    const draw = dealOne(deck, members[0]!.edges);
    if (!draw) continue;
    // The same `Draw` object on every member. Nothing mutates one, and holding
    // the identical object is what makes "they are on one card" checkable.
    for (const member of members) draws.set(member.tokenId, draw);
  }

  const jokerDealt = [...draws.values()].some((draw) => draw.cards.some(isJoker));
  return {
    state: { round: state.round + 1, deck: deck.remaining(), jokerDealt },
    draws,
    jokerDealt,
  };
}
