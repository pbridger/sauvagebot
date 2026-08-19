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
import { cardLabel, isRedSuit, type Card } from '../../src/game/cards.js';
import {
  initiativeEdges,
  isJoker,
  turnOrder,
  type Draw,
  type InitiativeState,
} from '../../src/rules/initiative.js';
import type { Sheet } from '../../src/rules/sheet.js';
import { readBinding, type TokenLike, type TokenState } from '../../src/obr/binding.js';
import { describeStatus, isIncapacitated } from '../../src/rules/status.js';

export interface Combatant {
  tokenId: string;
  name: string;
  sheet: Sheet;
  state: TokenState;
  card?: Card;
  /** The token's artwork, so a row is recognisable at a glance. */
  imageUrl?: string;
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
}

/** Everyone bound to a sheet in this scene, with whatever card they hold. */
export function combatants(
  tokens: readonly (TokenLike & { imageUrl?: string })[],
  sheets: readonly Sheet[],
): Combatant[] {
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  const out: Combatant[] = [];
  for (const token of tokens) {
    const state = readBinding(token.metadata);
    const sheet = state && byId.get(state.sheetId);
    if (!state || !sheet) continue;
    out.push({
      tokenId: token.id,
      name: token.name,
      sheet,
      state,
      ...(state.card ? { card: state.card } : {}),
      ...(token.imageUrl ? { imageUrl: token.imageUrl } : {}),
    });
  }
  return out;
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
  all: readonly Combatant[],
  hooks: InitiativeHooks,
  lastDraws?: ReadonlyMap<string, Draw>,
): DocumentFragment {
  const out = document.createDocumentFragment();

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
  deal.disabled = all.length === 0;
  deal.title = all.length ? `Deal to ${all.length} combatant(s)` : 'Bind some tokens first';
  deal.addEventListener('click', hooks.onDeal);
  bar.append(deal);

  const clear = document.createElement('button');
  clear.textContent = 'End fight';
  clear.disabled = !state?.round;
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

    if (combatant.imageUrl) {
      const thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.src = combatant.imageUrl;
      thumb.alt = '';
      thumb.addEventListener('error', () => thumb.remove());
      row.append(thumb);
    }

    const card = document.createElement('span');
    card.className = combatant.card
      ? isRedSuit(combatant.card)
        ? 'card red'
        : 'card'
      : 'card none';
    card.textContent = combatant.card ? cardLabel(combatant.card) : '—';
    row.append(card);

    const name = document.createElement('span');
    name.className = 'who';
    name.textContent = displayName(combatant, all, hooks.revealNpcs ?? false);
    row.append(name);

    // Same colours as the token badges and the sheet pips: one scheme throughout.
    const status = statusChips(combatant);
    if (status) row.append(status);

    // What else they drew, when an edge meant they drew more than one.
    const drew = lastDraws?.get(combatant.tokenId);
    if (drew && drew.cards.length > 1) {
      const extra = document.createElement('span');
      extra.className = 'drew';
      extra.append('drew ');
      for (const drawn of drew.cards) {
        const one = document.createElement('span');
        if (isRedSuit(drawn)) one.className = 'red';
        one.textContent = `${cardLabel(drawn)} `;
        extra.append(one);
      }
      row.append(extra);
    } else {
      const edges = edgeSummary(combatant.sheet);
      if (edges) {
        const hint = document.createElement('span');
        hint.className = 'drew';
        hint.textContent = edges;
        row.append(hint);
      }
    }

    // Deals from the round's own deck, so the card cannot be one somebody else is
    // already holding. Labelled for the common use — dealing in a latecomer —
    // rather than for the mechanism, which happens to be a replacement.
    const dealOne = document.createElement('button');
    dealOne.className = 'sheet-link';
    dealOne.textContent = 'Deal';
    dealOne.disabled = !state?.round || outOfFight;
    dealOne.title = !state?.round
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
 * The exception is a gang of Extras sharing one sheet, where the sheet name is
 * identical for all of them and the token name is the only way to tell which
 * bandit is up. There, and only there, the token name is appended.
 */
export function displayName(
  combatant: Combatant,
  all: readonly Combatant[],
  revealNpcs = true,
): string {
  // One of the Marshal's is named by its token, which everyone can already read
  // off the map.
  if (!combatant.sheet.pc && !revealNpcs) return combatant.name;
  const shared = all.filter((other) => other.sheet.id === combatant.sheet.id).length > 1;
  if (!shared || combatant.name === combatant.sheet.name) return combatant.sheet.name;
  return `${combatant.sheet.name} · ${combatant.name}`;
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
