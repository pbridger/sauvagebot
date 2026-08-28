/**
 * Binding a token to a character sheet.
 *
 * ## How it works
 *
 * A token carries one key in its item metadata:
 *
 *     com.savagebot/token = { sheetId, wounds, fatigue, shaken, card? }
 *
 * The sheet lives in room metadata and knows nothing about tokens; the token
 * points at it. That direction matters and is not arbitrary:
 *
 *   - a PC exists campaign-wide, a token exists only in the current scene;
 *   - a sheet with a token id in it could not be exported and re-imported into
 *     Damian's room, which is a hard requirement (plan §1c);
 *   - duplicating a token duplicates a *pointer*, which is harmless, rather than
 *     a sheet, which would be a mess.
 *
 * Volatile combat state — wounds, fatigue, shaken, initiative card — lives here
 * too rather than on the sheet, because it belongs to the scene and the fight,
 * not to the character.
 *
 * ## The scene problem, and auto-binding
 *
 * Item metadata is per-scene, so a *fresh* token on a new map has no binding.
 * Re-binding six PCs at the start of each scene would be miserable, so
 * `autoBindings` matches tokens to characters by name. It never overwrites an
 * existing binding, and never guesses when a name is ambiguous — a wrong
 * automatic bind is worse than no bind, because nobody would think to check.
 * Wild Cards take one token; Extras take as many as share the name.
 *
 * A **copied** token is the other case, and it was measured in the live room on
 * 2026-08-17: metadata travels with a token pasted into a different room, wounds
 * and Shaken included. Good news for the binding, which is the point of copying;
 * bad news for everything else on there, since a new map is usually a new fight.
 * Hence `resetSceneState`.
 */
import { SUITS, type Card } from '../game/cards.js';
import type { ModifierState } from '../rules/modifiers.js';
import type { Sheet } from '../rules/sheet.js';

export const TOKEN_KEY = 'com.savagebot/token';

/**
 * Volatile state for one token.
 *
 * Extends `ModifierState`, so the situational modifiers the Marshal has called on
 * this character (dark, unstable platform, Distracted) sit beside the wounds —
 * both are true of a body in a scene rather than of the character.
 */
export interface TokenState extends ModifierState {
  sheetId: string;
  wounds: number;
  fatigue: number;
  shaken: boolean;
  /**
   * The card they act on. Kept as the answer rather than derived at every read:
   * the map badge, the turn order and the wire all want one card and none of them
   * care how it was chosen. `hand.ts` rewrites it whenever `cards` changes.
   */
  card?: Card;
  /**
   * Everything drawn this round, in the order dealt — Level Headed's second card,
   * Improved's third, and anything a Benny added. Absent on a token dealt before
   * this existed, which `handOf` reads as a hand of one.
   */
  cards?: Card[];
  /** Index into `cards`. Absent means the first. */
  chosen?: number;
  /**
   * Wounds taken from the last hit that a Soak could still undo.
   *
   * On the **token**, not on the client that rolled the damage, and that is the
   * whole point of it being here. It used to be a `Map` in `panel.ts` written
   * where damage was applied — which is the Marshal's machine — so the player
   * whose character had just been hit saw no Soak button and was told they had
   * not been damaged when they tried to spend the Benny for one. Reported from
   * the table, 2026-08-22.
   *
   * Absent rather than zero when there is nothing to soak, so that every token
   * bound before this existed reads as "nothing pending" rather than failing the
   * guard.
   */
  soakable?: number;
}

export function newTokenState(sheetId: string): TokenState {
  return { sheetId, wounds: 0, fatigue: 0, shaken: false };
}

export function isTokenState(value: unknown): value is TokenState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<TokenState>;
  return (
    typeof state.sheetId === 'string' &&
    typeof state.wounds === 'number' &&
    typeof state.fatigue === 'number' &&
    typeof state.shaken === 'boolean' &&
    (state.card === undefined || isCard(state.card)) &&
    (state.cards === undefined ||
      (Array.isArray(state.cards) && state.cards.every((c) => isCard(c)))) &&
    (state.chosen === undefined ||
      (typeof state.chosen === 'number' && Number.isInteger(state.chosen))) &&
    // Both optional, and they must stay that way: every token already bound in a
    // live room predates them, and a guard that required them would fail those
    // bindings — which would look like every wound on the map vanishing.
    (state.mod === undefined || (typeof state.mod === 'number' && Number.isFinite(state.mod))) &&
    (state.conditions === undefined ||
      (Array.isArray(state.conditions) && state.conditions.every((c) => typeof c === 'string'))) &&
    (state.soakable === undefined ||
      (typeof state.soakable === 'number' && Number.isFinite(state.soakable)))
  );
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false;
  const card = value as Partial<Card>;
  return (
    typeof card.rank === 'number' &&
    typeof card.suit === 'string' &&
    Object.hasOwn(SUITS, card.suit)
  );
}

export function readBinding(metadata: Record<string, unknown> | undefined): TokenState | undefined {
  const value = metadata?.[TOKEN_KEY];
  return isTokenState(value) ? value : undefined;
}

