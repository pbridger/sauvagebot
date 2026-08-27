/**
 * The initiative tab.
 *
 * Initiative is the first thing in this extension that belongs to the *table*
 * rather than to a character, which is what pushed the panel into tabs. The roll
 * log stays below both, because it is the one surface everything feeds.
 *
 * Writes go to scene metadata and to tokens. There is no leader election here
 * and it does not need one: dealing is a deliberate button press by one person,
 * not a reaction every client runs. Two people dealing at once would be two
 * people fighting over the deck, which is a table problem rather than a
 * concurrency one.
 */
import { cardLabel, isRedSuit, sameCard, type Card } from '../../src/game/cards.js';
import {
  initiativeEdges,
  isJoker,
  turnOrder,
  type InitiativeState,
} from '../../src/rules/initiative.js';
import type { Sheet } from '../../src/rules/sheet.js';
import { readBinding, type TokenLike, type TokenState } from '../../src/obr/binding.js';
import { handOf } from '../../src/rules/hand.js';
import { describeStatus, isIncapacitated } from '../../src/rules/status.js';
import { localName, mapName } from '../../src/rules/naming.js';

export interface Combatant {
  tokenId: string;
  name: string;
  sheet: Sheet;
  state: TokenState;
  card?: Card;
  /** The token's artwork, so a row is recognisable at a glance. */
  imageUrl?: string;
  /**
   * Hidden on the map — Owlbear's own eye, which the Marshal sees through and a
   * player does not.
   *
   * The Marshal prepping one large map with five rooms on it has every encounter
   * placed at once, and a player must not learn from the initiative list what is
   * waiting two doors down. Per **token** rather than per sheet, because that is
   * the granularity the problem has: room one's bandits and room two's share a
   * sheet and must not share a fate.
   */
  hidden?: boolean;
}

export interface InitiativeHooks {
  onDeal: () => void;
  onClear: () => void;
  onSelect: (tokenId: string) => void;
  /** Select the token *and* show its character sheet — "who is next, what can they do". */
  onOpenSheet: (tokenId: string) => void;
  /**
   * Draw one combatant a fresh card from the running deck, replacing the one
   * they hold. The rules reach this through a Benny, but a table needs it for
   * everything the rules do not cover — a latecomer, a misdeal, an interrupt —
   * so it is a button rather than only a cost.
   */
  onReplace: (tokenId: string) => void;
  /**
   * Act on a different card in the hand. Absent for a client that may not — a
   * player choosing for somebody else's character is the one way this control
   * can be wrong, and withholding the callback is what makes the card render as
   * a label rather than a button.
   */
  onChoose?: (tokenId: string, index: number) => void;
  /** Whichever token is selected on the map, so the list can highlight it. */
  selectedTokenId?: string;
  /**
   * Who has already taken a turn this round. Rows dim as they go, so a GM
   * clicking down the order can see at a glance who is left.
   */
  acted?: ReadonlySet<string>;
  /**
   * GM only. An NPC keeps their turn in the order — players still need to know
   * when the thing acts — but shows as the token on the map rather than by the
   * name on the Marshal's sheet.
   */
  revealNpcs?: boolean;
  /**
   * Whether this client may work the deck — deal a round, deal one combatant in,
   * end the fight. The Marshal's, all three: a player dealing a round mid-fight
   * would replace everybody's card, and there is no undo for that.
   *
   * Separate from `revealNpcs` although the same person holds both today. That
   * one is about what a name says; this is about who may act. Folding them
   * together would mean any future reason to reveal a name also handed out the
   * deck.
   *
   * A screen rather than a lock, like everything else here — the initiative state
   * lives in room metadata, which every client can write. It stops the accidental
   * click, which is the failure that actually happens.
   */
  mayDeal?: boolean;
  /**
   * Whether combatants hidden on the map belong in this list at all.
   *
   * The Marshal's, and a third flag rather than a reuse of the other two on
   * purpose: `revealNpcs` is about what a name says and `mayDeal` about who may
   * act, and this is about what exists. They happen to be the same person today,
   * and folding them together would mean any future reason to grant one handed
   * over the others.
   *
   * For a player a hidden combatant is not dimmed or redacted — it is absent.
   * A greyed row saying "something is here" is the leak, not the cure.
   */
  showHidden?: boolean;
}

