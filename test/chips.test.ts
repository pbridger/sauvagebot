import { describe, expect, it } from 'vitest';
import {
  CHIP_COLORS,
  DEFAULT_POT,
  NO_CHIPS,
  PotEmptyError,
  addChips,
  awardChip,
  drawChip,
  drawChips,
  formatChips,
  seededRng,
  spendChip,
  totalChips,
  type ChipColor,
  type ChipCounts,
} from '../src/rules/chips.js';

/**
 * These pin *structure*, not rules numbers — the composition in DEFAULT_POT is
 * unverified and expected to change once the book is to hand, so no test asserts
 * a specific colour count from it.
 */
describe('chip pot', () => {
  it('draws without replacement', () => {
    const rng = seededRng(1);
    let pot = DEFAULT_POT;
    const seen: ChipColor[] = [];
    const total = totalChips(pot);

    for (let i = 0; i < total; i++) {
      const draw = drawChip(pot, rng);
      seen.push(draw.chip);
      pot = draw.pot;
      expect(totalChips(pot)).toBe(total - i - 1);
    }

    // Every chip that was in the pot came out exactly once.
    for (const color of CHIP_COLORS) {
      expect(seen.filter((c) => c === color)).toHaveLength(DEFAULT_POT[color]);
    }
    expect(() => drawChip(pot, rng)).toThrow(PotEmptyError);
  });

  it('is deterministic for a given seed', () => {
    const a = drawChips(DEFAULT_POT, 12, seededRng(42)).chips;
    const b = drawChips(DEFAULT_POT, 12, seededRng(42)).chips;
    const c = drawChips(DEFAULT_POT, 12, seededRng(43)).chips;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('never mutates the pot it is given', () => {
    const pot = { ...DEFAULT_POT };
    drawChips(pot, 10, seededRng(7));
    expect(pot).toEqual(DEFAULT_POT);
  });

  it('stops short rather than throwing when the pot runs dry', () => {
    const pot: ChipCounts = { ...NO_CHIPS, WHITE: 3 };
    const { chips, pot: after } = drawChips(pot, 10, seededRng(3));
    expect(chips).toEqual(['WHITE', 'WHITE', 'WHITE']);
    expect(totalChips(after)).toBe(0);
  });

  it('draws each colour in proportion to its share of the pot', () => {
    // A weak-but-real check that the colour selection walk is not skewed:
    // a pot of equal parts should come out roughly equal over many refills.
    const pot: ChipCounts = { WHITE: 1, RED: 1, BLUE: 1, LEGEND: 1 };
    const rng = seededRng(2024);
    const tally: Record<ChipColor, number> = { WHITE: 0, RED: 0, BLUE: 0, LEGEND: 0 };
    for (let i = 0; i < 4000; i++) tally[drawChip(pot, rng).chip]++;
    for (const color of CHIP_COLORS) {
      expect(tally[color]).toBeGreaterThan(850);
      expect(tally[color]).toBeLessThan(1150);
    }
  });
});

describe('holdings', () => {
  it('conserves the total across draw and spend', () => {
    const rng = seededRng(11);
    let pot = DEFAULT_POT;
    let holding = NO_CHIPS;
    const grand = totalChips(pot);

    const dealt = drawChips(pot, 3, rng);
    pot = dealt.pot;
    holding = addChips(holding, dealt.chips);
    expect(totalChips(pot) + totalChips(holding)).toBe(grand);

    const spent = spendChip(holding, pot, dealt.chips[0]!);
    expect(totalChips(spent.pot) + totalChips(spent.holding)).toBe(grand);
    // A spent chip returns to the pot rather than vanishing.
    expect(spent.pot[dealt.chips[0]!]).toBe(pot[dealt.chips[0]!] + 1);
  });

  it('refuses to spend a chip the player does not hold', () => {
    const holding: ChipCounts = { ...NO_CHIPS, WHITE: 1 };
    expect(() => spendChip(holding, DEFAULT_POT, 'BLUE')).toThrow(/no Blue chip/);
  });

  it('awards from the pot, not from thin air', () => {
    const { chip, holding, pot } = awardChip(NO_CHIPS, DEFAULT_POT, seededRng(5));
    expect(holding[chip]).toBe(1);
    expect(pot[chip]).toBe(DEFAULT_POT[chip] - 1);
    expect(totalChips(pot) + totalChips(holding)).toBe(totalChips(DEFAULT_POT));
  });

  it('formats holdings for display', () => {
    expect(formatChips(NO_CHIPS)).toBe('none');
    expect(formatChips({ WHITE: 2, RED: 1, BLUE: 0, LEGEND: 0 })).toBe('2 White, 1 Red');
  });
});
