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
import { PHYSICS, TRAY_THEME, colourset } from '../extension/src/effects.js';

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
  it('falls at 9.81 m/s²', () => {
    expect(PHYSICS.gravity / U).toBeCloseTo(9.81, 1);
    // The library multiplies by 9.8, so the multiplier has to undo that.
    expect((TRAY_THEME.gravity_multiplier * 9.8) / U).toBeCloseTo(9.81, 1);
  });

  it('throws at something a hand could do', () => {
    const metresPerSecond = PHYSICS.throwSpeed / U;
    expect(metresPerSecond).toBeGreaterThan(0.5);
    expect(metresPerSecond).toBeLessThan(4);
  });

  it('steps finely enough that a die cannot cross its own width', () => {
    // No continuous collision detection: a die that moves further than its own body in
    // one step can pass through the table.
    const dieWidth = 104;
    expect(PHYSICS.throwSpeed * TRAY_THEME.framerate).toBeLessThan(dieWidth);
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
    expect(PHYSICS.stiffness).toBeGreaterThan(100 * PHYSICS.mass * PHYSICS.gravity);
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
