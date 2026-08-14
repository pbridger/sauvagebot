/**
 * Wounds, Fatigue and Shaken.
 *
 * The reason these belong on the sheet rather than in a token menu is this
 * module: wounds and fatigue penalise *every* trait roll, so once the sheet
 * knows a character has two wounds, its Shooting button can roll `s8-2` on its
 * own. That penalty otherwise lives in someone's head.
 *
 * !! Thresholds are SWADE-standard and written from memory, pending the book. !!
 * They are isolated in the constants below.
 */
import type { TokenState } from '../obr/binding.js';
import { situationalMods, type ModifierState, type RollMod } from './modifiers.js';

/** UNVERIFIED — pending the book. */
export const MAX_WOUNDS_WILD_CARD = 3;
/** An Extra is Incapacitated by the first wound rather than tracking a level. */
export const MAX_WOUNDS_EXTRA = 0;
/** UNVERIFIED — Fatigue runs Fatigued, Exhausted, then Incapacitated. */
export const MAX_FATIGUE = 2;

export const FATIGUE_NAMES = ['', 'Fatigued', 'Exhausted'] as const;

export function maxWounds(wildCard: boolean): number {
  return wildCard ? MAX_WOUNDS_WILD_CARD : MAX_WOUNDS_EXTRA;
}

/**
 * The modifier every trait roll picks up. Negative or zero.
 *
 * Shaken deliberately contributes nothing: it restricts what you may *do* on
 * your turn, it is not a penalty on the roll.
 */
export function traitPenalty(state: Pick<TokenState, 'wounds' | 'fatigue'>): number {
  const wounds = clamp(state.wounds, 0, MAX_WOUNDS_WILD_CARD);
  const fatigue = clamp(state.fatigue, 0, MAX_FATIGUE);
  const total = wounds + fatigue;
  // `-(0)` is -0, which formats as "−0" in a trait label. Return a plain zero.
  return total === 0 ? 0 : -total;
}

/**
 * The same penalty `traitPenalty` returns, itemised — "2 wounds −2, Fatigued −1"
 * rather than a bare −3.
 */
export function statusMods(state: Pick<TokenState, 'wounds' | 'fatigue'>): RollMod[] {
  const mods: RollMod[] = [];
  const wounds = clamp(state.wounds, 0, MAX_WOUNDS_WILD_CARD);
  if (wounds > 0) {
    mods.push({ label: `${wounds} wound${wounds === 1 ? '' : 's'}`, value: -wounds, kind: 'status' });
  }
  const fatigue = clamp(state.fatigue, 0, MAX_FATIGUE);
  if (fatigue > 0) {
    mods.push({ label: FATIGUE_NAMES[fatigue] ?? `Fatigue ${fatigue}`, value: -fatigue, kind: 'status' });
  }
  return mods;
}

/**
 * Everything modifying this character's trait rolls right now, kept as one
 * object rather than a number.
 *
 * The reason it is an object: a button label computed from one number and a roll
 * computed from another is a bug nobody sees. Both now come from `total`, and
 * `parts` is the same figure broken up so the sheet and the log can colour where
 * it came from — red for what the character is carrying, green for what the
 * Marshal called.
 */
export interface RollBreakdown {
  /** Wounds and Fatigue. Never positive. */
  status: number;
  /** Conditions and the manual dial. */
  situational: number;
  total: number;
  parts: RollMod[];
}

export function rollBreakdown(
  state: (Pick<TokenState, 'wounds' | 'fatigue'> & ModifierState) | undefined,
): RollBreakdown {
  if (!state) return { status: 0, situational: 0, total: 0, parts: [] };
  const parts = [...statusMods(state), ...situationalMods(state)];
  const status = traitPenalty(state);
  const situational = parts
    .filter((mod) => mod.kind === 'situational')
    .reduce((sum, mod) => sum + mod.value, 0);
  return { status, situational, total: status + situational, parts };
}

export function isIncapacitated(
  state: Pick<TokenState, 'wounds' | 'fatigue'>,
  wildCard: boolean,
): boolean {
  return state.wounds > maxWounds(wildCard) || state.fatigue > MAX_FATIGUE;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Math.round(value || 0)));
}

/** Clamp a click on the wound track to something legal, allowing one past max. */
export function setWounds(state: TokenState, wounds: number, wildCard: boolean): TokenState {
  return { ...state, wounds: clamp(wounds, 0, maxWounds(wildCard) + 1) };
}

export function setFatigue(state: TokenState, fatigue: number): TokenState {
  return { ...state, fatigue: clamp(fatigue, 0, MAX_FATIGUE + 1) };
}

export function setShaken(state: TokenState, shaken: boolean): TokenState {
  return { ...state, shaken };
}

/**
 * Short text for the damage badge — empty when there is nothing to show.
 *
 * Shaken is deliberately *not* included. It is a different kind of thing: you
 * can be Shaken and unwounded, or wounded and not Shaken, and folding both into
 * one badge made the more urgent of the two invisible behind the other. The
 * caller draws Shaken as its own marker.
 */
export function damageBadge(
  state: Pick<TokenState, 'wounds' | 'fatigue'>,
  wildCard: boolean,
): string {
  if (isIncapacitated(state, wildCard)) return 'OUT';
  const parts: string[] = [];
  if (state.wounds > 0) parts.push(`${state.wounds}W`);
  if (state.fatigue > 0) parts.push(`${state.fatigue}F`);
  return parts.join(' ');
}

/** A sentence for the sheet, e.g. "2 wounds, Fatigued, Shaken". */
export function describeStatus(
  state: Pick<TokenState, 'wounds' | 'fatigue' | 'shaken'>,
  wildCard: boolean,
): string {
  if (isIncapacitated(state, wildCard)) return 'Incapacitated';
  const parts: string[] = [];
  if (state.wounds > 0) parts.push(`${state.wounds} wound${state.wounds === 1 ? '' : 's'}`);
  const fatigue = FATIGUE_NAMES[clamp(state.fatigue, 0, MAX_FATIGUE)];
  if (fatigue) parts.push(fatigue);
  if (state.shaken) parts.push('Shaken');
  return parts.length ? parts.join(', ') : 'Unharmed';
}
