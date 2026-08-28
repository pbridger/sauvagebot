/**
 * A poker chip sliding on felt, simulated rather than choreographed.
 *
 * The first version of the Benny toss was a keyframed slide, and the objection to it
 * was right: a canned path reads as canned. This is a rigid body — position, velocity,
 * orientation, angular velocity — under Coulomb friction, bouncing off the four walls
 * of the window with a friction coupling at the contact, integrated at a fixed step.
 * The chip is *drawn* by writing a transform onto a div, but nothing about the motion
 * comes from CSS.
 *
 * ## Why this is two dimensions and not three
 *
 * A chip on a table has no interesting third axis. It does not tumble, it does not
 * bounce off the felt, and it is never seen edge-on. Everything that makes a slid chip
 * look like a slid chip — it runs out rather than stopping dead, it spins up when it
 * clips a wall, a spinning one deflects sideways off one — is planar. That is the whole
 * reason this is a hundred lines here instead of a mesh, a collider and a rigid body in
 * a physics world `@drdreo/dice-box-threejs` owns and does not expose.
 *
 * ## Units
 *
 * The same discipline as `effects.ts`: the constants below are **real** — 39 mm, 9.81,
 * clay on baize — and can be argued with against the world. One transformation turns
 * them into pixels and screen seconds, and it happens in exactly one place.
 *
 * The scale is not invented. The chip is drawn at some size in pixels and it is a real
 * chip 39 mm across, so those two numbers *are* the conversion — which makes the felt
 * about a metre and a third wide on a laptop, which is about a table.
 */
import { jitter } from './seats.js';

const G = 9.81;

export const CHIP = {
  /** A casino chip: 39 mm across, 10 g. The mass cancels; it is here to be checked. */
  diameter: 0.039,
  mass: 0.01,
  /**
   * Clay on baize. Low, because the thing a slid chip does that a stopped one does not
   * is *run out* — friction high enough to look decisive kills the whole gesture.
   */
  friction: 0.2,
  /** The walls are the edge of the felt, and hard. The same figure the dice use. */
  wallRestitution: 0.7,
  /**
   * Friction at the wall, which is what couples spin to travel. Without it a chip
   * reflects like a billiard ball and the spin is decoration; with it, a chip that
   * clips a wall spinning walks sideways off it, and that is the single most
   * convincing thing in the whole animation.
   */
  wallFriction: 0.25,
  /** A flicked chip turns fast: three to seven revolutions a second. */
  spin: { min: 19, max: 44 },
  /** 2 cm/s, as for the dice, before it counts as stopped. */
  stillSpeed: 0.02,
  /**
   * How fast to play it back, for the reason set out at length in `effects.ts`: a chip
   * drawn at life size on a screen a foot from your face is magnified over how you
   * would ever watch one, and correct physics through a magnifying glass reads as a
   * gunshot. Gentler than the dice's 0.4 because a slide is already slower than a
   * throw, and because there is nothing here to *land* — no moment that has to be
   * legible, just a chip running out.
   */
  timeScale: 0.8,
} as const;

/**
 * Pixels to the metre, from the one thing that fixes it: the chip is a real chip and
 * it is drawn some number of pixels wide.
 */
export function pixelsPerMetre(radius: number): number {
  return (radius * 2) / CHIP.diameter;
}

export interface Chip {
  /** Centre, in pixels from the top left of the window. */
  x: number;
  y: number;
  /** Pixels a second. `+y` is down, as everywhere in the DOM. */
  vx: number;
  vy: number;
  /** Radians, and radians a second. */
  angle: number;
  spin: number;
  radius: number;
  /**
   * Constant frictional decelerations, fixed at launch.
   *
   * Constant rather than proportional because that is what Coulomb friction is: the
   * force does not care how fast you are going, so a slid chip loses speed linearly
   * and stops, where a damped one would asymptote and never arrive.
   */
  decel: number;
  spinDecel: number;
  /**
   * Whether the chip has made it onto the felt yet.
   *
   * It is launched from *outside* the window, so for the first few frames it is
   * through every wall at once. Enforcing the walls immediately would clamp it to the
   * border and fire a collision on the spot. It is not on the table until it is on the
   * table.
   */
  landed: boolean;
}

