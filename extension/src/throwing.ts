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
import { jitter, seatVector, type SeatVector } from '../../src/obr/seats.js';
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

interface ThrowVector {
  pos: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  angle: { x: number; y: number; z: number };
}

/**
 * Throw from one edge of the screen, at a real speed, with a forward roll.
 *
 * Replaces the renderer's `startClickThrow`, which picks a random direction and derives
 * each die's spawn point from the sign of that die's own randomised vector. Three things
 * change: the direction is the player's seat, the speed is an absolute number rather
 * than a multiple of the panel width, and every die of a throw leaves from one point.
 *
 * @returns a function that puts the renderer's own throw back. The replacement is an own
 *   property over a prototype method, so restoring means deleting it.
 */
export function aimThrow(box: DiceBox, seat: Seat): () => void {
  const direction: SeatVector = jitter(seatVector(seat));

  (box as unknown as { startClickThrow: (n: string) => unknown }).startClickThrow = function (
    notationString: string,
  ) {
    const self = this as unknown as {
      display: { currentWidth: number; currentHeight: number };
      getNotationVectors: (n: string, v: unknown, boost: number, dist: number) => unknown;
      rolling: boolean;
      clearDice: () => void;
    };
    if (self.rolling) {
      self.clearDice();
      self.rolling = false;
    }
    const reach = {
      x: direction.x * self.display.currentWidth,
      y: direction.y * self.display.currentHeight,
    };
    const distance = Math.sqrt(reach.x * reach.x + reach.y * reach.y) + 100;
    // A real toss, not a multiple of the panel's width. The library's own boost scales
    // with the window, so the same roll left a die harder on a big monitor.
    const boost = scaled().throwSpeed * (0.85 + Math.random() * 0.3);
    const thrown = self.getNotationVectors(notationString, reach, boost, distance) as {
      vectors: ThrowVector[];
    };

    for (const vector of thrown.vectors) rollForward(vector);

    // One hand, one point of release. The library derives each die's spawn from its own
    // randomised direction, so a trait die and its Wild Die could enter from opposite
    // ends of the same edge and read as two people rolling. Overwriting every position
    // with the first die's — after the library has worked it out, so its aspect-ratio
    // correction still applies — puts them in one hand while leaving their directions
    // and spins alone, which is what makes them scatter on the way out.
    const first = thrown.vectors[0]?.pos;
    if (first) {
      for (const vector of thrown.vectors) {
        // A little height between them, or dice launched from one point start
        // interpenetrating and the solver flings them apart.
        vector.pos = { x: first.x, y: first.y, z: first.z + (vector.pos.z - first.z) * 0.25 };
      }
    }
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
