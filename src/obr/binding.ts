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
 * Item metadata is per-scene, so every binding is lost when the GM opens a new
 * map. Re-binding six PCs at the start of each scene would be miserable, so
 * `autoBindings` matches tokens to characters by name. It never overwrites an
 * existing binding, and never guesses when a name is ambiguous — a wrong
 * automatic bind is worse than no bind, because nobody would think to check.
 * Wild Cards take one token; Extras take as many as share the name.
 */
import { SUITS, type Card } from '../game/cards.js';
import type { Sheet } from '../rules/sheet.js';

export const TOKEN_KEY = 'com.savagebot/token';

export interface TokenState {
  sheetId: string;
  wounds: number;
  fatigue: number;
  shaken: boolean;
  /** Initiative card, dealt from the action deck. */
  card?: Card;
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
    (state.card === undefined || isCard(state.card))
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

/** The minimum this module needs to know about an OBR item. */
export interface TokenLike {
  id: string;
  name: string;
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
export function tokensForSheet(tokens: readonly TokenLike[], sheetId: string): TokenLike[] {
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
