/**
 * The wire format for the animated dice tray, and the staging that turns a
 * finished roll into something worth watching.
 *
 * ## Why this is not on the roll channel
 *
 * `publish()` sends a `RollEntry` with `destination: 'REMOTE'`, because the roller
 * has already added the entry to their own log. A `dice` field there would
 * therefore animate on every screen *except* the one belonging to whoever rolled —
 * exactly backwards — and secret rolls, which are never broadcast at all, would
 * animate nowhere. So dice travel on their own channel, sent to everyone including
 * the sender, and a secret roll sends it locally only. The roll id ties the two
 * together.
 *
 * ## The engine decides, the physics performs
 *
 * Every value here has already been rolled by the conformance-tested engine. The
 * tray is told what to show; it does not roll anything. See `docs/OBR-DICE-PLAN.md`
 * §1 for why the alternative — deterministic physics as the random source, which is
 * what Owlbear's own dice extension does — was rejected.
 */

import type { DieEvent, DieRole } from '../dice/roller.js';

export const DICE_CHANNEL = 'com.savagebot/dice';

/**
 * The tray telling its own panel that the dice have stopped, so the line it is
 * holding back can be printed. Sent `LOCAL`: reveal is a local matter and no client
 * should wait on another client's frame rate.
 */
export const DICE_SETTLED_CHANNEL = 'com.savagebot/dice-settled';

/**
 * The overlay's modal id. Lives here rather than in `tray.ts` so the panel can open
 * and close it without importing the module that pulls in the whole renderer.
 */
export const TRAY_MODAL_ID = 'com.savagebot/dice-tray';

/**
 * A compass edge of the screen. No longer part of a throw — see `DiceThrow.place` —
 * and kept for the tuning page, which throws from a named edge on purpose.
 */
export type Seat = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';

export interface DiceThrow {
  /** The `RollEntry.id` this belongs to, so the log line can wait for the tray. */
  id: string;
  dice: DieEvent[];
  /**
   * The roller's chair at the table, and how many chairs there are.
   *
   * Absolute, not a screen direction, and that is the whole design: every viewer
   * is at the bottom of their own screen, so a direction is only meaningful once
   * you know who is reading it. The receiver looks up its own place and works out
   * the angle with `relativeVector`. Putting an edge on the wire instead would
   * mean the sender deciding where the dice appear on somebody else's screen,
   * which it cannot know.
   */
  place: number;
  places: number;
  /** The roller's OBR party colour, so you can tell whose dice those are. */
  colour?: string;
}

const SEATS: readonly Seat[] = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
const ROLES: readonly DieRole[] = ['trait', 'wild', 'plain'];

export function isSeat(value: unknown): value is Seat {
  return typeof value === 'string' && (SEATS as readonly string[]).includes(value);
}

/**
 * A chair on a table that has that chair.
 *
 * Checked as a pair rather than separately: a place of 4 on a table of 3 is not a
 * bad number, it is an inconsistent message, and it would land a player on top of
 * whoever holds index 1.
 */
function isPlace(place: unknown, places: unknown): boolean {
  return (
    typeof place === 'number' &&
    typeof places === 'number' &&
    Number.isInteger(place) &&
    Number.isInteger(places) &&
    places >= 1 &&
    place >= 0 &&
    place < places
  );
}

function isDieEvent(value: unknown): value is DieEvent {
  if (!value || typeof value !== 'object') return false;
  const die = value as Partial<DieEvent>;
  return (
    typeof die.sides === 'number' &&
    Number.isInteger(die.sides) &&
    die.sides >= 2 &&
    die.sides <= 100 &&
    typeof die.value === 'number' &&
    Number.isInteger(die.value) &&
    die.value >= 1 &&
    die.value <= die.sides &&
    typeof die.chain === 'number' &&
    Number.isInteger(die.chain) &&
    typeof die.step === 'number' &&
    Number.isInteger(die.step) &&
    die.step >= 0 &&
    typeof die.role === 'string' &&
    (ROLES as readonly string[]).includes(die.role)
  );
}

/**
 * Incoming throws come from other clients, so nothing about their shape is
 * guaranteed. The bounds on `sides` and `value` are not paranoia: they are handed
 * straight to a physics library as notation, and a `d0` or a value the die cannot
 * show is a hang or a thrown exception inside someone else's render loop.
 */
export function isDiceThrow(value: unknown): value is DiceThrow {
  if (!value || typeof value !== 'object') return false;
  const thrown = value as Partial<DiceThrow>;
  return (
    typeof thrown.id === 'string' &&
    isPlace(thrown.place, thrown.places) &&
    (thrown.colour === undefined || typeof thrown.colour === 'string') &&
    Array.isArray(thrown.dice) &&
    thrown.dice.length > 0 &&
    thrown.dice.length <= MAX_DICE &&
    thrown.dice.every(isDieEvent)
  );
}

/**
 * How many dice one throw may put on the table.
 *
 * `20d20!` is a legal expression and an unwatchable animation; someone typing
 * `100d6` should get their result, not a locked-up tab. Over the cap the tray
 * shows nothing and the result appears at once, which is the same behaviour as
 * having animation switched off.
 */
export const MAX_DICE = 24;

