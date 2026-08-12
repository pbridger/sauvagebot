/**
 * Deadlands: The Weird West — Fate Chips.
 *
 * Chips replace bennies. The distinction that matters for the design is that a
 * chip pot is a *finite bag drawn from without replacement*, with non-fungible
 * colours — not a counter. See docs/OBR-DEADLANDS-PLAN.md §3 for why that forces
 * single-writer semantics in the extension.
 *
 * !! RULES NUMBERS ARE UNVERIFIED. !!
 * The pot composition and the chip effects below are written from memory and are
 * pending a check against the Weird West book. Everything that is a *number* is
 * isolated in `DEFAULT_POT` and `CHIP_EFFECTS` precisely so that correcting them
 * is a one-line change that no other code depends on.
 *
 * Also pending the book, and *not* merely a number:
 *   - whether a spent chip returns to the pot (assumed here) or goes to a discard;
 *   - end-of-session handling, which differs by colour — white is lost, red and
 *     blue are cashed for something. Not modelled yet.
 *
 * What is not in doubt is that the pot is drawn from without replacement and that
 * holdings are per-owner. Those are the parts the extension's design rests on.
 */
import { JavaRandom } from '../dice/javaRandom.js';

/** Fixed iteration order. Draw results depend on it, so it must never change. */
export const CHIP_COLORS = ['WHITE', 'RED', 'BLUE', 'LEGEND'] as const;

export type ChipColor = (typeof CHIP_COLORS)[number];

/** A count per colour. Used for both the pot and a player's holdings. */
export type ChipCounts = Readonly<Record<ChipColor, number>>;

export const NO_CHIPS: ChipCounts = { WHITE: 0, RED: 0, BLUE: 0, LEGEND: 0 };

/** UNVERIFIED — pending the book. */
export const DEFAULT_POT: ChipCounts = { WHITE: 20, RED: 10, BLUE: 5, LEGEND: 1 };

/** UNVERIFIED — pending the book. `bonus` is the modifier a spent chip adds to a reroll. */
export const CHIP_EFFECTS: Readonly<Record<ChipColor, { bonus: number; label: string }>> = {
  WHITE: { bonus: 0, label: 'White' },
  RED: { bonus: 1, label: 'Red' },
  BLUE: { bonus: 2, label: 'Blue' },
  LEGEND: { bonus: 2, label: 'Legend' },
};

export function totalChips(counts: ChipCounts): number {
  return CHIP_COLORS.reduce((sum, color) => sum + counts[color], 0);
}

function adjust(counts: ChipCounts, color: ChipColor, delta: number): ChipCounts {
  return { ...counts, [color]: counts[color] + delta };
}

/**
 * The minimum a draw needs from a random source. `JavaRandom` satisfies it, which
 * lets tests pin exact draw sequences by seed the same way the dice tests do.
 */
export interface Rng {
  nextInt(bound: number): number;
}

export function seededRng(seed: number | bigint): Rng {
  return new JavaRandom(seed);
}

export class PotEmptyError extends Error {
  constructor() {
    super('the chip pot is empty');
    this.name = 'PotEmptyError';
  }
}

/**
 * Draw one chip. Returns the drawn colour and the depleted pot; the caller owns
 * the state, so a draw can be rejected without having mutated anything.
 */
export function drawChip(pot: ChipCounts, rng: Rng): { chip: ChipColor; pot: ChipCounts } {
  const total = totalChips(pot);
  if (total === 0) throw new PotEmptyError();

  let index = rng.nextInt(total);
  for (const color of CHIP_COLORS) {
    index -= pot[color];
    if (index < 0) return { chip: color, pot: adjust(pot, color, -1) };
  }
  /* c8 ignore next -- unreachable: the loop consumes exactly `total` */
  throw new Error('unreachable');
}

/**
 * Draw up to `count` chips. Stops early on an empty pot rather than throwing, so
 * dealing the party a hand when the pot is nearly dry does not fail wholesale.
 */
export function drawChips(
  pot: ChipCounts,
  count: number,
  rng: Rng,
): { chips: ChipColor[]; pot: ChipCounts } {
  const chips: ChipColor[] = [];
  let remaining = pot;
  for (let i = 0; i < count && totalChips(remaining) > 0; i++) {
    const draw = drawChip(remaining, rng);
    chips.push(draw.chip);
    remaining = draw.pot;
  }
  return { chips, pot: remaining };
}

export function addChips(counts: ChipCounts, chips: readonly ChipColor[]): ChipCounts {
  return chips.reduce<ChipCounts>((acc, chip) => adjust(acc, chip, 1), counts);
}

/**
 * Spend one chip from a holding. Spent chips go back into the pot, so the two
 * halves move together and the total stays conserved — an invariant worth
 * asserting in tests, because it catches most state-handling mistakes.
 */
export function spendChip(
  holding: ChipCounts,
  pot: ChipCounts,
  color: ChipColor,
): { holding: ChipCounts; pot: ChipCounts } {
  if (holding[color] <= 0) throw new Error(`no ${CHIP_EFFECTS[color].label} chip to spend`);
  return { holding: adjust(holding, color, -1), pot: adjust(pot, color, 1) };
}

/** The GM awarding a chip: drawn from the pot, so it is still without replacement. */
export function awardChip(
  holding: ChipCounts,
  pot: ChipCounts,
  rng: Rng,
): { chip: ChipColor; holding: ChipCounts; pot: ChipCounts } {
  const { chip, pot: after } = drawChip(pot, rng);
  return { chip, holding: adjust(holding, chip, 1), pot: after };
}

export class ChipConservationError extends Error {
  constructor(expected: number, found: number) {
    super(`chip total is ${found}, expected ${expected} — a draw was lost or duplicated`);
    this.name = 'ChipConservationError';
  }
}

/**
 * Pot + every holding must always equal the starting total.
 *
 * The pot is the one structure in the design that per-owner keys cannot protect:
 * it is inherently one shared key with one writer, so leader election is the
 * *only* mitigation — and election is advisory (see `obr/leader.ts`). During a
 * leader handover two clients can briefly both draw, which shows up here and
 * nowhere else. Call this after every draw, not just in tests.
 */
export function assertConserved(
  pot: ChipCounts,
  holdings: readonly ChipCounts[],
  expectedTotal: number,
): void {
  const found = totalChips(pot) + holdings.reduce((sum, h) => sum + totalChips(h), 0);
  if (found !== expectedTotal) throw new ChipConservationError(expectedTotal, found);
}

export function formatChips(counts: ChipCounts): string {
  const parts = CHIP_COLORS.filter((c) => counts[c] > 0).map(
    (c) => `${counts[c]} ${CHIP_EFFECTS[c].label}`,
  );
  return parts.length ? parts.join(', ') : 'none';
}
