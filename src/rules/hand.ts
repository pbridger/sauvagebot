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
import { sameCard, type Card } from '../game/cards.js';
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

/**
 * Add one card to whatever they hold, **without** changing what they act on.
 *
 * This is what a Benny buys, and what the row's Deal gives a combatant who is
 * already in the fight. Deliberately not auto-selecting the new card even when it
 * is better: the whole point of the change is that the player chooses, and a
 * control that pre-empts them is the bug in a politer form.
 */
export function addToHand(state: TokenState, card: Card): TokenState {
  const hand = handOf(state);
  if (!hand) return { ...state, cards: [card], chosen: 0, card };
  return { ...state, cards: [...hand.cards, card], chosen: hand.chosen, card: hand.cards[hand.chosen]! };
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
