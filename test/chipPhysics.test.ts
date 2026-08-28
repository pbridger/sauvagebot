import { describe, expect, it } from 'vitest';
import { atRest, launch, step, wallsFor, type Chip } from '../src/obr/chipPhysics.js';

const RADIUS = 23;
const WALLS = wallsFor(1600, 900, RADIUS);
const DT = 1 / 240;

/** No jitter, no spin, no coin toss: the throw as aimed. */
function straight(): () => number {
  return () => 0.5;
}

/** Run until it stops, or give up — a sim that never terminates must fail, not hang. */
function settle(chip: Chip, walls = WALLS, limit = 20_000): number {
  let steps = 0;
  while (!atRest(chip) && steps < limit) {
    step(chip, DT, walls);
    steps++;
  }
  return steps;
}

function speed(chip: Chip): number {
  return Math.hypot(chip.vx, chip.vy);
}

describe('a chip flicked at somebody', () => {
  it('arrives where it was aimed', () => {
    const to = { x: 800, y: 780 };
    const chip = launch({ from: { x: 800, y: -80 }, to, radius: RADIUS, random: straight() });
    settle(chip);
    // Within a chip's width of the mark. The solved launch speed is exact; what is
    // left is the discretisation of a constant deceleration.
    expect(Math.hypot(chip.x - to.x, chip.y - to.y)).toBeLessThan(RADIUS * 2);
  });

  it('stops, rather than creeping on for ever', () => {
    const chip = launch({
      from: { x: -100, y: 450 },
      to: { x: 1200, y: 450 },
      radius: RADIUS,
      random: straight(),
    });
    const steps = settle(chip);
    expect(steps).toBeLessThan(20_000);
    // Somewhere between a blink and an age: about a second at this scale.
    expect(steps * DT).toBeGreaterThan(0.3);
    expect(steps * DT).toBeLessThan(3);
  });

  it('never speeds up on its own', () => {
    const chip = launch({
      from: { x: -100, y: 450 },
      to: { x: 1400, y: 700 },
      radius: RADIUS,
      random: straight(),
    });
    let last = speed(chip);
    for (let n = 0; n < 4000 && !atRest(chip); n++) {
      step(chip, DT, WALLS);
      const now = speed(chip);
      // A wall may only take energy out. Nothing in here may put any in.
      expect(now).toBeLessThanOrEqual(last + 1e-9);
      last = now;
    }
  });

  it('stops turning at about the moment it stops moving', () => {
    // A chip that came to rest still spinning would look like a bug, because it is
    // not a thing a chip does.
    const chip = launch({
      from: { x: -100, y: 450 },
      to: { x: 1200, y: 600 },
      radius: RADIUS,
      random: () => 0.3,
    });
    settle(chip);
    expect(Math.abs(chip.spin)).toBeLessThan(2);
  });
});

describe('the walls', () => {
  /** A chip already on the felt, so the walls apply to it. */
  function onTable(over: Partial<Chip> = {}): Chip {
    return {
      x: 800,
      y: 450,
      vx: 0,
      vy: 0,
      angle: 0,
      spin: 0,
      radius: RADIUS,
      decel: 1400,
      spinDecel: 20,
      landed: true,
      ...over,
    };
  }

  it('let a chip through until it has made it onto the table', () => {
    // Launched from beyond the border, so on the first frames it is outside every
    // wall at once. Clamping it there would stop the throw before it began.
    const chip = launch({
      from: { x: -400, y: 450 },
      to: { x: 800, y: 450 },
      radius: RADIUS,
      random: straight(),
    });
    expect(chip.landed).toBe(false);
    step(chip, DT, WALLS);
    expect(chip.x).toBeLessThan(WALLS.left);
    settle(chip);
    expect(chip.landed).toBe(true);
  });

  it('turn a chip back, with some of the pace taken off it', () => {
    const chip = onTable({ x: WALLS.left + 1, vx: -600 });
    step(chip, DT, WALLS);
    expect(chip.vx).toBeGreaterThan(0);
    expect(chip.vx).toBeLessThan(600);
  });

  /**
   * The one that proves the friction coupling is wired up rather than merely present.
   * A chip arriving square on a wall has no sideways motion; if it is *spinning*, the
   * rim is sliding along the wall, and it must come away moving sideways with less
   * spin than it had. Get the sign of the tangent or of `Δω` wrong and this passes
   * with the chip walking the wrong way, so both are asserted.
   */
  it('make a spinning chip walk sideways off a square hit', () => {
    const chip = onTable({ x: WALLS.left + 1, vx: -600, vy: 0, spin: 30 });
    step(chip, DT, WALLS);
    expect(chip.vy).toBeGreaterThan(0);
    expect(chip.spin).toBeLessThan(30);
    expect(chip.spin).toBeGreaterThan(0);

    const other = onTable({ x: WALLS.left + 1, vx: -600, vy: 0, spin: -30 });
    step(other, DT, WALLS);
    expect(other.vy).toBeLessThan(0);
  });

  it('leave a chip that is already on its way out alone', () => {
    // The frame after a bounce: the position has been clamped to the wall but the
    // body is leaving. Hitting it again would trap it there, buzzing.
    const chip = onTable({ x: WALLS.left, vx: 400 });
    step(chip, DT, WALLS);
    // Friction is the only thing that may have touched it — no bounce, no reversal.
    expect(chip.vx).toBeCloseTo(400 - chip.decel * DT, 6);
  });

  it('keep a chip on the table once it is on it', () => {
    for (const heading of [0, 1, 2, 3, 4, 5]) {
      const angle = (heading * Math.PI) / 3;
      const chip = onTable({ vx: Math.cos(angle) * 3000, vy: Math.sin(angle) * 3000, spin: 25 });
      settle(chip);
      expect(chip.x, `heading ${heading}`).toBeGreaterThanOrEqual(WALLS.left - 1);
      expect(chip.x, `heading ${heading}`).toBeLessThanOrEqual(WALLS.right + 1);
      expect(chip.y, `heading ${heading}`).toBeGreaterThanOrEqual(WALLS.top - 1);
      expect(chip.y, `heading ${heading}`).toBeLessThanOrEqual(WALLS.bottom + 1);
    }
  });
});

describe('the variation on a throw', () => {
  it('is a different throw every time', () => {
    const paths = new Set<string>();
    for (let n = 0; n < 20; n++) {
      const chip = launch({
        from: { x: 800, y: -80 },
        to: { x: 800, y: 780 },
        radius: RADIUS,
      });
      settle(chip);
      paths.add(`${Math.round(chip.x)},${Math.round(chip.y)},${Math.round(chip.angle * 10)}`);
    }
    expect(paths.size).toBeGreaterThan(15);
  });

  it('still puts the chip near the player it was aimed at', () => {
    const to = { x: 800, y: 780 };
    for (let n = 0; n < 200; n++) {
      const chip = launch({ from: { x: 800, y: -80 }, to, radius: RADIUS });
      settle(chip);
      // ±10° across an 860px throw is about 150px, and ±8% along it about 70px. A
      // quarter of the throw is the outside of that, and it still reads as "at them".
      expect(Math.hypot(chip.x - to.x, chip.y - to.y)).toBeLessThan(230);
    }
  });

  it('turns both ways', () => {
    const spins = new Set<number>();
    for (let n = 0; n < 40; n++) {
      spins.add(
        Math.sign(
          launch({ from: { x: 0, y: 0 }, to: { x: 800, y: 0 }, radius: RADIUS }).spin,
        ),
      );
    }
    expect(spins).toEqual(new Set([-1, 1]));
  });
});
