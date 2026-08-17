/**
 * How dice leave the hand — tested against a stand-in for the renderer.
 *
 * These are exactly the claims that kept being wrong on the tuning page while looking
 * right in the source: that the throw speed reaches the dice, that a seat means one
 * place, and that dice do not start inside each other. None of them needs WebGL to
 * check, which is the point — every round of "the control does nothing" cost a rebuild,
 * a reload and somebody's patience.
 */
import { describe, it, expect } from 'vitest';
import { PHYSICS, scaled } from '../extension/src/effects.js';
import { aimThrow, seedRandom, type ThrowVector } from '../extension/src/throwing.js';
import type { Seat } from '../src/obr/diceThrow.js';

const HALF_WIDTH = 700;
const HALF_HEIGHT = 450;

/**
 * A stand-in for the renderer, faithful in the one way that matters: it hands back one
 * vector per die, which the throw code then fills in.
 */
function stub(dice = 1): Record<string, unknown> {
  return {
    display: { containerWidth: HALF_WIDTH, containerHeight: HALF_HEIGHT },
    rolling: false,
    clearDice: () => {},
    getNotationVectors: (): { vectors: ThrowVector[] } => ({
      vectors: Array.from({ length: dice }, () => ({
        pos: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        angle: { x: 0, y: 0, z: 0 },
      })),
    }),
  };
}

function throwDice(seat: Seat, dice = 1): ThrowVector[] {
  const box = stub(dice);
  const restore = aimThrow(box as never, seat);
  const thrown = (
    box as unknown as { startClickThrow: (n: string) => { vectors: ThrowVector[] } }
  ).startClickThrow('1d6@6');
  restore();
  return thrown.vectors;
}

describe('throw speed reaches the dice', () => {
  it('scales the launch velocity with the setting', () => {
    const asked = PHYSICS.throwSpeed;
    try {
      const speeds = [0.01, 0.3, 2, 10].map((metres) => {
        PHYSICS.throwSpeed = metres * 6495;
        const [die] = throwDice('n');
        return Math.hypot(die!.velocity.x, die!.velocity.y);
      });
      // Monotonic, and roughly proportional — the only slack is the ±15% per throw.
      expect(speeds[0]).toBeLessThan(speeds[1]!);
      expect(speeds[1]).toBeLessThan(speeds[2]!);
      expect(speeds[2]).toBeLessThan(speeds[3]!);
      expect(speeds[3]! / speeds[0]!).toBeGreaterThan(500);
    } finally {
      PHYSICS.throwSpeed = asked;
    }
  });

  it('throws at the scaled speed, not the raw one', () => {
    const [die] = throwDice('n');
    const speed = Math.hypot(die!.velocity.x, die!.velocity.y);
    expect(speed).toBeGreaterThan(scaled().throwSpeed * 0.8);
    expect(speed).toBeLessThan(scaled().throwSpeed * 1.2);
  });

  it('aims into the tray from every seat', () => {
    for (const seat of ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'] as Seat[]) {
      const [die] = throwDice(seat);
      // Travelling away from the edge it was released at, give or take the aim jitter.
      const towardsMiddle = -(die!.pos.x * die!.velocity.x + die!.pos.y * die!.velocity.y);
      expect(towardsMiddle).toBeGreaterThan(0);
    }
  });
});

describe('a seat is one place', () => {
  it('releases from the same point every throw', () => {
    // The renderer derived the spawn from the sign of a randomised vector, so "top"
    // wandered between throws. The aim is jittered now; the release point is not.
    const first = throwDice('n')[0]!.pos;
    for (let n = 0; n < 20; n++) {
      const again = throwDice('n')[0]!.pos;
      expect(again.x).toBeCloseTo(first.x, 6);
      expect(again.y).toBeCloseTo(first.y, 6);
    }
  });

  it('puts each seat on its own edge', () => {
    const at = (seat: Seat): { x: number; y: number } => throwDice(seat)[0]!.pos;
    expect(at('n').y).toBeGreaterThan(0);
    expect(at('s').y).toBeLessThan(0);
    expect(at('w').x).toBeLessThan(0);
    expect(at('e').x).toBeGreaterThan(0);
    expect(at('ne').x).toBeGreaterThan(0);
    expect(at('ne').y).toBeGreaterThan(0);
    expect(at('sw').x).toBeLessThan(0);
    expect(at('sw').y).toBeLessThan(0);
  });

  it('keeps every die inside the walls', () => {
    // The tray's walls are at 0.93 of the half-extent. A die spawned outside them is a
    // die nobody ever sees.
    for (const seat of ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'] as Seat[]) {
      for (const die of throwDice(seat, 12)) {
        expect(Math.abs(die.pos.x)).toBeLessThan(HALF_WIDTH * 0.93);
        expect(Math.abs(die.pos.y)).toBeLessThan(HALF_HEIGHT * 0.93);
      }
    }
  });
});

describe('dice do not start inside each other', () => {
  it('separates every pair of a six-dice throw', () => {
    // The bug this guards: every die at one point, interpenetrating, and the solver
    // separating them with enormous force — dice shot into the tray no matter how
    // gently they were thrown, because their speed had nothing to do with the throw.
    const dice = throwDice('n', 6);
    for (let a = 0; a < dice.length; a++) {
      for (let b = a + 1; b < dice.length; b++) {
        const one = dice[a]!.pos;
        const other = dice[b]!.pos;
        const gap = Math.hypot(one.x - other.x, one.y - other.y, one.z - other.z);
        expect(gap).toBeGreaterThan(100);
      }
    }
  });

  it('stacks rows upwards rather than spreading forever', () => {
    const dice = throwDice('n', 12);
    const heights = new Set(dice.map((die) => die.pos.z));
    expect(heights.size).toBe(4);
    // Still a hand's height above the felt, not a column reaching out of frame.
    expect(Math.max(...heights)).toBeLessThan(1000);
  });
});

describe('seeded throws', () => {
  it('gives an identical throw for an identical seed', () => {
    const shot = (): ThrowVector => {
      const restore = seedRandom(4242);
      const [die] = throwDice('w', 3);
      restore();
      return die!;
    };
    expect(shot().velocity).toEqual(shot().velocity);
    expect(shot().angle).toEqual(shot().angle);
  });
});