/**
 * The dice, split into the order they should hit the table.
 *
 * Wave 0 is everything that was thrown to begin with. Wave 1 is the dice those
 * aces bought, wave 2 the dice *those* aces bought, and so on — which is exactly
 * `step`, already recorded by the roller. The tray throws wave 0, waits a beat,
 * then adds each subsequent wave.
 *
 * Empty waves cannot occur in the middle: a die at step *n* only exists because
 * some die reached step *n−1*.
 */
export function waves(dice: readonly DieEvent[]): DieEvent[][] {
  const deepest = dice.reduce((max, die) => Math.max(max, die.step), -1);
  const out: DieEvent[][] = [];
  for (let step = 0; step <= deepest; step++) {
    out.push(dice.filter((die) => die.step === step));
  }
  return out;
}

/**
 * One wave as dice-box notation with predetermined values.
 *
 * `1d8+1d6@6,6` — the dice, then **one** `@` list for all of them.
 *
 * Both halves of that shape were got wrong first time, and both were wrong in ways
 * a unit test could not see, so they are worth recording:
 *
 *  1. **One `@`, at the end.** `1d8@7+1d6@3` looks reasonable and quietly throws a
 *     single die: the parser does `notation.split('@')` and treats everything before
 *     the first `@` as the whole dice expression, so the d6 was never a die at all —
 *     it was scanned for numbers and became part of the value list. Which is exactly
 *     "only one die is rolled, and it is not the Wild Die".
 *  2. **Group by size, not by adjacency.** The parser merges sets that agree on size
 *     and operator, so `1d6+1d8+1d6` becomes *two* sets — two d6 and one d8 — and
 *     the dice are then created in set order. A value list in the original order
 *     would be handed to the wrong dice. Grouping here means the order this function
 *     writes is the order the renderer builds.
 */
export function notation(wave: readonly DieEvent[]): string {
  const sets: { sides: number; values: number[] }[] = [];
  for (const die of wave) {
    const existing = sets.find((set) => set.sides === die.sides);
    if (existing) existing.values.push(die.value);
    else sets.push({ sides: die.sides, values: [die.value] });
  }
  const dice = sets.map((set) => `${set.values.length}d${set.sides}`).join('+');
  const values = sets.flatMap((set) => set.values);
  return `${dice}@${values.join(',')}`;
}

/** How long to hold between an ace landing and the die it bought being thrown. */
export const ACE_BEAT_MS = 450;

/**
 * The dice of a wave in the order the renderer will create them.
 *
 * `notation` groups by die size, and the renderer builds its dice set by set, so this
 * is what lines the engine's dice up with the renderer's results — needed to point an
 * effect at the right die on the table. Same grouping, same order, one place.
 */
export function inNotationOrder(wave: readonly DieEvent[]): DieEvent[] {
  const sizes = [...new Set(wave.map((die) => die.sides))];
  return sizes.flatMap((sides) => wave.filter((die) => die.sides === sides));
}

/**
 * Which dice of this wave bought another one.
 *
 * Read off the chains rather than by comparing a value to its die's size: an ace is
 * "this chain continues", which is the engine's own reason for rolling again, and it
 * stays right if a future die ever explodes on something other than its maximum.
 */
export function acedIn(wave: readonly DieEvent[], next: readonly DieEvent[] | undefined): Set<number> {
  if (!next) return new Set();
  const continuing = new Set(next.map((die) => die.chain));
  return new Set(wave.filter((die) => continuing.has(die.chain)).map((die) => die.chain));
}

/**
 * Reveal the result anyway after this long, when we do not know what was thrown.
 *
 * The log is the source of truth and the tray is decoration: a stalled physics
 * simulation, a lost message or a WebGL context loss must cost the table a nice
 * animation, never a result.
 *
 * Only for a roll whose dice have not arrived — a remote line whose throw is still
 * in flight on the other channel. With the dice to hand, `revealDelay` knows how
 * many waves there are and can do better than a flat guess.
 */
export const REVEAL_CAP_MS = 6_000;

/**
 * How long one wave takes to come to rest.
 *
 * The physics settle, not a guess at the whole throw. It was **700ms** inside
 * `revealDelay`'s per-ace term, which was far short of what the tray actually
 * spends: each extra wave costs an `await` on the box settling the new dice, and
 * that is the same order as the first throw rather than half of it.
 */
export const THROW_MS = 1_500;

/**
 * Never hold a line longer than this, however many aces there were.
 *
 * Above `REVEAL_CAP_MS` because it is reached only by a roll we can see the dice
 * for — four aces in a chain genuinely takes this long to animate, and cutting it
 * off at six seconds is what produced the bug this replaces: the line appearing
 * while the dice bought by the second ace were still in the air.
 */
export const REVEAL_MAX_MS = 9_000;

/**
 * How long to hold a log line back, when nothing has said the dice have stopped.
 *
 * The tray reports its own settle and that is what normally triggers the reveal;
 * this is the fallback for a client whose tray was closed, torn down for idleness,
 * or never opened — and for a tray that has quietly died.
 *
 * It must not be *shorter* than the animation, which is the trap it fell into. A
 * fallback that fires early is not a fallback at all — it is a race with the real
 * mechanism, and it wins exactly when there is something worth watching. An ace
 * costs the beat before the die it bought is thrown **and** the time that die
 * takes to settle, and only the first of those was being counted.
 */
export function revealDelay(dice: readonly DieEvent[]): number {
  const extra = Math.max(0, waves(dice).length - 1);
  return Math.min(REVEAL_MAX_MS, THROW_MS + extra * (ACE_BEAT_MS + THROW_MS));
}
