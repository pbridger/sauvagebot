/**
 * Horsemanship, p165: *"must use the lowest of their Fighting or Riding skills…
 * Athletics (throwing) and Shooting rolls are made at −2 unless the rider has the
 * Steady Hands Edge."*
 */
import { describe, expect, it } from 'vitest';
import {
  MOUNTED_RANGED,
  hasSteadyHands,
  horsemanship,
  horsemanshipNote,
  isMounted,
  mountedRangedPenalty,
  rollingSheet,
} from '../src/rules/mounted.js';
import { emptySheet, traitDie, type Sheet } from '../src/rules/sheet.js';
import { situationalMods, toggleCondition } from '../src/rules/modifiers.js';

function rider(skills: Sheet['skills'], edges: string[] = []): Sheet {
  return { ...emptySheet('r', 'Rider'), skills, edges: edges.map((name) => ({ name })) };
}

const onHorse = { conditions: ['mounted'] };

describe('the Fighting die on horseback', () => {
  it('is the Riding die when Riding is worse', () => {
    const sheet = rider({ Fighting: { die: 8 }, Riding: { die: 4 } });
    expect(horsemanship(sheet, 'Fighting', onHorse)).toMatchObject({ die: 4, mod: 0, from: 'Riding' });
  });

  it('stays the Fighting die when Riding is as good or better', () => {
    const sheet = rider({ Fighting: { die: 6 }, Riding: { die: 8 } });
    expect(horsemanship(sheet, 'Fighting', onHorse)).toMatchObject({ die: 6, from: 'Fighting' });
  });

  /** The case a die-size comparison gets wrong: same die, worse modifier. */
  it('counts an untrained Riding d4−2 as lower than a d4 Fighting', () => {
    const sheet = rider({ Fighting: { die: 4 } });
    expect(horsemanship(sheet, 'Fighting', onHorse)).toMatchObject({ die: 4, mod: -2, from: 'Riding' });
  });

  it('leaves an untrained Fighting alone against a trained Riding', () => {
    const sheet = rider({ Riding: { die: 8 } });
    expect(horsemanship(sheet, 'Fighting', onHorse)).toMatchObject({ die: 4, mod: -2, from: 'Fighting' });
  });

  it('does nothing on foot, or to any other skill', () => {
    const sheet = rider({ Fighting: { die: 8 }, Riding: { die: 4 }, Shooting: { die: 8 } });
    expect(horsemanship(sheet, 'Fighting', {}).from).toBeUndefined();
    expect(horsemanship(sheet, 'Shooting', onHorse)).toMatchObject({ die: 8, from: undefined });
  });
});

describe('the sheet a roll is made from', () => {
  it('swaps Fighting for rolling, keeping the name', () => {
    const sheet = rider({ Fighting: { die: 10 }, Riding: { die: 6 } });
    expect(traitDie(rollingSheet(sheet, onHorse), 'Fighting')).toEqual({ die: 6, mod: 0 });
  });

  /**
   * The swapped sheet must never be mistaken for the character. The original is
   * not touched, and when nothing changes the very same object comes back, so the
   * common case has nothing to leak.
   */
  it('never changes the sheet it was given', () => {
    const sheet = rider({ Fighting: { die: 10 }, Riding: { die: 6 } });
    rollingSheet(sheet, onHorse);
    expect(sheet.skills.Fighting).toEqual({ die: 10 });
    expect(rollingSheet(sheet, {})).toBe(sheet);
  });

  it('says why in words', () => {
    const sheet = rider({ Fighting: { die: 8 } });
    expect(horsemanshipNote(sheet, onHorse)).toBe(
      'Mounted: the lower of Fighting d8 and Riding d4-2 — rolling Riding (p165)',
    );
    expect(horsemanshipNote(sheet, {})).toBeUndefined();
  });
});

describe('shooting and throwing from the saddle', () => {
  it('costs two', () => {
    expect(mountedRangedPenalty(onHorse, true, [])).toBe(MOUNTED_RANGED);
  });

  it('costs nothing that is not a shot or a throw', () => {
    expect(mountedRangedPenalty(onHorse, false, [])).toBe(0);
  });

  it('costs nothing with Steady Hands', () => {
    expect(hasSteadyHands([{ name: 'Steady Hands' }])).toBe(true);
    expect(mountedRangedPenalty(onHorse, true, [{ name: 'STEADY HANDS' }])).toBe(0);
  });

  it('costs nothing on foot', () => {
    expect(mountedRangedPenalty({}, true, [])).toBe(0);
  });
});

describe('the condition itself', () => {
  /** A horse is an unstable platform; holding both would charge the −2 twice. */
  it('replaces Unstable Platform rather than stacking with it', () => {
    const state = toggleCondition(toggleCondition({}, 'unstable'), 'mounted');
    expect(state.conditions).toEqual(['mounted']);
    expect(isMounted(state)).toBe(true);
  });

  /** Neither effect is a flat number on every roll — Notice is not penalised. */
  it('puts nothing on the general track', () => {
    expect(situationalMods(onHorse)).toEqual([]);
  });
});
