/**
 * The wire format and the staging for the dice tray.
 *
 * The guard is the part that matters: these values are handed to a physics library
 * as notation, so a malformed one from another client is a hang or a thrown
 * exception inside a render loop rather than a bad-looking line in a log.
 */
import { describe, it, expect } from 'vitest';
import { JavaRandom } from '../src/dice/javaRandom.js';
import { Roller, type DieEvent } from '../src/dice/roller.js';
import {
  MAX_DICE,
  isDiceThrow,
  isSeat,
  notation,
  waves,
  type DiceThrow,
} from '../src/obr/diceThrow.js';
import { assignSeats, seatVector, jitter, GM_SEAT, type Seated } from '../src/obr/seats.js';

function die(partial: Partial<DieEvent>): DieEvent {
  return { sides: 6, value: 3, chain: 1, step: 0, role: 'plain', ...partial };
}

function thrown(partial: Partial<DiceThrow> = {}): DiceThrow {
  return { id: 'roll-1', dice: [die({})], seat: 'n', ...partial };
}

describe('waves', () => {
  it('puts everything thrown at once in the first wave', () => {
    const dice = [die({ chain: 1 }), die({ chain: 2 }), die({ chain: 3 })];
    expect(waves(dice)).toEqual([dice]);
  });

  it('separates an ace from the die that bought it', () => {
    const first = die({ sides: 8, value: 8, chain: 1, step: 0 });
    const ace = die({ sides: 8, value: 2, chain: 1, step: 1 });
    expect(waves([first, ace])).toEqual([[first], [ace]]);
  });

  it('keeps two chains that both aced in step with each other', () => {
    // Two d6 both ace: both extra dice arrive together on the second beat, rather
    // than one chain finishing before the other starts.
    const dice = [
      die({ chain: 1, value: 6, step: 0 }),
      die({ chain: 2, value: 6, step: 0 }),
      die({ chain: 1, value: 1, step: 1 }),
      die({ chain: 2, value: 4, step: 1 }),
    ];
    const staged = waves(dice);
    expect(staged).toHaveLength(2);
    expect(staged[0]!.map((d) => d.chain)).toEqual([1, 2]);
    expect(staged[1]!.map((d) => d.chain)).toEqual([1, 2]);
  });

  it('is empty for no dice, which is a Fudge roll', () => {
    expect(waves([])).toEqual([]);
  });

  it('stages a real acing trait roll', () => {
    // Seed 34, the same roll the observer tests pin: d8 shows 6, the Wild Die aces.
    const dice: DieEvent[] = [];
    new Roller(new JavaRandom(34), (d) => dice.push(d)).rollSavageWorlds(1, 8, 6);

    // The trait die and the Wild Die go out together — one wave, one throw — and the
    // ace the Wild Die earned follows on the next beat.
    const staged = waves(dice);
    expect(staged.map((wave) => notation(wave))).toEqual(['1d8+1d6@6,6', '1d6@4']);
  });
});

describe('notation', () => {
  it('merges a run of one size into a single set', () => {
    expect(notation([die({ value: 1 }), die({ value: 2 }), die({ value: 3 })])).toBe('3d6@1,2,3');
  });

  it('puts one value list at the end, not one per set', () => {
    // `1d8@7+1d6@3` was the first attempt and it throws a single die: the parser
    // splits on the first `@` and everything after it is scanned for numbers, so the
    // d6 stopped being a die. The symptom was "only one die rolls, and it is not the
    // Wild Die".
    expect(notation([die({ sides: 8, value: 7 }), die({ sides: 6, value: 3 })])).toBe(
      '1d8+1d6@7,3',
    );
  });

  it('groups sizes even when they are not adjacent, and orders values to match', () => {
    // The parser merges sets of equal size, then creates dice set by set — so a
    // value list in the dice's original order would be handed to the wrong dice.
    expect(
      notation([
        die({ sides: 6, value: 1 }),
        die({ sides: 8, value: 2 }),
        die({ sides: 6, value: 3 }),
      ]),
    ).toBe('2d6+1d8@1,3,2');
  });

  it('keeps the first size seen first', () => {
    expect(notation([die({ sides: 4, value: 4 }), die({ sides: 20, value: 11 })])).toBe(
      '1d4+1d20@4,11',
    );
  });
});

