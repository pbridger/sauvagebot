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
  return -(wounds + fatigue);
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

/** Short text for a token badge — empty when there is nothing to show. */
export function badgeText(
  state: Pick<TokenState, 'wounds' | 'fatigue' | 'shaken'>,
  wildCard: boolean,
): string {
  if (isIncapacitated(state, wildCard)) return 'OUT';
  const parts: string[] = [];
  if (state.wounds > 0) parts.push(`${state.wounds}W`);
  if (state.fatigue > 0) parts.push(`${state.fatigue}F`);
  if (state.shaken) parts.push('!');
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