/** Everyone bound to a sheet in this scene, with whatever card they hold. */
export function combatants(
  tokens: readonly (TokenLike & { imageUrl?: string; visible?: boolean })[],
  sheets: readonly Sheet[],
): Combatant[] {
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  const out: Combatant[] = [];
  for (const token of tokens) {
    const state = readBinding(token.metadata);
    const sheet = state && byId.get(state.sheetId);
    if (!state || !sheet) continue;
    // Parked: prepped on the map for a room nobody has walked into. Out of the
    // fight for everybody including the Marshal — this is not a screen, it is
    // "these forty tokens are not in this encounter". See `Sheet.parked`.
    if (sheet.parked) continue;
    out.push({
      tokenId: token.id,
      // What the table calls it, which is the map label when there is one.
      name: mapName(token),
      sheet,
      state,
      ...(state.card ? { card: state.card } : {}),
      ...(token.imageUrl ? { imageUrl: token.imageUrl } : {}),
      // Absent rather than false when the token is on show, so `hidden` reads as
      // the exception it is.
      ...(token.visible === false ? { hidden: true } : {}),
    });
  }
  return out;
}

/**
 * The card the rest of this combatant's gang is acting on, if they agree on one.
 *
 * For dealing in a latecomer. A round is dealt by sheet, so a mook placed or
 * revealed after the deal should *join* the gang rather than draw against it —
 * otherwise the Marshal drags three more bandits on, presses Deal three times,
 * and ends up with four separate bandit turns out of one stat block.
 *
 * `undefined` when the gang holds nothing, or when its members disagree. They
 * disagree only because somebody used the row's Deal surgically on one of them,
 * and second-guessing that by picking a majority would undo the thing they just
 * did. No answer means draw a fresh card, which is the old behaviour.
 */
export function gangCard(
  combatant: Combatant,
  everyone: readonly Combatant[],
): Card | undefined {
  const held = everyone
    .filter((c) => c.tokenId !== combatant.tokenId && c.sheet.id === combatant.sheet.id)
    .map((c) => c.card)
    .filter((card): card is Card => card !== undefined);
  if (!held.length) return undefined;
  return held.every((card) => sameCard(card, held[0]!)) ? held[0] : undefined;
}

/**
 * A combatant's hand, with the card they act on drawn large.
 *
 * The same control in two places — the initiative row and the Level Headed entry
 * on the character sheet — because those are the two places a player looks: one
 * is where the cards are, the other is where the Edge that produced them is
 * explained. Rendering it twice from one function is what keeps them agreeing.
 *
 * A hand of one renders as exactly what was there before this existed: a single
 * card, no buttons, no affordance suggesting a choice nobody has.
 */
export function renderHand(
  state: TokenState,
  onChoose?: (index: number) => void,
): HTMLElement | undefined {
  const hand = handOf(state);
  if (!hand) return undefined;

  const wrap = document.createElement('span');
  wrap.className = 'hand';
  hand.cards.forEach((card, index) => {
    const chosen = index === hand.chosen;
    // A button only when it would do something. The chosen card in a hand of
    // three is still drawn as a button so the row does not reflow when the
    // choice moves, but it is marked and does nothing.
    const el = document.createElement(onChoose && hand.cards.length > 1 ? 'button' : 'span');
    el.className = [
      'card',
      isRedSuit(card) ? 'red' : '',
      chosen ? 'chosen' : 'spare',
      hand.cards.length > 1 ? 'in-hand' : '',
    ]
      .filter(Boolean)
      .join(' ');
    el.textContent = cardLabel(card);
    if (el instanceof HTMLButtonElement) {
      el.type = 'button';
      el.disabled = chosen;
      el.title = chosen ? 'Acting on this one' : `Act on ${cardLabel(card)} instead`;
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        onChoose?.(index);
      });
    } else if (hand.cards.length > 1) {
      el.title = chosen ? 'Acting on this one' : 'Also drawn';
    }
    wrap.append(el);
  });
  return wrap;
}

