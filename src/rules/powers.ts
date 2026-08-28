/**
 * Power Points — the pool a Blessed or a Huckster spends to cast.
 *
 * Damian: *"we have no way of tracking power points"*. Minimal support, per
 * Paul's scoping — it is one player character and possibly a couple of NPCs, so
 * this is a number with a spend and a recover, not a powers engine.
 *
 * ## Where the maximum comes from
 *
 * The stat block's own Powers section. Jed Tuffin's archetype card reads
 * `POWER POINTS: 20`, which `importArchetypeCard` parses into a `NamedEntry`
 * named `POWER POINTS` with the text `20`. So the figure is already on every
 * sheet that has one and nothing needs re-importing — it was simply never read,
 * and until today was not even displayed, because the Edge of the same name won
 * the lookup.
 *
 * Read rather than stored as its own field. A Marshal correcting it edits the
 * Powers block, which is the thing they can now see and which is where the book
 * prints it; a second field would be a second place for it to be wrong.
 */
import type { NamedEntry, Sheet } from './sheet.js';

/** `POWER POINTS`, `Power Points`, `PowerPoints:` — the name, however written. */
const POWER_POINTS = /^power\s*points\b/i;

/**
 * The first whole number in the text, which is the figure.
 *
 * `20` and `20 PP` both give 20. Deliberately not a sum: a card reading
 * "15 (+5 from Soul Drain)" means fifteen, and quietly adding the parenthetical
 * would hand somebody five points the book did not.
 */
function firstNumber(text: string | undefined): number | undefined {
  const found = /\d+/.exec(text ?? '');
  if (!found) return undefined;
  const value = Number(found[0]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** The `POWER POINTS` line from a sheet's Powers block, if it has one. */
export function powerPointsEntry(sheet: Sheet): NamedEntry | undefined {
  return sheet.powers?.find((entry) => POWER_POINTS.test(entry.name.trim()));
}

/**
 * How many Power Points this character has at full.
 *
 * `undefined` for everyone who does not cast, which is most of the table — and
 * is what keeps the counter off their sheets rather than showing them a nought.
 */
export function maxPowerPoints(sheet: Sheet): number | undefined {
  return firstNumber(powerPointsEntry(sheet)?.text);
}

/** Whether to offer this character a Power Point counter at all. */
export function castsPowers(sheet: Sheet): boolean {
  return maxPowerPoints(sheet) !== undefined;
}

/**
 * Clamp a spend or a recovery to the pool.
 *
 * Never below nothing and never above the maximum. Recovery in Savage Worlds is
 * capped at your own total — points do not bank — and a counter that let them
 * would be a slow way to break a session.
 */
export function adjustPoints(current: number, delta: number, max: number): number {
  return Math.min(Math.max(current + delta, 0), max);
}
