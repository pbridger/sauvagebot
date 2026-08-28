/**
 * A Benny slid across the table.
 *
 * At a real table the Marshal does not announce a Benny, they flick a chip at you,
 * and the chip is half the reward. The log line already says who got what; this is
 * the other half — a poker chip that travels from the giver's edge of the screen to
 * the receiver's, on everybody's screen at once.
 *
 * ## Why it carries places and not names
 *
 * The payload is two seat numbers and a ring size. No character, no sheet id, no
 * player name. That is deliberate and it is the same rule the roll log follows: a
 * Benny can go to an NPC Wild Card the players cannot see, and a parallel channel
 * that named its receiver would announce that NPC while `named()` was carefully not
 * announcing it. A chip is anonymous, so it can be shown to everybody.
 *
 * It rides on `relativeVector` for exactly the reason the dice do: everybody sits at
 * the bottom of their own screen, so only the reader can turn "place 3" into an edge.
 * Sending a direction instead of a place would be sending the giver's opinion of
 * where the receiver is, which is only right on the giver's monitor.
 */
import { relativeVector, type SeatVector } from './seats.js';

export const BENNY_CHANNEL = 'com.savagebot/benny';

/** The middle of the felt: where a chip comes from when it comes from nobody. */
export const CENTRE: SeatVector = { x: 0, y: 0 };

export interface BennyToss {
  /** The giver's place at the table. */
  from: number;
  /**
   * The receiver's place, when a player at this table has claimed the sheet.
   *
   * Absent for an NPC Wild Card, and for a PC whose player is not in the room —
   * both of which are real and neither of which is an error. The chip then lands in
   * the middle rather than at somebody who is not there.
   */
  to?: number;
  /** How many places the giver was counting round, so the ring can be rotated. */
  places: number;
}

export function isBennyToss(value: unknown): value is BennyToss {
  if (!value || typeof value !== 'object') return false;
  const toss = value as Partial<BennyToss>;
  return (
    Number.isInteger(toss.from) &&
    Number.isInteger(toss.places) &&
    (toss.places as number) > 0 &&
    (toss.to === undefined || Number.isInteger(toss.to))
  );
}

/**
 * Where the chip starts and where it ends, on *this* screen.
 *
 * Both are unit vectors in the seat convention — `+y` up, an edge of the screen —
 * or `CENTRE`, which is not a direction at all but the middle of the window.
 *
 * Three cases, and the two odd ones are the interesting ones:
 *
 *   - **normally**, edge to edge: from where the Marshal sits to where the player
 *     sits, which on the player's own screen means it slides down to them.
 *   - **no receiver**, edge to middle: the chip goes onto the table. Used for an
 *     NPC, and for a player who is not in the room.
 *   - **giver is the receiver** — the Marshal taking one for themselves — middle to
 *     edge. Sliding from a place to the same place is no movement at all, so the
 *     chip is taken *off* the table instead. That reads correctly for the one thing
 *     it is used for, and it means no caller has to special-case it.
 */
export function tossPath(mine: number, toss: BennyToss): { from: SeatVector; to: SeatVector } {
  if (toss.to === undefined) {
    return { from: relativeVector(mine, toss.from, toss.places), to: { ...CENTRE } };
  }
  if (toss.to === toss.from) {
    return { from: { ...CENTRE }, to: relativeVector(mine, toss.to, toss.places) };
  }
  return {
    from: relativeVector(mine, toss.from, toss.places),
    to: relativeVector(mine, toss.to, toss.places),
  };
}

/**
 * A seat vector as a point on the window, in per-cent of each axis.
 *
 * `+y` is up in the seat convention and down in CSS, hence the sign flip — the same
 * flip the dice avoid by living in a three.js scene that shares the convention.
 *
 * `REACH` is past 50 on purpose: an edge should be *off* the screen, so a chip
 * appears from beyond the border rather than popping into being just inside it.
 */
export const REACH = 58;

export function screenPoint(vector: SeatVector): { left: number; top: number } {
  return { left: 50 + vector.x * REACH, top: 50 - vector.y * REACH };
}
