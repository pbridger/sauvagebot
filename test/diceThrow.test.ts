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
import {
  BOTTOM,
  assignPlaces,
  jitter,
  relativeVector,
  ringSize,
  seatVector,
  storedPlaces,
  type Seated,
} from '../src/obr/seats.js';
import {
  DICE_COLOURS,
  defaultDiceColour,
  diceColourOf,
  emptySheet,
} from '../src/rules/sheet.js';

function die(partial: Partial<DieEvent>): DieEvent {
  return { sides: 6, value: 3, chain: 1, step: 0, role: 'plain', ...partial };
}

function thrown(partial: Partial<DiceThrow> = {}): DiceThrow {
  return { id: 'roll-1', dice: [die({})], place: 0, places: 3, ...partial };
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

  it('rejects a place that is not a chair on the table it names', () => {
    // Not "is this a number" but "do the two agree": a place of 3 on a table of 3
    // wraps onto index 0 and puts two players on the same edge.
    expect(isDiceThrow({ ...thrown(), place: 3, places: 3 })).toBe(false);
    expect(isDiceThrow({ ...thrown(), place: -1 })).toBe(false);
    expect(isDiceThrow({ ...thrown(), place: 1.5 })).toBe(false);
    expect(isDiceThrow({ ...thrown(), places: 0 })).toBe(false);
    expect(isDiceThrow({ ...thrown(), place: 'n', places: undefined })).toBe(false);
    expect(isDiceThrow({ ...thrown(), place: 2, places: 3 })).toBe(true);
  });

  it('still knows a compass edge, which the tuning page throws from', () => {
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

describe('places at the table', () => {
  const gm: Seated = { id: 'gm', name: 'Damian', gm: true };
  const paul: Seated = { id: 'p2', name: 'Paul', gm: false };
  const other: Seated = { id: 'p1', name: 'Jen', gm: false };

  it('gives everyone their own chair, the Marshal included', () => {
    // No reserved place any more: with each viewer drawn at the bottom of their own
    // screen there is no fixed edge for the Marshal to hold.
    const seats = assignPlaces([gm, paul, other], {});
    expect(new Set(Object.values(seats)).size).toBe(3);
    expect(Object.values(seats).sort()).toEqual([0, 1, 2]);
  });

  it('keeps a place a player already had', () => {
    const seats = assignPlaces([gm, paul, other], { p2: 4 });
    expect(seats['p2']).toBe(4);
  });

  it('is stable when someone new joins', () => {
    const before = assignPlaces([gm, paul, other], {});
    const after = assignPlaces([gm, paul, other, { id: 'p3', name: 'Sam', gm: false }], before);
    expect(after['p1']).toBe(before['p1']);
    expect(after['p2']).toBe(before['p2']);
    expect(after['p3']).toBeDefined();
  });

  it('is stable when someone leaves and comes back', () => {
    const full = assignPlaces([gm, paul, other], {});
    const alone = assignPlaces([gm, paul], full);
    const back = assignPlaces([gm, paul, other], alone);
    expect(back['p2']).toBe(full['p2']);
    expect(back['p1']).toBe(full['p1']);
  });

  it('ignores a stored value from the old compass scheme', () => {
    // The key is different now, but a hand-edited room or a future rename should not
    // put `'nw'` where an index goes.
    const seats = assignPlaces([paul], { p2: 'nw' });
    expect(seats['p2']).toBe(0);
  });

  it('breaks a double booking rather than seating two people on one chair', () => {
    const seats = assignPlaces([paul, other], { p1: 1, p2: 1 });
    expect(seats['p1']).not.toBe(seats['p2']);
  });

  it('gives a table of ten ten chairs', () => {
    const crowd = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, gm: false }));
    const seats = assignPlaces([gm, ...crowd], {});
    expect(new Set(Object.values(seats)).size).toBe(10);
    expect(ringSize(seats)).toBe(10);
  });

  it('fills the gap a departed player left rather than widening the table', () => {
    // Four players 0–3, #2 leaves. The other three must not shuffle round — that is
    // the identity cue — so the ring stays 4 and the next joiner takes chair 2.
    const present = { a: 0, b: 1, d: 3 };
    expect(ringSize(present)).toBe(4);
    const joined = assignPlaces(
      [
        { id: 'a', name: 'A', gm: false },
        { id: 'b', name: 'B', gm: false },
        { id: 'd', name: 'D', gm: false },
        { id: 'e', name: 'E', gm: false },
      ],
      present,
    );
    expect(joined).toEqual({ a: 0, b: 1, d: 3, e: 2 });
    expect(ringSize(joined)).toBe(4);
  });

  it('is a table of one when nobody has a place yet', () => {
    expect(ringSize({})).toBe(1);
  });

  it('gives every client the same answer from the same room', () => {
    // Load-bearing: the panel and the tray are separate iframes that each work the
    // arrangement out for themselves, and the tray reads *nothing* the panel wrote. If
    // this were not deterministic, your own dice would stop coming from the bottom of
    // your own screen — which is the one thing the feature promises.
    const room = {
      'com.savagebot/place/p1': 2,
      'com.savagebot/mine/p1': 'reggie',
      'com.savagebot/place/gm': 'nw',
    };
    const party = [gm, other, paul];
    const panel = assignPlaces(party, storedPlaces(room));
    // The tray builds its list itself, starting with whoever is reading — a different
    // order, and it must not matter.
    const tray = assignPlaces([paul, gm, other], storedPlaces(room));
    expect(tray).toEqual(panel);
    expect(panel['p1']).toBe(2);
  });
});