describe('the guard', () => {
  it('accepts a well-formed throw', () => {
    expect(isDiceThrow(thrown())).toBe(true);
    expect(isDiceThrow(thrown({ colour: '#aa3333' }))).toBe(true);
  });

  it('rejects anything that is not a throw at all', () => {
    for (const value of [undefined, null, 0, 'roll', [], {}]) {
      expect(isDiceThrow(value)).toBe(false);
    }
  });

  it('rejects an unknown seat', () => {
    expect(isDiceThrow({ ...thrown(), seat: 'middle' })).toBe(false);
    expect(isSeat('n')).toBe(true);
    expect(isSeat('middle')).toBe(false);
  });

  it('rejects a die the renderer could not draw', () => {
    for (const bad of [
      die({ sides: 0 }),
      die({ sides: 1 }),
      die({ sides: 3.5 }),
      die({ sides: 1000 }),
      die({ value: 0 }),
      die({ sides: 6, value: 7 }),
      die({ step: -1 }),
      { ...die({}), role: 'boss' } as unknown as DieEvent,
    ]) {
      expect(isDiceThrow(thrown({ dice: [bad] }))).toBe(false);
    }
  });

  it('rejects an empty throw and a flood', () => {
    expect(isDiceThrow(thrown({ dice: [] }))).toBe(false);
    const flood = Array.from({ length: MAX_DICE + 1 }, () => die({}));
    expect(isDiceThrow(thrown({ dice: flood }))).toBe(false);
    expect(isDiceThrow(thrown({ dice: flood.slice(1) }))).toBe(true);
  });
});

describe('seats', () => {
  const gm: Seated = { id: 'gm', name: 'Damian', gm: true };
  const paul: Seated = { id: 'p2', name: 'Paul', gm: false };
  const other: Seated = { id: 'p1', name: 'Jen', gm: false };

  it('gives the Marshal the top and players the other edges', () => {
    const seats = assignSeats([gm, paul, other], {});
    expect(seats['gm']).toBe(GM_SEAT);
    expect(seats['p1']).not.toBe(GM_SEAT);
    expect(seats['p2']).not.toBe(GM_SEAT);
    expect(seats['p1']).not.toBe(seats['p2']);
  });

  it('keeps a seat a player already had', () => {
    const seats = assignSeats([gm, paul, other], { p2: 'e' });
    expect(seats['p2']).toBe('e');
  });

  it('is stable when someone new joins', () => {
    const before = assignSeats([gm, paul, other], {});
    const after = assignSeats([gm, paul, other, { id: 'p3', name: 'Sam', gm: false }], before);
    expect(after['p1']).toBe(before['p1']);
    expect(after['p2']).toBe(before['p2']);
    expect(after['p3']).toBeDefined();
  });

  it('is stable when someone leaves and comes back', () => {
    const full = assignSeats([gm, paul, other], {});
    const alone = assignSeats([gm, paul], full);
    const back = assignSeats([gm, paul, other], alone);
    expect(back['p2']).toBe(full['p2']);
    expect(back['p1']).toBe(full['p1']);
  });

  it('takes a stored seat away from a player who is holding the Marshal’s', () => {
    // Yesterday's GM is today's player: nobody else should be sharing the Marshal's
    // edge, because two people throwing down it is the one arrangement that defeats
    // the point of seats.
    const seats = assignSeats([gm, paul], { p2: GM_SEAT });
    expect(seats['p2']).not.toBe(GM_SEAT);
  });

  it('breaks a double booking rather than seating two people on one edge', () => {
    const seats = assignSeats([paul, other], { p1: 'w', p2: 'w' });
    expect(seats['p1']).not.toBe(seats['p2']);
  });

  it('seats a table with more players than edges', () => {
    const crowd = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, gm: false }));
    const seats = assignSeats([gm, ...crowd], {});
    expect(Object.keys(seats)).toHaveLength(10);
    expect(Object.values(seats).filter((s) => s === GM_SEAT)).toHaveLength(1);
  });
});

describe('throw vectors', () => {
  it('sends the Marshal’s dice down the screen', () => {
    expect(seatVector('n')).toEqual({ x: 0, y: 1 });
    expect(seatVector('s').y).toBe(-1);
  });

  it('gives every seat a direction of the same length', () => {
    for (const seat of ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'] as const) {
      const v = seatVector(seat);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
    }
  });

  it('jitters within ten degrees, and never to zero length', () => {
    const straight = seatVector('n');
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const shaken = jitter(straight, () => r);
      expect(Math.hypot(shaken.x, shaken.y)).toBeCloseTo(1, 6);
      const angle = Math.abs(Math.atan2(shaken.x, shaken.y));
      expect(angle).toBeLessThanOrEqual(Math.PI / 18 + 1e-9);
    }
  });
});
