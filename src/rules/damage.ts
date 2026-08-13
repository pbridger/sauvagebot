/**
 * Applying damage.
 *
 * !! SWADE-standard, written from memory, pending the book. !!
 * The thresholds are constants below; the shape is what matters here.
 *
 * The rule, as implemented:
 *   - damage below Toughness does nothing;
 *   - damage at or above Toughness makes the target **Shaken**;
 *   - every full 4 points above Toughness is a **wound** instead;
 *   - a Shaken target that is Shaken again takes a wound;
 *   - **Extras** do not track wounds — any wound puts one out;
 *   - **AP** cancels armour, but only as much armour as there is.
 */
import type { TokenState } from '../obr/binding.js';
import { maxWounds } from './status.js';
import type { Sheet } from './sheet.js';

/** UNVERIFIED — pending the book. Every this-many points over Toughness is a wound. */
export const RAISE_STEP = 4;

export interface DamageInput {
  /** Total rolled damage. */
  damage: number;
  /** Armour-piercing on the attack, if any. */
  ap?: number;
}

export interface DamageOutcome {
  /** The state to write back. */
  state: TokenState;
  wounds: number;
  becameShaken: boolean;
  incapacitated: boolean;
  /** Effective Toughness after AP, for the explanation. */
  toughness: number;
  /** One line for the roll log. */
  description: string;
}

/**
 * Toughness after armour-piercing.
 *
 * A sheet's `toughness` already *includes* its armour — that is how the cards
 * write it — so AP is subtracted from the total, capped at the armour actually
 * worn. Without the cap, a high-AP round would cut into flesh as well as plate.
 */
export function effectiveToughness(sheet: Sheet, ap = 0): number {
  const toughness = sheet.toughness ?? 4;
  const armor = sheet.armor ?? 0;
  return toughness - Math.min(Math.max(ap, 0), armor);
}

export function applyDamage(
  sheet: Sheet,
  state: TokenState,
  { damage, ap = 0 }: DamageInput,
): DamageOutcome {
  const toughness = effectiveToughness(sheet, ap);
  const margin = damage - toughness;

  if (margin < 0) {
    return {
      state,
      wounds: 0,
      becameShaken: false,
      incapacitated: false,
      toughness,
      description: `${damage} vs Toughness ${toughness} — no effect`,
    };
  }

  let wounds = Math.floor(margin / RAISE_STEP);
  let becameShaken = false;

  if (wounds === 0) {
    // A Shaken target that takes another Shaken result is wounded instead.
    if (state.shaken) wounds = 1;
    else becameShaken = true;
  }

  const next: TokenState = {
    ...state,
    // Wounds always Shake as well, and there is no un-Shaking by being hit.
    shaken: state.shaken || becameShaken || wounds > 0,
    wounds: state.wounds + wounds,
  };

  const limit = maxWounds(sheet.wildCard);
  const incapacitated = next.wounds > limit;

  const parts = [`${damage} vs Toughness ${toughness}`];
  if (wounds > 0) parts.push(`${wounds} wound${wounds === 1 ? '' : 's'}`);
  if (becameShaken) parts.push('Shaken');
  else if (wounds > 0 && !state.shaken) parts.push('Shaken');
  if (incapacitated) parts.push('**Incapacitated**');

  return {
    state: next,
    wounds,
    becameShaken,
    incapacitated,
    toughness,
    description: parts.join(' — '),
  };
}

/**
 * The Soak roll: spend a benny (a Fate Chip, in Deadlands), roll Vigor, and
 * remove one wound per success and raise.
 *
 * Only the arithmetic lives here. What it costs to attempt is a Deadlands
 * question still waiting on the book, so nothing is spent by this function.
 */
export const SOAK_TARGET = 4;

export function soak(state: TokenState, vigorTotal: number, woundsTaken: number): TokenState {
  if (vigorTotal < SOAK_TARGET) return state;
  const removed = Math.min(1 + Math.floor((vigorTotal - SOAK_TARGET) / RAISE_STEP), woundsTaken);
  const wounds = Math.max(0, state.wounds - removed);
  return {
    ...state,
    wounds,
    // Soaking away every wound from the hit also clears the Shaken it caused.
    shaken: removed >= woundsTaken ? false : state.shaken,
  };
}

/** Wounds a Soak roll of this total would remove. */
export function soakedWounds(vigorTotal: number): number {
  if (vigorTotal < SOAK_TARGET) return 0;
  return 1 + Math.floor((vigorTotal - SOAK_TARGET) / RAISE_STEP);
}
