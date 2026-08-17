/**
 * How a die leaves the hand.
 *
 * This exists because it was duplicated, and the copies drifted. The tray overrode the
 * renderer's throw to fire from a player's seat; the tuning page kept its own older copy
 * for its seat buttons and used the library's stock throw everywhere else. So the page
 * built to judge the throw was not showing the throw — the speed and spin sliders moved
 * numbers that nothing in that page read. One implementation, used by both.
 */
import type DiceBox from '@drdreo/dice-box-threejs';
import { jitter, seatVector } from '../../src/obr/seats.js';
import type { Seat } from '../../src/obr/diceThrow.js';
import { scaled } from './effects.js';

/**
 * Give a die a forward roll: spin about the axis across its own direction of travel, so
 * it tumbles the way it is going rather than spinning like a thrown coin.
 *
 * For a body travelling along `d` with `z` up, rolling forward means angular velocity
 * along `(-d.y, d.x, 0)` — the axis for which `ω × r` points along `d` at the contact
 * point underneath. The library's own spin comes from a separate random vector, so a die
 * could come out back-spinning or spinning flat.
 *
 * The magnitude is an absolute number of radians per second, and can be: angular
 * velocity is the one quantity here that does not depend on the length scale.
 */
function rollForward(vector: {
  velocity: { x: number; y: number; z: number };
  angle: { x: number; y: number; z: number };
}): void {
  const { velocity, angle } = vector;
  const speed = Math.hypot(velocity.x, velocity.y);
  if (!speed) return;

  const { min, max } = scaled().spin;
  const strength = min + Math.random() * (max - min);
  // Up to ±20° off true, so the die drifts as it rolls instead of tracking a rail.
  const tilt = (Math.random() - 0.5) * (Math.PI / 4.5);
  const across = { x: -velocity.y / speed, y: velocity.x / speed };
  angle.x = (across.x * Math.cos(tilt) - across.y * Math.sin(tilt)) * strength;
  angle.y = (across.x * Math.sin(tilt) + across.y * Math.cos(tilt)) * strength;
  // A little spin about the vertical too, or a die that lands flat sits dead still
  // rather than settling with a turn.
  angle.z = (Math.random() - 0.5) * strength * 0.3;
}

export interface ThrowVector {
  pos: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  angle: { x: number; y: number; z: number };
}

/**
 * Where dice are released, per die.
 *
 * Three dice abreast, then a row above, and so on. The spacing exists because the first
 * version of this put *every* die at exactly one point — "one hand, one point of
 * release" — which starts them interpenetrating, and a solver asked to separate two
 * bodies that occupy the same space does it with enormous force. Dice shot into the tray
 * regardless of how gently they were thrown, because the speed they arrived with had
 * nothing to do with the throw.
 *
 * 140 across and 170 up: a d20 is the biggest die here at roughly 200 units, so this is
 * not enough to guarantee no overlap for a fistful of d20s, but it is enough that any
 * overlap is shallow and resolves as a nudge rather than a launch. Dice tumbling out of
 * a cup touch each other; they just do not start inside each other.
 */
function releasePoint(index: number, base: { x: number; y: number }, across: { x: number; y: number }): { x: number; y: number; z: number } {
  const column = (index % 3) - 1;
  const row = Math.floor(index / 3);
  return {
    x: base.x + across.x * column * 140,
    y: base.y + across.y * column * 140,
    z: 200 + row * 170,
  };
}

/**
 * Throw from one edge of the screen, at a real speed, with a forward roll.
 *
 * The renderer's own `startClickThrow` is replaced rather than adjusted, because almost
 * none of what it does is wanted: it picks a random direction, and derives each die's
 * spawn from the *sign* of that die's own randomised vector — which is why dice from the
 * same seat did not come from the same place. A seat that means "the top of the screen"
 * has to name the point, not sample it.
 *
 * So: the seat fixes the release point exactly, the throw is aimed at the middle of the
 * tray, and the only randomness left is a few degrees on the aim and the spin. Positions
 * are clamped inside the walls — the tray's edges are at 0.93 of the half-extent, and a
 * die spawned outside them is a die that never appears.
 */
export function aimThrow(
  box: DiceBox,
  seat: Seat,
  onThrow?: (vectors: ThrowVector[]) => void,
): () => void {
  // The seat is the edge the player sits at, so the dice start there and are thrown
  // towards the middle. `+y` is up on screen: the camera looks down `-z` with three's
  // default up vector, which is what settles the sign convention that was marked
  // unverified in `seats.ts`.
  const edge = seatVector(seat);

  (box as unknown as { startClickThrow: (n: string) => unknown }).startClickThrow = function (
    notationString: string,
  ) {
    const self = this as unknown as {
      display: { containerWidth: number; containerHeight: number };
      getNotationVectors: (n: string, v: unknown, boost: number, dist: number) => unknown;
      rolling: boolean;
      clearDice: () => void;
    };
    if (self.rolling) {
      self.clearDice();
      self.rolling = false;
    }

    const halfWidth = self.display.containerWidth;
    const halfHeight = self.display.containerHeight;
    // Aim for the middle, give or take a few degrees. The aim is the only thing jittered:
    // jittering the release point is what made "top" mean a different place each time.
    const aim = jitter({ x: -edge.x, y: -edge.y });
    const speed = scaled().throwSpeed * (0.85 + Math.random() * 0.3);

    const thrown = self.getNotationVectors(notationString, { x: aim.x, y: aim.y }, 1, 1) as {
      vectors: ThrowVector[];
    };

    const base = { x: edge.x * halfWidth * 0.78, y: edge.y * halfHeight * 0.78 };
    const across = { x: -edge.y, y: edge.x };
    const limit = { x: halfWidth * 0.86, y: halfHeight * 0.86 };

    thrown.vectors.forEach((vector, index) => {
      const at = releasePoint(index, base, across);
      vector.pos = {
        x: Math.max(-limit.x, Math.min(limit.x, at.x)),
        y: Math.max(-limit.y, Math.min(limit.y, at.y)),
        z: at.z,
      };
      vector.velocity = { x: aim.x * speed, y: aim.y * speed, z: -10 };
      rollForward(vector);
    });

    onThrow?.(thrown.vectors);
    return thrown;
  };

  return () => {
    delete (box as unknown as { startClickThrow?: unknown }).startClickThrow;
  };
}

/**
 * Make the next throw repeatable.
 *
 * A throw draws on randomness from three places: this module, the renderer's own
 * `vectorRand` and spawn height, and nothing else that matters. Only one of those is
 * ours, so seeding a generator of our own would leave most of the throw varying — and a
 * physics parameter cannot be judged by eye while the throw underneath it changes too.
 * Replacing `Math.random` for the duration covers all of it.
 *
 * Safe because every draw happens *synchronously* inside `roll()`: the renderer builds
 * its vectors, spawns the bodies and pre-simulates before it returns a promise. Restore
 * as soon as that call returns — the animation frames afterwards need no randomness.
 */
export function seedRandom(seed: number): () => void {
  const original = Math.random;
  // A plain LCG. Nothing here needs statistical quality; it needs to be the same twice.
  let state = seed >>> 0 || 1;
  Math.random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return () => {
    Math.random = original;
  };
}