describe('which way a roll comes in', () => {
  it('puts my own dice at the bottom of my own screen, exactly', () => {
    // The headline of the whole arrangement, and it has to be exact rather than
    // within a rounding error.
    for (const ring of [1, 2, 3, 5, 8]) {
      for (let k = 0; k < ring; k++) {
        expect(relativeVector(k, k, ring)).toEqual(BOTTOM);
      }
    }
  });

  it('puts the only other person at the table opposite me', () => {
    // Also the two-person regression check: under the old scheme the Marshal was at
    // the top of a player's screen, and for a table of two they still are.
    const v = relativeVector(0, 1, 2);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(1, 6);
  });

  it('is mutually consistent: if you are on my left, I am on your right', () => {
    for (const ring of [2, 3, 4, 5, 7]) {
      for (let a = 0; a < ring; a++) {
        for (let b = 0; b < ring; b++) {
          const mine = relativeVector(a, b, ring);
          const theirs = relativeVector(b, a, ring);
          expect(theirs.x).toBeCloseTo(-mine.x, 6);
          expect(theirs.y).toBeCloseTo(mine.y, 6);
        }
      }
    }
  });

  it('advances clockwise round the screen', () => {
    // From the bottom, clockwise reads bottom → left → top → right.
    expect(relativeVector(0, 1, 4).x).toBeLessThan(0);
    expect(relativeVector(0, 2, 4).y).toBeGreaterThan(0);
    expect(relativeVector(0, 3, 4).x).toBeGreaterThan(0);
  });

  it('gives every direction the same length', () => {
    for (const ring of [1, 2, 3, 6, 9]) {
      for (let k = 0; k < ring; k++) {
        const v = relativeVector(0, k, ring);
        expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
      }
    }
  });

  it('still throws somewhere when two clients disagree about the party', () => {
    // A place off the end of the ring the thrower measured is a moment of skew, not
    // a reason to launch a die at NaN.
    const v = relativeVector(7, 1, 3);
    expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
  });
});

describe('throw vectors', () => {
  it('puts each seat on the edge it is named after', () => {
    // `+y` is up, `+x` is right. Dice are released here and thrown towards the middle,
    // so the Marshal's appear at the top and come down.
    expect(seatVector('n')).toEqual({ x: 0, y: 1 });
    expect(seatVector('s').y).toBe(-1);
    expect(seatVector('w').x).toBeLessThan(0);
    expect(seatVector('e').x).toBeGreaterThan(0);
    expect(seatVector('nw')).toMatchObject({ x: expect.any(Number) });
    expect(seatVector('nw').x).toBeLessThan(0);
    expect(seatVector('nw').y).toBeGreaterThan(0);
    expect(seatVector('se').x).toBeGreaterThan(0);
    expect(seatVector('se').y).toBeLessThan(0);
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

describe('dice colours', () => {
  it('gives a character the same colour every time', () => {
    expect(defaultDiceColour('reggie')).toBe(defaultDiceColour('reggie'));
  });

  it('does not hand out Bone by default', () => {
    // Bone is the fallback for an unrecognised colour, so two characters landing on
    // it should be somebody's choice rather than a coincidence.
    const bone = DICE_COLOURS[0]!.hex;
    for (const id of ['a', 'b', 'doc-holliday', '01H8', 'reggie', 'x'.repeat(40)]) {
      expect(defaultDiceColour(id)).not.toBe(bone);
    }
  });

  it('only ever picks from the palette', () => {
    const palette = DICE_COLOURS.map((colour) => colour.hex);
    for (let n = 0; n < 200; n++) expect(palette).toContain(defaultDiceColour(`id-${n}`));
  });

  it('spreads a party of six over several colours', () => {
    const party = ['jed', 'paige', 'ed', 'doc', 'reggie', 'sam'].map(defaultDiceColour);
    expect(new Set(party).size).toBeGreaterThanOrEqual(4);
  });

  it('prefers a colour the sheet actually carries', () => {
    const sheet = { ...emptySheet('reggie', 'Reggie'), diceColour: '#a32e26' };
    expect(diceColourOf(sheet)).toBe('#a32e26');
    expect(diceColourOf(emptySheet('reggie', 'Reggie'))).toBe(defaultDiceColour('reggie'));
  });
});
