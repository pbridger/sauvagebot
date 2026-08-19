/**
 * Who sits where at the table, and which way their dice come in.
 *
 * Dice arriving from the same direction every week is the cheapest identity cue
 * there is: you know whose roll it is before you read a word of it. The way that
 * used to work was a fixed screen edge per player — the Marshal at the top, the
 * players around the sides — chosen by the Marshal from a picker.
 *
 * **That is no longer how it works, and the difference is worth stating.** A place
 * at the table is now absolute and shared, and the *direction* is worked out per
 * viewer: you are always at the bottom of your own screen, and everyone else
 * appears where they sit relative to you. Two consequences:
 *
 *  - The Marshal's dice no longer come from the top of the Marshal's own screen.
 *    They come from the bottom, like everybody else's, because on your own screen
 *    you are at the bottom. Whether Damian appears at the top depends on where he
 *    is sitting relative to you, which is the point.
 *  - There is nothing left to configure. A direction is derived, not chosen, so
 *    the seat picker is gone.
 *
 * **Places are absolute; directions are screen space.** A place has nothing to do
 * with the map's coordinates, anybody's viewport, or where their token is — it is
 * a chair at an imaginary round table, and the only thing it is used for is the
 * angle dice come in at.
 *
 * ## Persistence
 *
 * Room metadata, keyed by player id, beside the existing `com.savagebot/mine/<id>`
 * key. That mechanism is the precedent for "per-player, survives a tab close" —
 * `panel.ts` records that player metadata does *not* survive one. A place is an
 * integer per player, so this is nothing against the room budget.
 *
 * The key is `com.savagebot/place/<id>` and **not** the old `seat/<id>`, whose
 * values are compass strings. Reusing it would mean reading `'nw'` where a number
 * is expected, which typechecks as `unknown` and fails silently — the same shape as
 * a bug this codebase has already paid for once. The old keys are left to rot;
 * everyone is simply re-seated once, invisibly, since nobody chooses a place now.
 *
 * !! It assumes `OBR.player.id` is stable across sessions, which the `mine/` key
 * already assumes. If that turns out to be false both features break together, and
 * the fix for both is to key on player name instead.
 */

import type { Seat } from './diceThrow.js';

/** Where a player's place is remembered. Not `seat/`, which held compass strings. */
export const PLACE_PREFIX = 'com.savagebot/place/';
export const DICE_PREFIX = 'com.savagebot/dice-anim/';

export interface Seated {
  id: string;
  name: string;
  gm: boolean;
}

function isPlace(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * The stored places, pulled out of a metadata document and keyed by player id.
 *
 * Shared because two pages need the same answer from the same input: the panel, which
 * hands the places out, and the tray, which works out its own the same way rather than
 * reading whatever happens to have been written. Values are left `unknown` — deciding
 * what counts as a place is `assignPlaces`'s job, in one place.
 */
export function storedPlaces(metadata: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const found: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith(PLACE_PREFIX)) found[key.slice(PLACE_PREFIX.length)] = value;
  }
  return found;
}

/**
 * Work out everyone's place at the table, keeping the ones already assigned.
 *
 * Stability is the whole feature, so an existing assignment is only overridden when
 * two players somehow hold the same one. The tie is broken by player id rather than
 * by join order, which is arbitrary but at least the same arbitrary thing every
 * week.
 *
 * The Marshal has no special place. Under the old fixed-edge scheme they held the
 * top, because that was the one edge the layout was defined against; with the view
 * rotated to put each viewer at the bottom there is no such edge to hold — which is
 * why this takes bare ids rather than `Seated`: there is no longer anything about a
 * player except their identity that this function is allowed to care about.
 *
 * A player who leaves keeps their index: their neighbours do not shuffle round
 * mid-session, which would defeat the identity cue. The gap they leave is filled by
 * the next person to join — see `ringSize` for why the gap costs nothing.
 *
 * **Deterministic in its inputs, deliberately.** Two clients given the same party and
 * the same stored values get the same answer, which is what lets the tray work out its
 * own place instead of waiting to be told one.
 */
