import { describe, expect, it } from 'vitest';
import { CHIP, STILL_SPIN, atRest, launch, step, wallsFor, type Chip } from '../src/obr/chipPhysics.js';

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
  /**
   * The launch solver, on its own, with the walls moved out of the way.
   *
   * `v₀ = √(2·a·d)` stops a body in exactly `d`, so a chip thrown with no jitter runs
   * `overthrow` times the distance it was aimed. Checking the distance rather than
   * the resting point is what keeps this a test of the solver: the chip is
   * deliberately thrown *past* the receiver now, and asserting it stopped on them
   * would be asserting the old behaviour back.
   */
  it('runs the distance it was thrown, times the overthrow', () => {
    const from = { x: 800, y: -80 };
    const to = { x: 800, y: 780 };
    const open = wallsFor(100_000, 100_000, RADIUS);
    const chip = launch({ from, to, radius: RADIUS, random: straight() });
    // `landed` never trips out here, which is the point: nothing to hit.
    while (!atRest(chip)) step(chip, DT, open);
    const wanted = Math.hypot(to.x - from.x, to.y - from.y) * CHIP.overthrow;
    expect(Math.hypot(chip.x - from.x, chip.y - from.y)).toBeCloseTo(wanted, -1);
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

  /**
   * The regression for a bug a single tidy case could not see.
   *
   * `spinDecel` is paced against the launch speed, which held until a wall changed the
   * spin — and now that the chip is thrown *at* the rail, a wall changes the spin on
   * nearly every throw. A sweep found chips resting at up to 57 rad/s, nine turns a
   * second, frozen mid-rotation. One unjittered throw down an empty table passed
   * throughout, which is why this one throws hundreds and bounces them.
   */
  it('never comes to rest still spinning, however it bounced', () => {
    for (let n = 0; n < 300; n++) {
      const chip = launch({ from: { x: 800, y: -120 }, to: { x: 800, y: 1020 }, radius: RADIUS });
      settle(chip);
      expect(Math.abs(chip.spin)).toBeLessThan(STILL_SPIN);
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

  /**
   * The chip is thrown *at* the player, which means past them at the rail behind
   * them, so it is no longer aimed to stop on a spot. What has to survive the
   * variation is the meaning: it finishes at the end of the table it was sent to.
   */
  /**
   * Asserted over the distribution, not one throw, because the throw is stochastic
   * and a single sample says nothing about the tail — which is where this went wrong
   * once already. A livelier rail (0.75 restitution) averaged well but rebounded the
   * unluckiest chips a third of the way back up the table, and only 58% finished in
   * the receiver's half. The average alone hid it.
   */
  it('finishes at the end of the table it was thrown to, throw after throw', () => {
    const middle = 900 / 2;
    const rested: number[] = [];
    for (let n = 0; n < 600; n++) {
      const chip = launch({ from: { x: 800, y: -120 }, to: { x: 800, y: 1020 }, radius: RADIUS });
      settle(chip);
      rested.push(chip.y);
    }
    const far = rested.filter((y) => y > middle).length / rested.length;
    expect(far).toBeGreaterThan(0.9);
    // And even the worst of them is past the near quarter, not back where it started.
    expect(Math.min(...rested)).toBeGreaterThan(900 * 0.3);
  });

  /**
   * The whole point of the overthrow, and the thing that was reported missing: a
   * chip aimed to stop politely where it was going never reaches anything to hit.
   * Measured, because "it hits nothing" was true of the first cut at a rate of
   * 85% and looked from the code like it should have been rare.
   */
  it('reaches the rail in front of the player nearly every time', () => {
    let struck = 0;
    const runs = 400;
    for (let n = 0; n < runs; n++) {
      const chip = launch({ from: { x: 800, y: -120 }, to: { x: 800, y: 1020 }, radius: RADIUS });
      let hit = false;
      for (let s = 0; s < 20_000 && !atRest(chip); s++) {
        step(chip, DT, WALLS);
        if (
          chip.landed &&
          (chip.x === WALLS.left ||
            chip.x === WALLS.right ||
            chip.y === WALLS.top ||
            chip.y === WALLS.bottom)
        ) {
          hit = true;
        }
      }
      if (hit) struck++;
    }
    expect(struck / runs).toBeGreaterThan(0.9);
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
