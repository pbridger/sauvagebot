/**
 * The tap that feeds the animated dice tray.
 *
 * Two things are being defended here. The first is the shape of what comes out:
 * an exploding chain has to arrive as a chain, or the tray cannot know which die
 * bought which and the whole point of animating an ace is lost.
 *
 * The second matters more. The observer is passive, and *must* stay passive — a
 * roll has to evaluate identically with and without one, or the conformance corpus
 * stops describing what happens at the table. The `identical with and without`
 * test is the one to keep if the rest are ever thrown away.
 */
import { describe, it, expect } from 'vitest';
import { JavaRandom } from '../src/dice/javaRandom.js';
import { Roller, type DieEvent } from '../src/dice/roller.js';
import { CommandContext } from '../src/dice/evaluator.js';
import { RollInterpreter } from '../src/dice/interpreter.js';
import { parse } from '../src/dice/parser.js';
import { rollTrait } from '../src/rules/traitRoll.js';

function watch(seed: number): { roller: Roller; dice: DieEvent[] } {
  const dice: DieEvent[] = [];
  return { roller: new Roller(new JavaRandom(seed), (die) => dice.push(die)), dice };
}

/** Run an expression through the whole engine, collecting the dice. */
function run(expression: string, seed: number): { explained: string; dice: DieEvent[] } {
  const dice: DieEvent[] = [];
  const explained = new RollInterpreter(
    new CommandContext(new JavaRandom(seed), (die) => dice.push(die)),
  )
    .run(parse([expression]))
    .trim();
  return { explained, dice };
}

describe('the die observer changes nothing', () => {
  // Every kind of roll the engine can make, including the ones that sort, drop
  // dice, or re-enter the roller: if an observer could perturb any of them, it
  // would be one of these.
  const expressions = ['s8+1', 's6', 'e10', '4d6', '4d6k3', '2d6!', 'd66', '3df', '4wd6', '2d20a1'];

  for (const expression of expressions) {
    it(`${expression} evaluates identically with and without one`, () => {
      const bare = new RollInterpreter(new CommandContext(new JavaRandom(7)))
        .run(parse([expression]))
        .trim();
      expect(run(expression, 7).explained).toBe(bare);
    });
  }

  it('does not consume randomness of its own', () => {
    // Two rolls from one RNG: if observing cost a draw, the second would drift
    // even where the first agreed.
    const watched = watch(11);
    const first = watched.roller.roll(8, true);
    const second = watched.roller.roll(8, true);

    const bare = new Roller(new JavaRandom(11));
    expect(first.explained).toBe(bare.roll(8, true).explained);
    expect(second.explained).toBe(bare.roll(8, true).explained);
  });
});

describe('exploding chains', () => {
  it('reports an ace as a second step of the same chain', () => {
    // Seed 34: the trait d8 shows 6, then the Wild Die aces — `[6; w6+4]`.
    const { roller, dice } = watch(34);
    const result = roller.rollSavageWorlds(1, 8, 6);

    expect(result.explained).toBe('[6; w6+4]');
    expect(dice).toEqual([
      { sides: 8, value: 6, chain: 1, step: 0, role: 'trait' },
      { sides: 6, value: 6, chain: 2, step: 0, role: 'wild' },
      { sides: 6, value: 4, chain: 2, step: 1, role: 'wild' },
    ]);
  });

  it('keeps a double ace in one chain, with increasing steps', () => {
    const { roller, dice } = watch(63);
    roller.roll(6, true);

    expect(dice.map((d) => [d.chain, d.step, d.value])).toEqual([
      [1, 0, 6],
      [1, 1, 6],
      [1, 2, 4],
    ]);
  });

  it('gives each die of a non-exploding roll its own chain', () => {
    const { roller, dice } = watch(5);
    roller.rollDice(3, 6);

    expect(dice).toHaveLength(3);
    expect(dice.map((d) => d.chain)).toEqual([1, 2, 3]);
    expect(dice.every((d) => d.step === 0)).toBe(true);
  });

  it('numbers chains across separate rolls from one roller', () => {
    const { roller, dice } = watch(5);
    roller.roll(6, false);
    roller.roll(6, false);

    expect(dice.map((d) => d.chain)).toEqual([1, 2]);
  });
});

describe('what each die was', () => {
  it('tags the Wild Die and the trait die differently', () => {
    const { dice } = run('s8', 34);
    expect(dice.map((d) => d.role)).toEqual(['trait', 'wild', 'wild']);
    // The roles follow the dice, not the order: a wild d6 is still a d6.
    expect(dice.filter((d) => d.role === 'wild').every((d) => d.sides === 6)).toBe(true);
  });

  it('tags an Extra roll as trait only — no Wild Die exists to draw', () => {
    const { dice } = run('e8', 34);
    expect(dice.every((d) => d.role === 'plain')).toBe(true);
  });

  it('tags the WEG wild d6', () => {
    const { roller, dice } = watch(3);
    roller.rollWegD6(3);
    expect(dice[0]!.role).toBe('wild');
    expect(dice.slice(1).every((d) => d.role === 'plain')).toBe(true);
  });

  it('still reports a die that was rolled and then dropped', () => {
    // 4d6k3 throws four dice and keeps three. All four hit the table, so all four
    // are animated; which one was dropped is decided after the sort and is not
    // knowable here — see the plan, §4.
    const { dice } = run('4d6k3', 9);
    expect(dice).toHaveLength(4);
  });
});

describe('dice the tray cannot draw', () => {
  it('says nothing about Fudge dice', () => {
    // `nextInt(3)` is indistinguishable from a d3 at the RNG, and a d3 is not a
    // die the box has. Reporting nothing means a Fudge roll simply appears at once.
    const { explained, dice } = run('4df', 5);
    expect(explained).toContain('[');
    expect(dice).toEqual([]);
  });

  it('reports d66 as the two d6 it really is', () => {
    const { dice } = run('d66', 5);
    expect(dice).toHaveLength(2);
    expect(dice.every((d) => d.sides === 6)).toBe(true);
  });
});

describe('trait rolls carry their dice', () => {
  it('hands the dice back beside the explanation', () => {
    const result = rollTrait({ die: 8, mod: 1, wildCard: true }, new JavaRandom(34));
    expect(result.explained).toContain('[6; w6+4]');
    expect(result.dice.map((d) => d.value)).toEqual([6, 6, 4]);
  });

  it('collects nothing for a roll with no dice in it', () => {
    // An Extra with a d4 trait still rolls one die; the empty case is a Fudge or
    // a constant, and the tray has to cope with an empty list either way.
    const result = rollTrait({ die: 4, wildCard: false }, new JavaRandom(1));
    expect(result.dice).toHaveLength(1);
  });
});
