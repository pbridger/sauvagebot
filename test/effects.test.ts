/**
 * The dice tray's physics constants — and, more importantly, that the module loads.
 *
 * This exists because of a bug that cost a working feature and looked like a physics
 * problem: `TRAY_THEME` spread the result of a function that read `PHYSICS`, and
 * `PHYSICS` was declared *below* it. That is a temporal-dead-zone ReferenceError at
 * module evaluation — which typecheck does not catch, a bundler does not catch, and
 * which kills the entire page rather than one feature. The dice simply never appeared,
 * while the log carried on working because it lives on a different page.
 *
 * Importing the module here is the whole test. Everything else is a bonus: the file has
 * no DOM in it and its renderer import is type-only, so node can load it, which makes
 * "does this module evaluate?" a thing CI can answer.
 */
import { describe, it, expect } from 'vitest';
import { PHYSICS, TRAY_THEME, colourset, scaled, timestep } from '../extension/src/effects.js';

/** Units per metre, fixed by measuring the die the library draws. */
const U = 6495;

describe('the tray module loads at all', () => {
  it('exposes its configuration', () => {
    expect(PHYSICS).toBeDefined();
    expect(TRAY_THEME).toBeDefined();
  });

  it('resolves the physics into the box configuration', () => {
    // The failure this guards against left these undefined or threw on import.
    expect(TRAY_THEME.gravity_multiplier).toBeGreaterThan(0);
    expect(TRAY_THEME.framerate).toBeGreaterThan(0);
    expect(TRAY_THEME.iterationLimit).toBeGreaterThan(0);
  });
});

describe('physics in real units', () => {
  it('falls at 9.81 m/s², before the playback speed is applied', () => {
    expect(PHYSICS.gravity / U).toBeCloseTo(9.81, 1);
  });

  it('scales time consistently rather than fudging one number', () => {
    // The whole point: p(kt) means velocity scales by k, acceleration by k², spin by k.
    // Weakening gravity alone instead would change the shape of the trajectory — dice
    // sailing further before landing, which is what "skating" looked like.
    const k = PHYSICS.timeScale;
    const now = scaled();
    expect(now.gravity).toBeCloseTo(PHYSICS.gravity * k * k, 5);
    expect(now.throwSpeed).toBeCloseTo(PHYSICS.throwSpeed * k, 5);
    expect(now.spin.max).toBeCloseTo(PHYSICS.spin.max * k, 5);
    expect(now.stillSpeed).toBeCloseTo(PHYSICS.stillSpeed * k, 5);
    // The one deliberate exception: the dwell before believing a die has stopped is
    // watched by a person in wall-clock time, so it is not stretched. Scaling it would
    // put back the 1.7-second pause between a die stopping and its flare.
    expect(now.stillFor).toBe(PHYSICS.stillFor);
    // And the box is built with the scaled figure, not the real one.
    expect((TRAY_THEME.gravity_multiplier * 9.8) / now.gravity).toBeCloseTo(1, 2);
  });

  it('plays back slower than real time, because the tray is magnified', () => {
    expect(PHYSICS.timeScale).toBeGreaterThan(0.1);
    expect(PHYSICS.timeScale).toBeLessThanOrEqual(1);
    // A die should take long enough to cross the 21.6cm tray to be watchable.
    const seconds = 0.216 / (scaled().throwSpeed / U);
    expect(seconds).toBeGreaterThan(0.18);
  });

  it('throws at something a hand could do', () => {
    const metresPerSecond = PHYSICS.throwSpeed / U;
    expect(metresPerSecond).toBeGreaterThan(0.5);
    expect(metresPerSecond).toBeLessThan(4);
  });

  it('steps finely enough that a die cannot cross its own width', () => {
    // No continuous collision detection: a die that moves further than its own body in
    // one step can pass through the table. The step is derived from the throw speed, so
    // this has to hold at any time scale, not just the one shipped.
    const dieWidth = 104;
    const shipped = PHYSICS.timeScale;
    try {
      // `timestep()` rather than `TRAY_THEME.framerate`: the theme is built once at
      // module load, while the step is recomputed per throw — which is what makes the
      // time-scale slider safe to move at runtime.
      for (const k of [0.15, 0.3, 0.5, 1]) {
        PHYSICS.timeScale = k;
        expect(scaled().throwSpeed * timestep()).toBeLessThan(dieWidth);
      }
    } finally {
      // In a `finally`, because a failure here used to leak the changed time scale into
      // every test after it — which then failed for a reason that had nothing to do
      // with them.
      PHYSICS.timeScale = shipped;
    }
  });

  it('weighs about as much as a die, and grips like acrylic on baize', () => {
    expect(PHYSICS.mass).toBeGreaterThan(0);
    expect(PHYSICS.mass).toBeLessThan(50);
    expect(PHYSICS.friction).toBeGreaterThan(0.1);
    expect(PHYSICS.friction).toBeLessThan(0.8);
  });

  it('holds a die up without letting it sink', () => {
    // The clunk: contact stiffness is absolute, so it has to be well above the weight
    // it carries or dice press into the felt and get shoved back out.
    expect(PHYSICS.stiffness).toBeGreaterThan(100 * PHYSICS.mass * scaled().gravity);
  });

  it('calls a die still at a couple of centimetres a second', () => {
    expect(PHYSICS.stillSpeed / U).toBeCloseTo(0.02, 2);
    expect(PHYSICS.stillFor).toBeLessThanOrEqual(0.5);
  });

  it('spins hard enough to tumble in a short flight', () => {
    expect(PHYSICS.spin.min).toBeGreaterThan(5);
    expect(PHYSICS.spin.max).toBeGreaterThan(PHYSICS.spin.min);
  });
});

describe('dice colours', () => {
  it('reads numerals dark on a light die and light on a dark one', () => {
    expect(colourset('#e8e0cf').foreground).toBe('#1a1a1a');
    expect(colourset('#2f3542').foreground).toBe('#f6f2e8');
  });

  it('falls back to bone for anything it does not recognise', () => {
    expect(colourset(undefined).background).toBe('#e8e0cf');
    expect(colourset('rebeccapurple').background).toBe('#e8e0cf');
  });
});