function edgeSummary(sheet: Sheet): string {
  const edges = initiativeEdges(sheet);
  const names: string[] = [];
  if (edges.quick) names.push('Quick');
  if (edges.improvedLevelHeaded) names.push('Imp. Level Headed');
  else if (edges.levelHeaded) names.push('Level Headed');
  if (edges.hesitant) names.push('Hesitant');
  return names.join(', ');
}

export function renderInitiative(
  state: InitiativeState | undefined,
  everyone: readonly Combatant[],
  hooks: InitiativeHooks,
): DocumentFragment {
  const out = document.createDocumentFragment();

  // Screened before anything counts them: the empty-list message, the "deal to
  // n combatants" title and the turn order all have to be built from the list
  // this client is allowed to know about, not from the full one.
  // Defaults to *not* showing them. `revealNpcs` two lines down defaults the same
  // way, and for the same reason: a caller that forgets to pass this should leak
  // nothing, and forgetting is the failure mode a default exists for.
  const all = hooks.showHidden ? everyone : everyone.filter((c) => !c.hidden);

  const bar = document.createElement('div');
  bar.className = 'init-bar';

  const round = document.createElement('span');
  round.className = 'round';
  round.textContent = state?.round ? `Round ${state.round}` : 'No fight yet';
  bar.append(round);

  const deal = document.createElement('button');
  // "Deal round", not "Deal": each row has its own Deal, and in the same pane the
  // bare word would not say whether it meant everyone or this one.
  deal.textContent = state?.round ? 'Deal next round' : 'Deal round';
  const mayDeal = hooks.mayDeal ?? false;
  deal.disabled = !mayDeal || all.length === 0;
  deal.title = !mayDeal
    ? 'The Marshal deals'
    : all.length
      ? `Deal to ${all.length} combatant(s)`
      : 'Bind some tokens first';
  deal.addEventListener('click', hooks.onDeal);
  bar.append(deal);

  const clear = document.createElement('button');
  clear.textContent = 'End fight';
  clear.disabled = !mayDeal || !state?.round;
  if (!mayDeal) clear.title = 'The Marshal ends the fight';
  clear.addEventListener('click', hooks.onClear);
  bar.append(clear);
  out.append(bar);

  if (state) {
    const count = document.createElement('div');
    count.className = 'deck-count';
    count.textContent = `${state.deck.length} cards left in the deck`;
    out.append(count);
  }

  if (state?.jokerDealt) {
    const notice = document.createElement('div');
    notice.className = 'joker-notice';
    notice.textContent = 'Joker dealt — the deck reshuffles before the next round.';
    out.append(notice);
  }

  if (!all.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nobody is in the fight. Bind tokens to characters to deal them in.';
    out.append(empty);
    return out;
  }

  const list = document.createElement('ol');
  list.className = 'initiative';
  for (const combatant of turnOrder(all)) {
    const outOfFight = isIncapacitated(combatant.state, combatant.sheet);
    const row = document.createElement('li');
    if (combatant.tokenId === hooks.selectedTokenId) row.classList.add('selected');
    if (hooks.acted?.has(combatant.tokenId)) row.classList.add('acted');
    if (combatant.card && isJoker(combatant.card)) row.classList.add('joker');
    if (outOfFight) row.classList.add('out');
    if (combatant.hidden) row.classList.add('hidden-token');

    if (combatant.imageUrl) {
      const thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.src = combatant.imageUrl;
      thumb.alt = '';
      thumb.addEventListener('error', () => thumb.remove());
      row.append(thumb);
    }

    // The whole hand. One card renders exactly as it always did; two or three
    // give the player their choice right where the cards are.
    const hand = renderHand(
      combatant.state,
      hooks.onChoose ? (index) => hooks.onChoose?.(combatant.tokenId, index) : undefined,
    );
    if (hand) {
      row.append(hand);
    } else {
      const none = document.createElement('span');
      none.className = 'card none';
      none.textContent = '—';
      row.append(none);
    }

    const name = document.createElement('span');
    name.className = 'who';
    name.textContent = displayName(combatant, all, hooks.revealNpcs ?? false);
    row.append(name);

    // Only the Marshal ever sees one of these, by construction — a player's list
    // does not contain the row. It says why the row is dim, so "did I forget to
    // reveal that one" is answerable from here rather than from the map.
    if (combatant.hidden) {
      const mark = document.createElement('span');
      mark.className = 'pill hidden-mark';
      mark.textContent = 'HIDDEN';
      mark.title = 'Hidden on the map, so it is not in the players\u2019 list at all';
      row.append(mark);
    }

    // Same colours as the token badges and the sheet pips: one scheme throughout.
    const status = statusChips(combatant);
    if (status) row.append(status);

    // The "drew ♠K ♥3" hint used to live here, listing the cards an Edge had
    // produced. The hand itself now shows them at the front of the row, so this
    // is left saying only which Edge is responsible — the fact the cards do not
    // carry on their own.
    const edges = edgeSummary(combatant.sheet);
    if (edges) {
      const hint = document.createElement('span');
      hint.className = 'drew';
      hint.textContent = edges;
      row.append(hint);
    }

    // Deals from the round's own deck, so the card cannot be one somebody else is
    // already holding. Labelled for the common use — dealing in a latecomer —
    // rather than for the mechanism, which happens to be a replacement.
    const dealOne = document.createElement('button');
    dealOne.className = 'sheet-link';
    dealOne.textContent = 'Deal';
    dealOne.disabled = !mayDeal || !state?.round || outOfFight;
    dealOne.title = !mayDeal
      ? 'The Marshal deals'
      : !state?.round
        ? 'Deal a round first'
        : outOfFight
          ? 'Out of the fight'
          : `Deal ${displayName(combatant, all, hooks.revealNpcs ?? false)} a card, replacing any they hold`;
    dealOne.addEventListener('click', (event) => {
      event.stopPropagation();
      hooks.onReplace(combatant.tokenId);
    });
    row.append(dealOne);

    const open = document.createElement('button');
    open.className = 'sheet-link';
    open.textContent = 'Sheet';
    open.title = `Show ${displayName(combatant, all, hooks.revealNpcs ?? false)}'s sheet`;
    open.disabled = !combatant.sheet.pc && !hooks.revealNpcs;
    open.addEventListener('click', (event) => {
      // Without this the row's own handler also fires and marks the turn taken.
      event.stopPropagation();
      hooks.onOpenSheet(combatant.tokenId);
    });
    row.append(open);

    row.addEventListener('click', () => hooks.onSelect(combatant.tokenId));
    list.append(row);
  }
  out.append(list);

  return out;
}

