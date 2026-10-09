/**
 * The platform penalty, p165: *"A character attempting to fire or throw a ranged
 * weapon from the back of a horse or other mount, a moving vehicle, or other
 * 'unstable platform' subtracts 2"* — waived by Steady Hands.
 */
import { describe, expect, it } from 'vitest';
import { hasSteadyHands, platformPenalty } from '../src/rules/platform.js';
import { SITUATIONS, toggleCondition } from '../src/rules/modifiers.js';

const onHorse = { conditions: ['mounted'] };
const onWagon = { conditions: ['unstable'] };

describe('the platform penalty', () => {
  it('is the same −2 from a horse and from a wagon', () => {
    expect(platformPenalty(onHorse, true, [])).toEqual({ label: 'Mounted', value: -2 });
    expect(platformPenalty(onWagon, true, [])).toEqual({ label: 'Unstable Platform', value: -2 });
  });

  /** One number, written once: Horsemanship's −2 is Unstable Platform's restated. */
  it('comes off the condition table for both', () => {
    const value = (key: string): number | undefined => SITUATIONS.find((s) => s.key === key)?.value;
    expect(value('mounted')).toBe(value('unstable'));
  });

  it('touches nothing that is not a shot or a throw', () => {
    expect(platformPenalty(onHorse, false, [])).toBeUndefined();
    expect(platformPenalty(onWagon, false, [])).toBeUndefined();
  });

  it('is waived by Steady Hands, on either', () => {
    expect(hasSteadyHands([{ name: 'Steady Hands' }])).toBe(true);
    expect(platformPenalty(onHorse, true, [{ name: 'STEADY HANDS' }])).toBeUndefined();
    expect(platformPenalty(onWagon, true, [{ name: 'Steady Hands' }])).toBeUndefined();
  });

  it('is nothing on solid ground', () => {
    expect(platformPenalty({}, true, [])).toBeUndefined();
    expect(platformPenalty({ conditions: ['dark'] }, true, [])).toBeUndefined();
  });

  /** One group: being on both would charge the −2 twice. */
  it('is charged once, because the two conditions exclude each other', () => {
    const state = toggleCondition(toggleCondition({}, 'unstable'), 'mounted');
    expect(state.conditions).toEqual(['mounted']);
  });
});
