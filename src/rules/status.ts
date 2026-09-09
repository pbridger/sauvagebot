/**
 * Wounds, Fatigue and Shaken.
 *
 * The reason these belong on the sheet rather than in a token menu is this
 * module: wounds and fatigue penalise *every* trait roll, so once the sheet
 * knows a character has two wounds, its Shooting button can roll `s8-2` on its
 * own. That penalty otherwise lives in someone's head.
 *
 * Thresholds below are from the Weird West core rules: wounds and their penalty
 * p148, Fatigue p156. They were written from memory until Damian pointed out
 * that wounds cut Pace as well as rolls, which sent someone to the book.
 */
import type { TokenState } from '../obr/binding.js';
import type { Sheet } from './sheet.js';
import { situationalMods, type ModifierState, type RollMod } from './modifiers.js';

/** `"Wild Cards can take three Wounds and still function"` — p148. */
export const MAX_WOUNDS_WILD_CARD = 3;
/** An Extra is Incapacitated by the first wound rather than tracking a level. */
export const MAX_WOUNDS_EXTRA = 0;
/** Fatigued, Exhausted, then Incapacitated — p156. */
export const MAX_FATIGUE = 2;

export const FATIGUE_NAMES = ['', 'Fatigued', 'Exhausted'] as const;

export function maxWounds(wildCard: boolean): number {
  return wildCard ? MAX_WOUNDS_WILD_CARD : MAX_WOUNDS_EXTRA;
}

/**
 * Whoever the wound track belongs to — the character, not a flag.
 *
 * This deliberately does **not** accept a bare boolean, and that is the second
 * version of it. The first did, on the reasoning that the call sites which only
 * ever had `sheet.wildCard` to hand could stay as they were. What actually
 * happened is that all ten of them stayed as they were, so the override reached
 * none of the UI: Coffin Rock's Blood Men were `maxWounds: 0` in the data and
 * took three wounds on screen, and nothing failed to compile.
 *
 * Requiring the sheet is what makes that a type error instead of a bug report.
 */
export type WoundBearer = Pick<Sheet, 'wildCard' | 'maxWounds'>;

/**
 * How many wounds this character takes before going down.
 *
 * `Sheet.maxWounds` wins when it is set, which is how a **Henchman** works:
 * Coffin Rock's Blood Men roll a wild die "as though they were Wild Cards" but
 * are not Wild Cards, so they are `wildCard: true, maxWounds: 0`. That is the
 * whole of the fix — no third state, no split boolean.
 */
export function woundLimit(who: WoundBearer): number {
  return who.maxWounds ?? maxWounds(who.wildCard);
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
 * The floor the book puts under a wounded character's Pace.
 *
 * `"a −1 cumulative penalty to their Pace (minimum of 1″)"` — p148. Three wounds
 * do not stop a Pace 2 critter moving; they leave it crawling an inch.
 */
export const MIN_PACE = 1;

/**
 * What wounds take off Pace. Negative or zero.
 *
 * **Fatigue is deliberately absent, and that is the whole content of this
 * function.** p148 gives wounds `"a −1 cumulative penalty to their Pace
 * (minimum of 1″) and all Trait rolls"`; p156 gives Fatigue `"subtracts 1 from
 * all Trait rolls"` and says nothing about Pace. So an Exhausted character rolls
 * at −2 and walks at their full Pace, and `traitPenalty` is the wrong number to
 * reach for here even though it is one line away.
 */
export function pacePenalty(state: Pick<TokenState, 'wounds'>): number {
  const wounds = clamp(state.wounds, 0, MAX_WOUNDS_WILD_CARD);
  return wounds === 0 ? 0 : -wounds;
}

/**
 * How far this character actually walks, wounds included.
 *
 * The floor is applied here, *before* anything adds a running die: a Pace 2
 * critter with three wounds moves 1″, and runs 1″ + d6. Flooring the total
 * afterwards would instead let the die be eaten by the clamp.
 *
 * The running die itself is untouched. It is not a Trait roll — which is the same
 * reason `running.ts` rolls a plain `d6` rather than the exploding `s6` the rest
 * of the sheet uses — so wounds come off the Pace they are added to and nowhere
 * else. Subtracting them from both would be the same penalty twice.
 */
export function effectivePace(base: number, state: Pick<TokenState, 'wounds'>): number {
  return Math.max(MIN_PACE, base + pacePenalty(state));
}

/**
 * The same penalty `traitPenalty` returns, itemised — "2 wounds −2, Fatigued −1"
 * rather than a bare −3.
 */
export function statusMods(state: Pick<TokenState, 'wounds' | 'fatigue'>): RollMod[] {
  const mods: RollMod[] = [];
  const wounds = clamp(state.wounds, 0, MAX_WOUNDS_WILD_CARD);
  if (wounds > 0) {
    mods.push({
      label: `${wounds} wound${wounds === 1 ? '' : 's'}`,
      value: -wounds,
      kind: 'status',
      // The same notation as the token badge, so the map and the log agree.
      short: `${wounds}W`,
    });
  }
  const fatigue = clamp(state.fatigue, 0, MAX_FATIGUE);
  if (fatigue > 0) {
    mods.push({
      label: FATIGUE_NAMES[fatigue] ?? `Fatigue ${fatigue}`,
      value: -fatigue,
      kind: 'status',
      short: `${fatigue}F`,
    });
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
  who: WoundBearer,
): boolean {
  return state.wounds > woundLimit(who) || state.fatigue > MAX_FATIGUE;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Math.round(value || 0)));
}

/** Clamp a click on the wound track to something legal, allowing one past max. */
export function setWounds(state: TokenState, wounds: number, who: WoundBearer): TokenState {
  return { ...state, wounds: clamp(wounds, 0, woundLimit(who) + 1) };
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
  who: WoundBearer,
): string {
  if (isIncapacitated(state, who)) return 'OUT';
  const parts: string[] = [];
  if (state.wounds > 0) parts.push(`${state.wounds}W`);
  if (state.fatigue > 0) parts.push(`${state.fatigue}F`);
  return parts.join(' ');
}

/** A sentence for the sheet, e.g. "2 wounds, Fatigued, Shaken". */
export function describeStatus(
  state: Pick<TokenState, 'wounds' | 'fatigue' | 'shaken'>,
  who: WoundBearer,
): string {
  if (isIncapacitated(state, who)) return 'Incapacitated';
  const parts: string[] = [];
  if (state.wounds > 0) parts.push(`${state.wounds} wound${state.wounds === 1 ? '' : 's'}`);
  const fatigue = FATIGUE_NAMES[clamp(state.fatigue, 0, MAX_FATIGUE)];
  if (fatigue) parts.push(fatigue);
  if (state.shaken) parts.push('Shaken');
  return parts.length ? parts.join(', ') : 'Unharmed';
}