/**
 * The character's name, not the token's — a token called "Npc Linguist 4" tells
 * the GM nothing about who is acting.
 *
 * For one of the Marshal's, the GM gets **both**: the sheet name says what the
 * thing is, the token name says which one of them it is. That used to be shown
 * only for a gang of Extras sharing one sheet, on the reasoning that the token
 * name is redundant otherwise — but the token name is what a player will say out
 * loud, so the Marshal has to be able to map it back for every NPC rather than
 * only for the ones that come in threes.
 *
 * A player gets the token name alone. A PC is their sheet name to everybody:
 * appending "Reggie Kane · Reggie" tells nobody anything.
 */
export function displayName(
  combatant: Combatant,
  _all: readonly Combatant[],
  revealNpcs = true,
): string {
  return localName(combatant.sheet, combatant.name, revealNpcs);
}

/** Compact wound / fatigue / Shaken markers, matching the token badge colours. */
function statusChips(combatant: Combatant): HTMLElement | undefined {
  const { state, sheet } = combatant;
  const chips: [string, string][] = [];

  if (isIncapacitated(state, sheet)) {
    chips.push(['OUT', 'out']);
  } else {
    if (state.wounds > 0) chips.push([`${state.wounds}W`, 'wound']);
    if (state.fatigue > 0) chips.push([`${state.fatigue}F`, 'fatigue']);
    if (state.shaken) chips.push(['!', 'shaken']);
  }
  if (!chips.length) return undefined;

  const wrap = document.createElement('span');
  wrap.className = 'chips';
  wrap.title = describeStatus(state, sheet);
  for (const [text, tone] of chips) {
    const chip = document.createElement('span');
    chip.className = `chip ${tone}`;
    chip.textContent = text;
    wrap.append(chip);
  }
  return wrap;
}