export interface Walls {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The window, inset by the radius, so the walls are where the *centre* may go. */
export function wallsFor(width: number, height: number, radius: number): Walls {
  return { left: radius, top: radius, right: width - radius, bottom: height - radius };
}

export interface Launch {
  from: { x: number; y: number };
  to: { x: number; y: number };
  radius: number;
  random?: () => number;
}

/**
 * Flick a chip from one point at another.
 *
 * The speed is **solved for**, not guessed: under a constant deceleration `a`, a body
 * launched at `√(2ad)` stops in exactly `d`. So the throw is aimed — which is what
 * makes the animation mean "the Marshal gave it to *that player*" rather than "a chip
 * went past" — and the variation is then laid on top of a throw that was going to
 * arrive.
 *
 * The variation is the dice's own `jitter`, the same ±10° that stops two rolls from
 * one seat being the same throw twice, plus a little on the speed and a spin whose
 * direction is a coin toss. Aimed and perturbed, in that order: perturb first and the
 * chip lands somewhere that means nothing.
 */
export function launch({ from, to, radius, random = Math.random }: Launch): Chip {
  const pxPerM = pixelsPerMetre(radius);
  const k = CHIP.timeScale;
  // Accelerations go as `k²` and velocities as `k` — see `scaled()` in `effects.ts`.
  const decel = CHIP.friction * G * pxPerM * k * k;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  // Nowhere to go: give it a nudge rather than dividing by nothing.
  const heading = distance ? { x: dx / distance, y: dy / distance } : { x: 0, y: 1 };
  const aimed = jitter(heading, random);

  // ±8% on the speed. Wider was tried on paper and is a poor trade: the miss it buys
  // is along the line of the throw, which is the direction the eye reads as "aimed at",
  // where the angular jitter's miss is across it and reads as a flick.
  const speed = Math.sqrt(2 * decel * distance) * (1 + (random() - 0.5) * 0.16);
  const spin =
    (CHIP.spin.min + random() * (CHIP.spin.max - CHIP.spin.min)) * k * (random() < 0.5 ? -1 : 1);

  return {
    x: from.x,
    y: from.y,
    vx: aimed.x * speed,
    vy: aimed.y * speed,
    angle: random() * Math.PI * 2,
    spin,
    radius,
    decel,
    /**
     * Sliding and spinning stop together.
     *
     * Not a fudge to make it look right — it is what a disc sliding and spinning on a
     * flat surface actually does. The friction is shared between the two motions in a
     * fixed ratio, so neither can outlast the other, and a chip that stopped moving
     * while still turning would look like a bug because it is not a thing that happens.
     * Setting the two decelerations in the ratio of the two launch values is the
     * cheapest way to get that, and it survives a wall changing the spin because both
     * remain constant-magnitude.
     */
    spinDecel: speed > 0 ? (Math.abs(spin) * decel) / speed : Math.abs(spin),
    landed: false,
  };
}

/**
 * One fixed step of the integrator.
 *
 * Semi-implicit: friction is applied to the velocity, then the velocity moves the
 * body. Cheaper than anything cleverer and stable at the step sizes used here, where
 * the only stiff thing in the system is a wall and walls are handled by impulse rather
 * than by force.
 */
export function step(chip: Chip, dt: number, walls: Walls): void {
  const speed = Math.hypot(chip.vx, chip.vy);
  if (speed > 0) {
    // Clamped to the speed itself: friction brings a body to rest, it does not push it
    // backwards, and an unclamped step at low speed does exactly that.
    const drop = Math.min(speed, chip.decel * dt);
    chip.vx -= (chip.vx / speed) * drop;
    chip.vy -= (chip.vy / speed) * drop;
  }
  if (chip.spin !== 0) {
    const drop = Math.min(Math.abs(chip.spin), chip.spinDecel * dt);
    chip.spin -= Math.sign(chip.spin) * drop;
  }

  chip.x += chip.vx * dt;
  chip.y += chip.vy * dt;
  chip.angle += chip.spin * dt;

  if (!chip.landed) {
    chip.landed = inside(chip, walls);
    return;
  }
  hitWalls(chip, walls);
}

function inside(chip: Chip, walls: Walls): boolean {
  return (
    chip.x >= walls.left && chip.x <= walls.right && chip.y >= walls.top && chip.y <= walls.bottom
  );
}

function hitWalls(chip: Chip, walls: Walls): void {
  if (chip.x < walls.left) {
    chip.x = walls.left;
    collide(chip, 1, 0);
  } else if (chip.x > walls.right) {
    chip.x = walls.right;
    collide(chip, -1, 0);
  }
  if (chip.y < walls.top) {
    chip.y = walls.top;
    collide(chip, 0, 1);
  } else if (chip.y > walls.bottom) {
    chip.y = walls.bottom;
    collide(chip, 0, -1);
  }
}

/**
 * The impulse at a wall, for a uniform disc, with friction.
 *
 * `n` points away from the wall, into the room. Two impulses:
 *
 *   - **normal**, `jₙ = −(1+e)·v·n`, the ordinary bounce.
 *   - **tangential**, the interesting one. The velocity of the material at the point of
 *     contact is not the velocity of the centre: it is `v − ωR·t`, because the rim is
 *     moving under the spin. Friction acts on *that*, so a chip arriving head-on but
 *     turning has a sliding contact and comes away with sideways velocity it did not
 *     arrive with — and correspondingly less spin. That is a chip walking off a rail,
 *     and it is the thing that makes this read as simulated rather than scripted.
 *
 * Killing the contact's tangential motion outright needs `jₜ = −vₜ/(1 + R²/I)`, and a
 * uniform disc has `I = ½mR²`, so the denominator is 3. Coulomb caps that at `μ·|jₙ|`,
 * which is the usual case: the contact is still sliding when it leaves.
 *
 * Masses are normalised to 1 throughout — every impulse here is divided by the mass and
 * the mass is never anything else, so carrying it would be carrying a factor of one.
 */
function collide(chip: Chip, nx: number, ny: number): void {
  const vn = chip.vx * nx + chip.vy * ny;
  // Already leaving. Happens on the frame after a bounce, when the position has been
  // clamped to the wall but the body is on its way out.
  if (vn >= 0) return;

  const jn = -(1 + CHIP.wallRestitution) * vn;
  chip.vx += jn * nx;
  chip.vy += jn * ny;

  const tx = -ny;
  const ty = nx;
  const vt = chip.vx * tx + chip.vy * ty - chip.spin * chip.radius;
  const cap = CHIP.wallFriction * Math.abs(jn);
  let jt = -vt / 3;
  if (Math.abs(jt) > cap) jt = Math.sign(jt) * cap;

  chip.vx += jt * tx;
  chip.vy += jt * ty;
  // Δω = −jₜR/I, and I = ½R².
  chip.spin -= (2 * jt) / chip.radius;
}

/** Below a fiftieth of a metre a second, and it has finished. */
export function atRest(chip: Chip): boolean {
  const still = CHIP.stillSpeed * pixelsPerMetre(chip.radius) * CHIP.timeScale;
  return Math.hypot(chip.vx, chip.vy) < still;
}
