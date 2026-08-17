/**
 * Who throws from where.
 *
 * Dice arriving from the same edge every week is the cheapest identity cue there
 * is: you know whose roll it is before you read a word of it. The Marshal takes
 * the top of the screen and the players come in from the sides, which is also
 * roughly how everyone is sitting.
 *
 * **Seats are screen space, not map space.** "The Marshal rolls from the top" means
 * the top of each viewer's own window; a seat has nothing to do with the map's
 * coordinates, anybody's viewport, or where their token is.
 *
 * ## Persistence
 *
 * Room metadata, keyed by player id, beside the existing `com.savagebot/mine/<id>`
 * key. That mechanism is the precedent for "per-player, survives a tab close" —
 * `panel.ts` records that player metadata does *not* survive one. A seat letter and
 * a flag per player is tens of bytes, so this is nothing against the room budget.
 *
 * !! It assumes `OBR.player.id` is stable across sessions, which the `mine/` key
 * already assumes. If that turns out to be false both features break together, and
 * the fix for both is to key on player name instead.
 *
 * A player who never comes back leaves their seat key behind. Deliberately not
 * cleaned up: a seat is ~40 characters, a guest who missed one session is not gone,
 * and pruning "players not currently connected" would reassign the seats of anyone
 * who happened to be late.
 */

import type { Seat } from './diceThrow.js';

export const SEAT_PREFIX = 'com.savagebot/seat/';
export const DICE_PREFIX = 'com.savagebot/dice-anim/';

/** The Marshal's seat. Dice come down the screen at the table. */
export const GM_SEAT: Seat = 'n';

/**
 * The order players are given seats in.
 *
 * Opposite the Marshal first, then the two sides, then the corners: with three
 * players the table reads as one Marshal facing three players rather than as an
 * arbitrary scatter. The Marshal's own seat is never handed out, even at a table
 * of nine — two people throwing down the same edge is the one arrangement that
 * defeats the purpose.
 */
export const PLAYER_SEATS: readonly Seat[] = ['s', 'w', 'e', 'sw', 'se', 'nw', 'ne'];

export interface Seated {
  id: string;
  name: string;
  gm: boolean;
}

/**
 * Work out everyone's seat, keeping the ones already assigned.
 *
 * Stability is the whole feature, so an existing assignment is only overridden
 * when it has to be: a player holding the Marshal's seat because they used to run
 * the game, or two players who somehow hold the same one. The tie is broken by
 * player id rather than by join order, which is arbitrary but at least the same
 * arbitrary thing every week.
 */
export function assignSeats(
  players: readonly Seated[],
  stored: Readonly<Record<string, Seat>>,
): Record<string, Seat> {
  const seats: Record<string, Seat> = {};
  const taken = new Set<Seat>();

  for (const gm of players.filter((p) => p.gm)) {
    // Every GM gets the top. Two GMs in a room is unusual but legal, and sharing
    // the edge is better than exiling one of them to a corner.
    seats[gm.id] = GM_SEAT;
  }

  const guests = players.filter((p) => !p.gm).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const player of guests) {
    const existing = stored[player.id];
    if (existing && existing !== GM_SEAT && !taken.has(existing)) {
      seats[player.id] = existing;
      taken.add(existing);
    }
  }
  for (const player of guests) {
    if (seats[player.id]) continue;
    const free = PLAYER_SEATS.find((seat) => !taken.has(seat));
    // More players than seats: everyone still rolls, they just share an edge.
    const seat = free ?? PLAYER_SEATS[0]!;
    seats[player.id] = seat;
    taken.add(seat);
  }

  return seats;
}

export interface SeatVector {
  x: number;
  y: number;
}

/**
 * The direction a seat throws in, as a unit-ish vector.
 *
 * The library derives the spawn point from the *sign* of the throw vector — dice
 * enter from the edge opposite the way they are travelling — so `n` throws
 * downwards and the dice appear at the top.
 *
 * !! The sign convention (`y` positive downwards, as in screen coordinates, rather
 * than upwards as in the physics world) is inferred from the bundle and is checked
 * by the spike page. If it is inverted, negate `y` here and nowhere else.
 */
export function seatVector(seat: Seat): SeatVector {
  const d = Math.SQRT1_2;
  switch (seat) {
    case 'n':
      return { x: 0, y: 1 };
    case 's':
      return { x: 0, y: -1 };
    case 'w':
      return { x: 1, y: 0 };
    case 'e':
      return { x: -1, y: 0 };
    case 'nw':
      return { x: d, y: d };
    case 'ne':
      return { x: -d, y: d };
    case 'sw':
      return { x: d, y: -d };
    case 'se':
      return { x: -d, y: -d };
  }
}

/** Human wording for the seat picker. */
export function seatLabel(seat: Seat): string {
  switch (seat) {
    case 'n':
      return 'Top';
    case 's':
      return 'Bottom';
    case 'w':
      return 'Left';
    case 'e':
      return 'Right';
    case 'nw':
      return 'Top left';
    case 'ne':
      return 'Top right';
    case 'sw':
      return 'Bottom left';
    case 'se':
      return 'Bottom right';
  }
}

/**
 * Rotate a throw vector by a few degrees so two rolls from one seat are not the
 * same throw twice. Small on purpose: a wide spread would blur the one thing the
 * seat is for.
 */
export function jitter(vector: SeatVector, random: () => number = Math.random): SeatVector {
  const angle = (random() - 0.5) * (Math.PI / 9); // ±10°
  return {
    x: vector.x * Math.cos(angle) - vector.y * Math.sin(angle),
    y: vector.x * Math.sin(angle) + vector.y * Math.cos(angle),
  };
}
