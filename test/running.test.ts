import { describe, expect, it } from 'vitest';
import { runningDie, runningExpression, DEFAULT_RUNNING_DIE } from '../src/rules/running.js';
import type { NamedEntry } from '../src/rules/sheet.js';

function sheet(parts: { edges?: NamedEntry[]; hindrances?: NamedEntry[]; powers?: NamedEntry[] }) {
  return { edges: [], hindrances: [], ...parts };
}

describe('the running die', () => {
  it('is a d6 for a character with nothing to say about it', () => {
    const die = runningDie(sheet({}));
    expect(die.die).toBe(DEFAULT_RUNNING_DIE);
    expect(die.mod).toBe(0);
    expect(die.why).toEqual([]);
  });

  /**
   * The Weird West wording, which is *not* the SWD one: `"Pace is increased by
   * +2 and their running die increases one step (from d6 to d8, for example)"`.
   * A d10 here would be the older edition's rule.
   */
  it('steps one up for Fleet-Footed, to d8 and not d10', () => {
    expect(runningDie(sheet({ edges: [{ name: 'Fleet-Footed' }] })).die).toBe(8);
  });

  it('steps one down for Slow, and below d4 becomes d4−1', () => {
    const slow = runningDie(sheet({ hindrances: [{ name: 'Slow (Minor)' }] }));
    expect(slow.die).toBe(4);
    expect(slow.mod).toBe(0);

    const slower = runningDie(
      sheet({ hindrances: [{ name: 'Slow (Major)' }, { name: 'Obese' }] }),
    );
    expect(runningExpression(slower)).toBe('d4-1');
  });

  /**
   * The bestiary states the die outright in a special ability, and that statement
   * has to win: stepping the stated d10 up again because the ability is called
   * Fleet Footed would give the antelope a d12.
   */
  it('takes a stated die over the Edge that names it', () => {
    const antelope = runningDie(
      sheet({
        powers: [
          { name: 'Fleet Footed', text: 'Antelopes have a Pace 10 and roll a d10 for running.' },
        ],
      }),
    );
    expect(antelope.die).toBe(10);
    expect(antelope.mod).toBe(0);
  });

  /**
   * "Slow" appears in the prose of plenty of Hindrances that have nothing to do
   * with movement, so only the name is matched for the stepping rules.
   */
  it('does not slow a character whose rules text merely says the word', () => {
    expect(
      runningDie(sheet({ hindrances: [{ name: 'Cautious', text: 'They are slow to act.' }] })).die,
    ).toBe(DEFAULT_RUNNING_DIE);
  });

  it('never writes a bare +0 into the expression', () => {
    expect(runningExpression({ die: 6, mod: 0, why: [] })).toBe('d6');
  });
});

/**
 * Sir Ed has this one, which is why it is here rather than in a general list of
 * Hindrances: `"Their Pace is reduced by 1 and they subtract 1 from running
 * rolls"`. A penalty to the roll is not a smaller die — a d4 is not a d6−1 —
 * so it has to come out as a modifier and leave the die where it was.
 */
describe('a penalty to the running roll rather than to the die', () => {
  it('keeps the die and takes the total down', () => {
    const ed = runningDie({
      edges: [],
      hindrances: [
        {
          name: 'Elderly (Major)',
          text:
            'Their Pace is reduced by 1 and they subtract 1 from running rolls (minimum 1). ' +
            'They also take a −1 penalty to Agility, Strength, and Vigor rolls.',
        },
      ],
    });
    expect(ed.die).toBe(DEFAULT_RUNNING_DIE);
    expect(runningExpression(ed)).toBe('d6-1');
    expect(ed.why).toEqual(['Elderly (Major)']);
  });
});

/**
 * `powers` is read for a creature's stated running die — but on a Huckster or a
 * Blessed it holds their arcane powers instead, and one of those is called
 * **slow**. Matching Hindrance names across it would step every spellcaster in
 * the party down to a d4 for having the spell on their card.
 */
describe('a spellcaster who knows the slow power', () => {
  it('still runs on a d6', () => {
    expect(
      runningDie({
        edges: [],
        hindrances: [],
        powers: [{ name: 'slow', text: 'Halves the target’s Pace and running die.' }],
      }).die,
    ).toBe(DEFAULT_RUNNING_DIE);
  });
});
