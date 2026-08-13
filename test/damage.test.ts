import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newTokenState, type TokenState } from '../src/obr/binding.js';
import { parseArchetypeCards } from '../src/rules/importArchetypeCard.js';
import { applyDamage, effectiveToughness, soak, soakedWounds } from '../src/rules/damage.js';
import type { Sheet } from '../src/rules/sheet.js';

/** Reggie: Toughness 7, armour 2 — so 5 under a fully armour-piercing round. */
const reggie = parseArchetypeCards(
  readFileSync(fileURLToPath(new URL('./fixtures/reggie-kane.html', import.meta.url)), 'utf8'),
)[0]!;

const extra: Sheet = { ...reggie, wildCard: false };
const state = (over: Partial<TokenState> = {}): TokenState => ({
  ...newTokenState(reggie.id),
  ...over,
});

describe('armour piercing', () => {
  it('cancels armour', () => {
    expect(effectiveToughness(reggie)).toBe(7);
    expect(effectiveToughness(reggie, 1)).toBe(6);
    expect(effectiveToughness(reggie, 2)).toBe(5);
  });

  it('never cuts past the armour into the character', () => {
    // AP 4 against 2 points of armour is still only worth 2.
    expect(effectiveToughness(reggie, 4)).toBe(5);
  });

  it('ignores a negative AP', () => {
    expect(effectiveToughness(reggie, -3)).toBe(7);
  });
});

describe('applying damage to a Wild Card', () => {
  it('does nothing below Toughness', () => {
    const out = applyDamage(reggie, state(), { damage: 6 });
    expect(out.state).toEqual(state());
    expect(out.description).toMatch(/no effect/);
  });

  it('Shakes on exactly Toughness', () => {
    const out = applyDamage(reggie, state(), { damage: 7 });
    expect(out.becameShaken).toBe(true);
    expect(out.wounds).toBe(0);
    expect(out.state.shaken).toBe(true);
  });

  it('wounds on a raise, and every raise after', () => {
    expect(applyDamage(reggie, state(), { damage: 11 }).wounds).toBe(1);
    expect(applyDamage(reggie, state(), { damage: 14 }).wounds).toBe(1);
    expect(applyDamage(reggie, state(), { damage: 15 }).wounds).toBe(2);
    expect(applyDamage(reggie, state(), { damage: 19 }).wounds).toBe(3);
  });

  it('wounds an already-Shaken target instead of Shaking it again', () => {
    const out = applyDamage(reggie, state({ shaken: true }), { damage: 7 });
    expect(out.wounds).toBe(1);
    expect(out.state.wounds).toBe(1);
  });

  it('Shakes as well as wounding', () => {
    expect(applyDamage(reggie, state(), { damage: 11 }).state.shaken).toBe(true);
  });

  it('adds to wounds already taken', () => {
    const out = applyDamage(reggie, state({ wounds: 1 }), { damage: 11 });
    expect(out.state.wounds).toBe(2);
  });

  it('reports Incapacitated past the fourth wound', () => {
    const out = applyDamage(reggie, state({ wounds: 3 }), { damage: 11 });
    expect(out.incapacitated).toBe(true);
    expect(out.description).toMatch(/Incapacitated/);
  });

  it('lets AP turn a graze into a wound', () => {
    // 11 damage is a Shake against Toughness 7, a wound against 5.
    expect(applyDamage(reggie, state(), { damage: 10 }).wounds).toBe(0);
    expect(applyDamage(reggie, state(), { damage: 10, ap: 2 }).wounds).toBe(1);
  });
});

describe('applying damage to an Extra', () => {
  it('is out on the first wound', () => {
    const out = applyDamage(extra, state(), { damage: 11 });
    expect(out.wounds).toBe(1);
    expect(out.incapacitated).toBe(true);
  });

  it('is merely Shaken by a hit that does not raise', () => {
    const out = applyDamage(extra, state(), { damage: 8 });
    expect(out.incapacitated).toBe(false);
    expect(out.state.shaken).toBe(true);
  });
});

describe('soaking', () => {
  it('removes nothing on a failure', () => {
    expect(soakedWounds(3)).toBe(0);
    expect(soak(state({ wounds: 2 }), 3, 2).wounds).toBe(2);
  });

  it('removes one per success and raise', () => {
    expect(soakedWounds(4)).toBe(1);
    expect(soakedWounds(8)).toBe(2);
    expect(soakedWounds(12)).toBe(3);
  });

  it('cannot remove more than the hit caused', () => {
    // A spectacular Vigor roll does not heal wounds from an earlier fight.
    expect(soak(state({ wounds: 3 }), 12, 1).wounds).toBe(2);
  });

  it('clears the Shaken from a hit that is soaked away entirely', () => {
    const after = soak(state({ wounds: 1, shaken: true }), 8, 1);
    expect(after.wounds).toBe(0);
    expect(after.shaken).toBe(false);
  });

  it('leaves Shaken alone when only some wounds are soaked', () => {
    expect(soak(state({ wounds: 2, shaken: true }), 4, 2).shaken).toBe(true);
  });
});
