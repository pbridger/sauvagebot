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
import { cardToString, isRedSuit, type Card } from '../../src/game/cards.js';
import {
  initiativeEdges,
  isJoker,
  turnOrder,
  type Draw,
  type InitiativeState,
} from '../../src/rules/initiative.js';
import type { Sheet } from '../../src/rules/sheet.js';
import { readBinding, type TokenLike } from '../../src/obr/binding.js';

export interface Combatant {
  tokenId: string;
  name: string;
  sheet: Sheet;
  card?: Card;
}

export interface InitiativeHooks {
  onDeal: () => void;
  onClear: () => void;
  onSelect: (tokenId: string) => void;
  /** Whichever token is selected on the map, so the list can highlight it. */
  selectedTokenId?: string;
}

/** Everyone bound to a sheet in this scene, with whatever card they hold. */
export function combatants(
  tokens: readonly TokenLike[],
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
      ...(state.card ? { card: state.card } : {}),
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
  deal.textContent = state?.round ? 'Deal next round' : 'Deal';
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
    const row = document.createElement('li');
    if (combatant.tokenId === hooks.selectedTokenId) row.classList.add('selected');
    if (combatant.card && isJoker(combatant.card)) row.classList.add('joker');

    const card = document.createElement('span');
    card.className = combatant.card
      ? isRedSuit(combatant.card)
        ? 'card red'
        : 'card'
      : 'card none';
    card.textContent = combatant.card ? cardToString(combatant.card) : '—';
    row.append(card);

    const name = document.createElement('span');
    name.className = 'who';
    name.textContent = combatant.name;
    row.append(name);

    // What else they drew, when an edge meant they drew more than one.
    const drew = lastDraws?.get(combatant.tokenId);
    if (drew && drew.cards.length > 1) {
      const extra = document.createElement('span');
      extra.className = 'drew';
      extra.append('drew ');
      for (const drawn of drew.cards) {
        const one = document.createElement('span');
        if (isRedSuit(drawn)) one.className = 'red';
        one.textContent = `${cardToString(drawn)} `;
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

    row.addEventListener('click', () => hooks.onSelect(combatant.tokenId));
    list.append(row);
  }
  out.append(list);

  if (state) {
    const footer = document.createElement('p');
    footer.className = 'deck-count';
    footer.textContent = `${state.deck.length} cards left in the deck`;
    out.append(footer);
  }

  return out;
}
