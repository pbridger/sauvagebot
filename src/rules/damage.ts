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
import { woundLimit } from './status.js';
import type { Sheet } from './sheet.js';

/** UNVERIFIED — pending the book. Every this-many points over Toughness is a wound. */
export const RAISE_STEP = 4;

export interface DamageInput {
  /** Total rolled damage. */
  damage: number;
  /** Armour-piercing on the attack, if any. */
  ap?: number;
}

/**
 * An adjustment the Marshal makes to a damage roll before it is applied.
 *
 * ## Why this exists instead of a table of monster abilities
 *
 * Coffin Rock alone needs Hardy, Undead and Construct halving, three kinds of
 * Immunity, Invulnerable, Ethereal, Weakness (Head) and Swarm — and the open
 * bestiary has 159 more abilities that each appear exactly *once* across 219
 * creatures. Encoding them is not a large job, it is an unbounded one, and the
 * result would still be wrong for the next book.
 *
 * So the app does not learn the rules. It asks. One control in front of the one
 * place damage is committed covers every halving, doubling and nullification
 * that has ever been written, including the ones nobody has written yet.
 *
 * It is also the more honest answer to "make the effect transparent and
 * well-logged": what ends up in the log is what a person decided —
 * *"11 halved (Construct: piercing) = 5 vs Toughness 7 — no effect"* — rather
 * than what the app inferred and cannot explain.
 *
 * There is deliberately no "no damage" option. Not applying damage at all is
 * already spelled "do not press Apply".
 */
export interface DamageAdjustment {
  /** Multiplier — 0.5 for the near-universal "piercing attacks do half damage". */
  factor?: number;
  /** Flat change, e.g. Weakness (Head) at +2. */
  delta?: number;
  /** Shown in the log. Without it nobody can audit the number afterwards. */
  reason?: string;
}

/**
 * The damage actually applied, after the Marshal's adjustment.
 *
 * The order matters and is not arbitrary. Halving applies to the **damage
 * roll**, before it meets Toughness — which is what "piercing attacks do half
 * damage" says. Halving the *wounds* afterwards gives a different and wrong
 * answer: 11 against Toughness 7 is one wound, and half of that rounds to none,
 * where halving first gives 5 against 7 and no effect at all. Two different
 * outcomes from the same words.
 *
 * Rounded down, which is the convention every "half damage" line in these books
 * relies on.
 */
export function adjustedDamage(damage: number, adjust: DamageAdjustment | undefined): number {
  if (!adjust) return damage;
  const scaled = adjust.factor === undefined ? damage : Math.floor(damage * adjust.factor);
  return Math.max(0, scaled + (adjust.delta ?? 0));
}

/** "11 halved +2 = 7", for the log. Empty when nothing was changed. */
export function describeAdjustment(
  damage: number,
  adjust: DamageAdjustment | undefined,
): string {
  if (!adjust || (adjust.factor === undefined && !adjust.delta)) return '';
  const parts: string[] = [String(damage)];
  if (adjust.factor !== undefined) {
    parts.push(adjust.factor === 0.5 ? 'halved' : `×${adjust.factor}`);
  }
  if (adjust.delta) parts.push(adjust.delta > 0 ? `+${adjust.delta}` : String(adjust.delta));
  const sum = `${parts.join(' ')} = ${adjustedDamage(damage, adjust)}`;
  return adjust.reason ? `${sum} (${adjust.reason})` : sum;
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
  { damage: rolled, ap = 0 }: DamageInput,
  adjust?: DamageAdjustment,
): DamageOutcome {
  const toughness = effectiveToughness(sheet, ap);
  // Before Toughness, deliberately — see `adjustedDamage`.
  const damage = adjustedDamage(rolled, adjust);
  // The working is kept whole so the log can show where the number came from:
  // a committed wound with no visible arithmetic is the thing this whole area
  // exists to stop.
  const shown = describeAdjustment(rolled, adjust) || String(damage);
  const margin = damage - toughness;

  if (margin < 0) {
    return {
      state,
      wounds: 0,
      becameShaken: false,
      incapacitated: false,
      toughness,
      description: `${shown} vs Toughness ${toughness} — no effect`,
    };
  }

  let wounds = Math.floor(margin / RAISE_STEP);
  let becameShaken = false;

  if (wounds === 0) {
    // A Shaken target that takes another Shaken result is wounded instead.
    if (state.shaken) wounds = 1;
    else becameShaken = true;
  }

  const hit: TokenState = {
    ...state,
    // Wounds always Shake as well, and there is no un-Shaking by being hit.
    shaken: state.shaken || becameShaken || wounds > 0,
    wounds: state.wounds + wounds,
  };
  // Only a hit that *wounds* opens the window. A Shaken-only result leaves the
  // previous one alone rather than closing it: the character has not stopped
  // being freshly wounded because somebody else's shot glanced off, and closing
  // it here would take the offer away over an event that cost them nothing.
  //
  // What closes it instead: the Soak itself, pass or fail, and the next round —
  // by then the moment the rules mean by "immediately" has gone.
  const next: TokenState = wounds > 0 ? { ...hit, soakable: wounds } : hit;

  const limit = woundLimit(sheet);
  const incapacitated = next.wounds > limit;

  const parts = [`${shown} vs Toughness ${toughness}`];
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

/**
 * Take the pending Soak off a token.
 *
 * Deletes the key rather than setting it to `undefined`: `exactOptionalPropertyTypes`
 * forbids the assignment, and a key present-but-undefined would also cost bytes
 * in the token metadata for the sake of saying nothing.
 */
export function closeSoakWindow(state: TokenState): TokenState {
  const { soakable: _spent, ...rest } = state;
  return rest;
}

export function soak(state: TokenState, vigorTotal: number, woundsTaken: number): TokenState {
  // A failed Soak still spends the Benny and still closes the window: the roll
  // was the attempt, and leaving the button up would offer a second go at the
  // same wound for a second chip.
  if (vigorTotal < SOAK_TARGET) return closeSoakWindow(state);
  const removed = Math.min(1 + Math.floor((vigorTotal - SOAK_TARGET) / RAISE_STEP), woundsTaken);
  const wounds = Math.max(0, state.wounds - removed);
  return closeSoakWindow({
    ...state,
    wounds,
    // Soaking away every wound from the hit also clears the Shaken it caused.
    shaken: removed >= woundsTaken ? false : state.shaken,
  });
}

/** Wounds a Soak roll of this total would remove. */
export function soakedWounds(vigorTotal: number): number {
  if (vigorTotal < SOAK_TARGET) return 0;
  return 1 + Math.floor((vigorTotal - SOAK_TARGET) / RAISE_STEP);
}
