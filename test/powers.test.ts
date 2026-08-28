import { describe, expect, it } from 'vitest';
import { adjustPoints, castsPowers, maxPowerPoints } from '../src/rules/powers.js';
import { emptySheet, type Sheet } from '../src/rules/sheet.js';

function caster(powerPoints: string): Sheet {
  return {
    ...emptySheet('jed', 'Father Jed'),
    powers: [
      { name: 'POWERS', text: 'Boost/lower Trait, healing, holy symbol, relief, smite.' },
      { name: 'POWER POINTS', text: powerPoints },
      { name: 'BACKLASH', text: 'Fatigue, all active powers terminate.' },
    ],
  };
}

describe('reading a pool off the Powers block', () => {
  it("finds the figure on Jed's card", () => {
    expect(maxPowerPoints(caster('20'))).toBe(20);
  });

  it('reads it through a unit', () => {
    expect(maxPowerPoints(caster('20 PP'))).toBe(20);
  });

  it('does not add a parenthetical to the total', () => {
    // "15 (+5 from Soul Drain)" means fifteen. Summing would hand out five
    // points the book did not.
    expect(maxPowerPoints(caster('15 (+5 from Soul Drain)'))).toBe(15);
  });

  it('matches the name however it is written', () => {
    for (const name of ['POWER POINTS', 'Power Points', 'PowerPoints']) {
      const sheet = { ...caster('10'), powers: [{ name, text: '10' }] };
      expect(maxPowerPoints(sheet), name).toBe(10);
    }
  });

  it('has nothing to say about a character who does not cast', () => {
    const gunslinger = emptySheet('reggie', 'Reggie');
    expect(maxPowerPoints(gunslinger)).toBeUndefined();
    expect(castsPowers(gunslinger)).toBe(false);
  });

  /**
   * A Powers block with no figure in it — a monster's special abilities, which
   * share the field. Better no counter than a counter reading nought.
   */
  it('offers no counter when the line carries no number', () => {
    expect(castsPowers(caster('varies'))).toBe(false);
  });
});

describe('spending and recovering', () => {
  it('will not go below nothing', () => {
    expect(adjustPoints(1, -5, 20)).toBe(0);
  });

  it('will not bank above the maximum', () => {
    // Recovery is capped at your own total; points do not carry over.
    expect(adjustPoints(18, 5, 20)).toBe(20);
  });

  it('moves by the amount asked for in between', () => {
    expect(adjustPoints(10, -3, 20)).toBe(7);
    expect(adjustPoints(10, 5, 20)).toBe(15);
  });
});
