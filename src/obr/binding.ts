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
 * `autoBindings` matches tokens to characters by name. It is deliberately
 * conservative: it binds only where exactly one token matches exactly one
 * character, and never overwrites a binding that already exists. A wrong
 * automatic bind is worse than no bind, because nobody would think to check.
 */
import type { Sheet } from '../rules/sheet.js';

export const TOKEN_KEY = 'com.savagebot/token';

export interface TokenState {
  sheetId: string;
  wounds: number;
  fatigue: number;
  shaken: boolean;
  card?: { suit: string; rank: number };
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
    typeof state.shaken === 'boolean'
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
 * Work out which unbound tokens obviously belong to which characters.
 *
 * "Obviously" is doing real work: a name must match exactly one token *and*
 * exactly one character. A scene with three tokens called "Bandit" and one
 * Bandit sheet produces nothing, which is the right answer — guessing would
 * silently attach three tokens to one character's wounds.
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
    if (matched.length !== 1 || sheetMatches?.length !== 1) continue;
    bindings.push({ tokenId: matched[0]!.id, sheetId: sheetMatches[0]!.id });
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
 * Every token bound to a given sheet. Normally one — but a duplicated token
 * carries the binding with it, so the caller must cope with more.
 */
export function tokensForSheet(tokens: readonly TokenLike[], sheetId: string): TokenLike[] {
  return tokens.filter((token) => readBinding(token.metadata)?.sheetId === sheetId);
}
