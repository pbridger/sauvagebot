/**
 * A combatant's Action Cards for the round, and which one they act on.
 *
 * ## Why a hand rather than a card
 *
 * Level Headed *"draws an additional Action Card in combat **and chooses which to
 * use**"*; Improved *"draws two additional cards **and chooses which to keep**"*.
 * The app used to make that choice — best card, worst for Hesitant — and throw
 * the rest away, which is wrong twice over:
 *
 *   - it is not the rule, and
 *   - **Calculating** makes the *low* card worth having: *"When their Action Card
 *     is a Five or less, they ignore up to 2 points of penalties on one action."*
 *     Paige has both Edges, and the app was binning her good card for her.
 *
 * Reported from the table, 2026-08-26, together with the other half: a Benny
 * bought a *fresh hand* rather than one more card. The book only parses the other
 * way — *"You may choose your final Action Card from any of your available
 * choices, including additional draws from Level Headed, Quick, etc."* — so draws
 * accumulate and the player picks from the pile.
 *
 * ## Why `card` is still written
 *
 * Everything that reads a combatant's card — the map badge, the turn order, the
 * wire, the token label — wants one card, and none of them care how it was
 * chosen. So the hand is stored beside it and `card` is kept as the *answer*,
 * rewritten whenever the hand changes. Old tokens carrying only a `card` read
 * back as a one-card hand, and nothing had to be migrated.
 */
import { compareCards, sameCard, type Card } from '../game/cards.js';
import type { TokenState } from '../obr/binding.js';

export interface Hand {
  /** Everything drawn this round, in the order dealt. */
  cards: Card[];
  /** Index into `cards` of the one they act on. Always in range. */
  chosen: number;
}

/**
 * The hand on a token, or `undefined` for a combatant who has not been dealt in.
 *
 * A token holding only the older single `card` reads as a hand of one, which is
 * what makes this change need no migration: every binding written before today
 * answers correctly.
 */
export function handOf(state: TokenState): Hand | undefined {
  if (state.cards?.length) {
    const chosen = state.chosen ?? 0;
    // Clamped rather than trusted. The index and the array are two fields that
    // could be written by different versions of this app, and an out-of-range
    // read here would be a combatant with a card that renders as nothing.
    return { cards: state.cards, chosen: Math.min(Math.max(chosen, 0), state.cards.length - 1) };
  }
  return state.card ? { cards: [state.card], chosen: 0 } : undefined;
}

/** The card a combatant acts on. */
export function chosenCard(state: TokenState): Card | undefined {
  const hand = handOf(state);
  return hand && hand.cards[hand.chosen];
}

/** Put a whole hand on a token, replacing anything there. Dealing a round. */
export function setHand(state: TokenState, cards: readonly Card[], chosen: Card): TokenState {
  const at = cards.findIndex((card) => sameCard(card, chosen));
  const index = at === -1 ? 0 : at;
  return { ...state, cards: [...cards], chosen: index, card: cards[index]! };
}

/** Which end of the hand a new card has to beat to take over. */
export type Prefers = 'highest' | 'lowest';

/**
 * Add one card to whatever they hold, and act on it if it is the better one.
 *
 * This is what a Benny buys, and what the row's Deal gives a combatant who is
 * already in the fight. Every card stays in the hand either way — the choice is
 * still the player's, and `chooseFromHand` is one click away.
 *
 * ## This used to do the opposite, on purpose
 *
 * The first version appended without ever changing what they acted on, because
 * choosing is the player's and an app that pre-empts them is the same bug in a
 * politer form. Damian, 2026-09-09: *"although it's important to retain the
 * ability to choose amongst different action cards (particularly for Calculating)
 * the default behaviour should be to pick the current highest card."* The
 * objection raised against that was the third card — what about a player who has
 * already picked one of the first two? His answer, 09-10, and it is the right
 * one: *"that choice means nothing when they've then expressed interest in
 * another card — it's redundant and should go back to defaulting to highest."*
 * Asking for another card **is** the expression of interest. Paul confirmed it.
 *
 * So the common case is now no clicks instead of one, and the Calculating case —
 * *"when their Action Card is a Five or less, they ignore up to 2 points of
 * penalties"* — is one click instead of none. That is the right way round: the
 * player who wants the low card is the player paying attention.
 *
 * ## Hesitant
 *
 * `prefers` exists for the Hindrance that inverts the whole question: a Hesitant
 * character acts on their *worst* card, so a new high card taking over would be
 * the app breaking the rule on their behalf. The round deal already knows this
 * (`initiativeEdges`); this is how an extra card learns it too.
 */
export function addToHand(state: TokenState, card: Card, prefers: Prefers = 'highest'): TokenState {
  const hand = handOf(state);
  if (!hand) return { ...state, cards: [card], chosen: 0, card };
  const cards = [...hand.cards, card];
  const against = compareCards(card, hand.cards[hand.chosen]!);
  const takes = prefers === 'lowest' ? against < 0 : against > 0;
  // Ties keep the card they are on. Two cards of the same rank and suit cannot
  // both be in a legitimate deck, so this only arises after a misdeal — and
  // leaving them where they are is the quieter of the two wrong answers.
  const chosen = takes ? cards.length - 1 : hand.chosen;
  return { ...state, cards, chosen, card: cards[chosen]! };
}

/** Act on a different card. Out-of-range indices are ignored rather than clamped. */
export function chooseFromHand(state: TokenState, index: number): TokenState {
  const hand = handOf(state);
  if (!hand || index < 0 || index >= hand.cards.length) return state;
  return { ...state, cards: hand.cards, chosen: index, card: hand.cards[index]! };
}

/** Everything to do with this round's cards, taken off. Ending a fight. */
export function clearHand(state: TokenState): TokenState {
  const { cards: _cards, chosen: _chosen, card: _card, ...rest } = state;
  return rest;
}

/** True when there is a choice to offer — more than one card in the hand. */
export function hasChoice(state: TokenState): boolean {
  return (handOf(state)?.cards.length ?? 0) > 1;
}
