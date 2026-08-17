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

/** Where a player's dice come in from. `n` is the Marshal's seat. */
export type Seat = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';

export interface DiceThrow {
  /** The `RollEntry.id` this belongs to, so the log line can wait for the tray. */
  id: string;
  dice: DieEvent[];
  seat: Seat;
  /** The roller's OBR party colour, so you can tell whose dice those are. */
  colour?: string;
}

const SEATS: readonly Seat[] = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
const ROLES: readonly DieRole[] = ['trait', 'wild', 'plain'];

export function isSeat(value: unknown): value is Seat {
  return typeof value === 'string' && (SEATS as readonly string[]).includes(value);
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
    isSeat(thrown.seat) &&
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
 * Reveal the result anyway after this long, however the tray is getting on.
 *
 * The log is the source of truth and the tray is decoration: a stalled physics
 * simulation, a lost message or a WebGL context loss must cost the table a nice
 * animation, never a result.
 */
export const REVEAL_CAP_MS = 6_000;

/**
 * How long to hold a log line back, when nothing has said the dice have stopped.
 *
 * The tray reports its own settle and that is what normally triggers the reveal;
 * this is the fallback for a client whose tray was closed, torn down for idleness,
 * or never opened — and for a tray that has quietly died. Roughly the time a throw
 * takes to come to rest, plus a beat for each ace, and never more than the cap.
 */
export function revealDelay(dice: readonly DieEvent[]): number {
  const extra = Math.max(0, waves(dice).length - 1);
  return Math.min(REVEAL_CAP_MS, 1_500 + extra * (ACE_BEAT_MS + 700));
}