/**
 * Everything the fight put on a token, taken back off — leaving the binding.
 *
 * This is the companion to duplicating tokens onto a new map: the pointer to the
 * sheet is what you want to keep, and the wounds, the Shaken marker, the dealt
 * card and the Marshal's called modifiers are all things that were true of the
 * *last* scene. Carried forward silently they are worse than useless, because
 * nobody thinks to look at a number they did not just set.
 *
 * Deliberately not touched: `sheetId`, so nothing needs re-binding, and nothing
 * on the sheet itself — Bennies are a session-level thing and belong to "New
 * session", not to opening a map.
 */
export function resetSceneState(state: TokenState): TokenState {
  return newTokenState(state.sheetId);
}

/** The minimum this module needs to know about an OBR item. */
export interface TokenLike {
  id: string;
  /**
   * The item's name — what the Marshal sees in Owlbear's own items tray.
   *
   * Not what the table calls it. Used for auto-binding, where matching a token
   * to a sheet by name is the point, and for nothing that is shown to a player:
   * see `label`.
   */
  name: string;
  /**
   * The text label drawn under the token on the map, when it has one.
   *
   * This is the name the table actually says out loud, and the only one that is
   * both safe and *distinct*: five mooks share a sheet and usually share an item
   * name too, but each carries its own label. `mapName` picks it over `name`.
   */
  label?: string;
  layer: string;
  metadata: Record<string, unknown>;
}

function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/["'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Work out which unbound tokens belong to which characters.
 *
 * The rule differs by character type, and that is the whole point:
 *
 *   - a **Wild Card** is one person, so one token. Two tokens with their name is
 *     a mistake, and binding both would silently pool their wounds.
 *   - an **Extra** is a stat block, so *many* tokens share it. Five tokens called
 *     "Bandit" all bind to the one Bandit sheet, and each keeps its own wounds,
 *     because wounds live on the token. That is how a GM runs a gang without
 *     five copies of the same sheet eating the room's storage budget.
 *
 * A name must still match exactly one *character*; two sheets called "Bandit"
 * is ambiguous either way.
 *
 * Matching is loose on punctuation and case only, so `REGINALD "REGGIE" KANE`
 * finds a token named `Reginald Reggie Kane`, but nothing fuzzier than that.
 */
export function autoBindings(
  tokens: readonly TokenLike[],
  sheets: readonly Sheet[],
): { tokenId: string; sheetId: string }[] {
  const candidates = tokens.filter((t) => t.layer === 'CHARACTER' && !readBinding(t.metadata));

  const tokensByName = new Map<string, TokenLike[]>();
  for (const token of candidates) {
    const key = normalise(token.name);
    if (!key) continue;
    tokensByName.set(key, [...(tokensByName.get(key) ?? []), token]);
  }

  const sheetsByName = new Map<string, Sheet[]>();
  for (const sheet of sheets) {
    const key = normalise(sheet.name);
    if (!key) continue;
    sheetsByName.set(key, [...(sheetsByName.get(key) ?? []), sheet]);
  }

  const bindings: { tokenId: string; sheetId: string }[] = [];
  for (const [name, matched] of tokensByName) {
    const sheetMatches = sheetsByName.get(name);
    if (sheetMatches?.length !== 1) continue;
    const sheet = sheetMatches[0]!;
    if (sheet.wildCard && matched.length !== 1) continue;
    for (const token of matched) bindings.push({ tokenId: token.id, sheetId: sheet.id });
  }
  return bindings;
}

/**
 * Tokens bound to a sheet that no longer exists — after a character is deleted,
 * or a roster imported from another room. Worth surfacing rather than leaving a
 * token silently pointing at nothing.
 */
export function orphanedTokens(
  tokens: readonly TokenLike[],
  sheets: readonly Sheet[],
): TokenLike[] {
  const ids = new Set(sheets.map((s) => s.id));
  return tokens.filter((token) => {
    const binding = readBinding(token.metadata);
    return binding !== undefined && !ids.has(binding.sheetId);
  });
}

/**
 * Every token bound to a given sheet.
 *
 * For an Extra, many is the normal case. For a Wild Card, more than one means a
 * token was duplicated and two tokens now share one wound total — see
 * `duplicateWildCard`.
 */
// Generic so a caller holding richer tokens gets them back whole. Declared as
// `TokenLike[]` it silently downcast the scene's tokens to the bare interface,
// which is how `visible` went missing at the one call site that needed it.
export function tokensForSheet<T extends TokenLike>(tokens: readonly T[], sheetId: string): T[] {
  return tokens.filter((token) => readBinding(token.metadata)?.sheetId === sheetId);
}

/**
 * True when a Wild Card has ended up on more than one token, which is always a
 * mistake: their wounds would be shared. Harmless and expected for an Extra.
 */
export function duplicateWildCard(
  tokens: readonly TokenLike[],
  sheet: Pick<Sheet, 'id' | 'wildCard'>,
): boolean {
  return sheet.wildCard && tokensForSheet(tokens, sheet.id).length > 1;
}
