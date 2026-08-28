import { describe, expect, it } from 'vitest';
import { CENTRE, isBennyToss, screenPoint, tossPath } from '../src/obr/bennyToss.js';
import { BOTTOM, relativeVector } from '../src/obr/seats.js';

/**
 * Round off, so a vector can be compared without minding the last bit.
 *
 * The `+ 0` is not decoration: `Math.round(-0.0000001)` is `-0`, and `toEqual`
 * distinguishes that from `0`.
 */
function at(vector: { x: number; y: number }): [number, number] {
  return [Math.round(vector.x * 1000) / 1000 + 0, Math.round(vector.y * 1000) / 1000 + 0];
}

describe('which way a chip travels', () => {
  it('lands at the bottom of the receiving player’s own screen', () => {
    // Marshal at place 0, the player at place 2, seen by that player.
    const { from, to } = tossPath(2, { from: 0, to: 2, places: 4 });
    expect(at(to)).toEqual(at(BOTTOM));
    expect(at(from)).toEqual(at({ x: 0, y: 1 })); // the Marshal is opposite
  });

  it('leaves from the bottom of the giver’s own screen', () => {
    const { from } = tossPath(0, { from: 0, to: 2, places: 4 });
    expect(at(from)).toEqual(at(BOTTOM));
  });

  it('crosses between two other edges for everyone else', () => {
    // Watched from place 1: the giver and the receiver are both elsewhere, and
    // neither end is the bottom of this screen.
    const { from, to } = tossPath(1, { from: 0, to: 2, places: 4 });
    expect(at(from)).not.toEqual(at(BOTTOM));
    expect(at(to)).not.toEqual(at(BOTTOM));
    expect(at(from)).not.toEqual(at(to));
  });

  it('puts a chip on the table when nobody at the table is receiving', () => {
    // An NPC Wild Card, or a player who is not in the room.
    const { from, to } = tossPath(1, { from: 0, places: 4 });
    expect(to).toEqual(CENTRE);
    expect(at(from)).not.toEqual(at(CENTRE));
  });

  it('takes a chip off the table when the giver is the receiver', () => {
    // The Marshal's own stack. A place to the same place is no movement at all,
    // so it comes from the middle instead of going nowhere.
    const { from, to } = tossPath(0, { from: 0, to: 0, places: 4 });
    expect(from).toEqual(CENTRE);
    expect(at(to)).toEqual(at(BOTTOM));
  });
});

describe('putting a chip on the window', () => {
  it('sends the middle to the middle', () => {
    expect(screenPoint(CENTRE)).toEqual({ left: 50, top: 50 });
  });

  it('flips the vertical, because +y is up at the table and down in CSS', () => {
    // The bottom of the table is the bottom of the screen: a larger `top`.
    expect(screenPoint(BOTTOM).top).toBeGreaterThan(50);
    expect(screenPoint({ x: 0, y: 1 }).top).toBeLessThan(50);
  });

  it('puts an edge off the screen rather than just inside it', () => {
    expect(screenPoint({ x: 1, y: 0 }).left).toBeGreaterThan(100);
  });

  /**
   * The case that made `screenPoint` scale by its larger component. A ring of three
   * or five — which is what this table actually plays — puts seats on diagonals, and
   * a plain unit vector traces a circle inside the window rather than reaching it.
   */
  it('gets every seat of every ring off the screen, diagonals included', () => {
    for (const places of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (let seat = 0; seat < places; seat++) {
        const { left, top } = screenPoint(relativeVector(0, seat, places));
        expect(left < 0 || left > 100 || top < 0 || top > 100, `${seat}/${places}`).toBe(true);
      }
    }
  });
});

describe('what arrives on the channel', () => {
  it('takes a toss with and without a receiver', () => {
    expect(isBennyToss({ from: 0, to: 2, places: 4 })).toBe(true);
    expect(isBennyToss({ from: 0, places: 4 })).toBe(true);
  });

  it('refuses anything that would not aim', () => {
    expect(isBennyToss(undefined)).toBe(false);
    expect(isBennyToss({ from: 0 })).toBe(false);
    expect(isBennyToss({ from: 0, places: 0 })).toBe(false);
    expect(isBennyToss({ from: '0', places: 4 })).toBe(false);
    expect(isBennyToss({ from: 0, to: 1.5, places: 4 })).toBe(false);
  });
});