export function assignPlaces(
  players: readonly { id: string }[],
  stored: Readonly<Record<string, unknown>>,
): Record<string, number> {
  const places: Record<string, number> = {};
  const taken = new Set<number>();

  const ordered = [...players].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const player of ordered) {
    const existing = stored[player.id];
    if (isPlace(existing) && !taken.has(existing)) {
      places[player.id] = existing;
      taken.add(existing);
    }
  }
  for (const player of ordered) {
    if (places[player.id] !== undefined) continue;
    let free = 0;
    while (taken.has(free)) free++;
    places[player.id] = free;
    taken.add(free);
  }

  return places;
}

/**
 * How many chairs the table has.
 *
 * The highest occupied index plus one, rather than a count of who is present. Both
 * of the obvious alternatives are wrong:
 *
 *  - **The live head count** puts a player at index 3 on a table of 3, where the
 *    angle maths wraps them onto index 0 and two people share a direction.
 *  - **Every index ever stored** leaves ghost chairs from a player who missed a
 *    session, squeezing four people who *are* here into a corner of a table of
 *    nine.
 *
 * Highest-plus-one is self-compacting: of four players 0–3, if #2 leaves, the ring
 * is still 4 and the other three do not move — and the next person to join takes
 * the empty chair rather than widening the table.
 */
export function ringSize(places: Readonly<Record<string, number>>): number {
  const indices = Object.values(places);
  if (!indices.length) return 1;
  return Math.max(...indices) + 1;
}

export interface SeatVector {
  x: number;
  y: number;
}

/** Straight down the screen: where your own dice always come from. */
export const BOTTOM: SeatVector = { x: 0, y: -1 };

/**
 * Which edge of *my* screen a die thrown from `theirs` should come in at.
 *
 * Everyone is at the bottom of their own screen, so the table is drawn rotated to
 * put the viewer there and everybody else follows round. Places advance clockwise
 * as seen on screen — from the bottom, that is bottom → left → top → right — and
 * because every viewer applies the same rotation sense, the arrangement is mutually
 * consistent: if Jen is on your left then you are on Jen's right, as at a real
 * table.
 *
 * Dice are released *at* this point and thrown towards the middle.
 *
 * `+y` is up. The camera looks down `-z` with three's default up vector, which is
 * what settles the sign convention.
 *
 * The modulo is doing real work: two clients can briefly disagree about the party,
 * so `mine` may be off the end of the ring the thrower measured. Wrapping puts them
 * somewhere rather than off the table.
 */
export function relativeVector(mine: number, theirs: number, places: number): SeatVector {
  const ring = Math.max(1, Math.floor(places));
  const delta = (((theirs - mine) % ring) + ring) % ring;
  // Exactly, not to within a rounding error: your own dice come from the bottom,
  // and `Math.sin(0)` being 0 is not something to leave to a library.
  if (delta === 0) return { ...BOTTOM };
  const angle = (2 * Math.PI * delta) / ring;
  // Rotating (0, −1) clockwise on screen by `angle`.
  return { x: -Math.sin(angle), y: -Math.cos(angle) };
}

/**
 * The eight compass edges, as unit vectors.
 *
 * Nothing on the dice channel uses these any more — a direction is derived from a
 * pair of places. It survives for the tuning page, which throws from a named edge
 * on purpose so a physics change can be judged from a fixed throw.
 */
export function seatVector(seat: Seat): SeatVector {
  const d = Math.SQRT1_2;
  switch (seat) {
    case 'n':
      return { x: 0, y: 1 };
    case 's':
      return { x: 0, y: -1 };
    case 'w':
      return { x: -1, y: 0 };
    case 'e':
      return { x: 1, y: 0 };
    case 'nw':
      return { x: -d, y: d };
    case 'ne':
      return { x: d, y: d };
    case 'sw':
      return { x: -d, y: -d };
    case 'se':
      return { x: d, y: -d };
  }
}

/** Human wording for the tuning page's edge buttons. */
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
 * Rotate a throw vector by a few degrees so two rolls from one place are not the
 * same throw twice. Small on purpose: a wide spread would blur the one thing the
 * arrangement is for.
 */
export function jitter(vector: SeatVector, random: () => number = Math.random): SeatVector {
  const angle = (random() - 0.5) * (Math.PI / 9); // ±10°
  return {
    x: vector.x * Math.cos(angle) - vector.y * Math.sin(angle),
    y: vector.x * Math.sin(angle) + vector.y * Math.cos(angle),
  };
}
