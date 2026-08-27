import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isTokenState, newTokenState, type TokenState } from '../src/obr/binding.js';
import { parseArchetypeCards } from '../src/rules/importArchetypeCard.js';
import {
  adjustedDamage,
  applyDamage,
  describeAdjustment,
  effectiveToughness,
  soak,
  soakedWounds,
} from '../src/rules/damage.js';
import { emptySheet, type Sheet } from '../src/rules/sheet.js';

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

/**
 * The Marshal's adjustment, which is how the app copes with rules it does not
 * know. Coffin Rock alone needs Hardy, Undead and Construct halving, three
 * Immunities, Invulnerable, Ethereal, Weakness (Head) and Swarm; the open
 * bestiary adds 159 abilities that appear exactly once each. One control covers
 * all of them — see MECHANICS-INVENTORY.md §8.3.
 */
describe('adjusting damage before it is applied', () => {
  const sheet: Sheet = { ...emptySheet('blood-man', 'Blood Man'), toughness: 7, wildCard: false };
  const fresh = newTokenState('blood-man');

  it('changes nothing when there is no adjustment', () => {
    expect(adjustedDamage(11, undefined)).toBe(11);
    expect(describeAdjustment(11, undefined)).toBe('');
  });

  it('halves, rounding down', () => {
    expect(adjustedDamage(11, { factor: 0.5 })).toBe(5);
    expect(adjustedDamage(7, { factor: 0.5 })).toBe(3);
  });

  it('adds a flat change, as Weakness (Head) does', () => {
    expect(adjustedDamage(6, { delta: 2 })).toBe(8);
  });

  it('never goes below zero', () => {
    expect(adjustedDamage(1, { delta: -5 })).toBe(0);
  });

  /**
   * The order is the whole point. "Piercing attacks do half damage" halves the
   * *roll*, before it meets Toughness. Halving the wounds afterwards would give
   * a different answer from the same words: 11 vs Toughness 7 is one wound, and
   * half of one wound rounds to none — whereas halving first is 5 vs 7, which
   * does not even Shake.
   */
  it('halves the roll, not the wounds', () => {
    const halved = applyDamage(sheet, fresh, { damage: 11 }, { factor: 0.5 });
    expect(halved.wounds).toBe(0);
    expect(halved.becameShaken).toBe(false);

    const unhalved = applyDamage(sheet, fresh, { damage: 11 });
    expect(unhalved.wounds).toBe(1);
  });

  /** Armour-piercing still applies to Toughness, not to the adjusted roll. */
  it('composes with AP', () => {
    const armoured: Sheet = { ...sheet, toughness: 10, armor: 3 };
    const outcome = applyDamage(armoured, fresh, { damage: 20, ap: 2 }, { factor: 0.5 });
    // Toughness 10 − 2 armour-piercing = 8; damage 20 halved = 10; margin 2.
    expect(outcome.toughness).toBe(8);
    expect(outcome.becameShaken).toBe(true);
  });

  it('shows the working, with the reason', () => {
    expect(describeAdjustment(11, { factor: 0.5, reason: 'Construct: piercing' })).toBe(
      '11 halved = 5 (Construct: piercing)',
    );
    expect(describeAdjustment(6, { delta: 2, reason: 'Weakness (Head)' })).toBe(
      '6 +2 = 8 (Weakness (Head))',
    );
    expect(describeAdjustment(9, { factor: 2 })).toBe('9 ×2 = 18');
  });

  /** And the working reaches the line that gets published. */
  it('puts the working in the outcome description', () => {
    const outcome = applyDamage(sheet, fresh, { damage: 11 }, { factor: 0.5, reason: 'Construct' });
    expect(outcome.description).toContain('11 halved = 5 (Construct)');
    expect(outcome.description).toContain('Toughness 7');
  });

  /**
   * Hardy — "a second Shaken result does not cause a wound" — is not modelled
   * and does not need to be: the Marshal declines the wound by adjusting the
   * roll under Toughness, and the reason says so in the log.
   */
  it('is how Hardy is handled without encoding Hardy', () => {
    const shaken = { ...fresh, shaken: true };
    expect(applyDamage(sheet, shaken, { damage: 8 }).wounds).toBe(1);
    const hardy = applyDamage(sheet, shaken, { damage: 8 }, { factor: 0.5, reason: 'Hardy' });
    expect(hardy.wounds).toBe(0);
    expect(hardy.description).toContain('Hardy');
  });
});

/**
 * The Soak window, and why it is on the token.
 *
 * Reported from the table 2026-08-22: *"When Greg was wounded, I (GM) could see
 * the 'Soak 3' option, but he couldn't see it. If he tried to use a Benny to soak
 * it said he hadn't been damaged."* The amount a Soak could undo lived in a `Map`
 * inside `panel.ts`, written on whichever client applied the damage — the
 * Marshal's — so the player it had happened to had no offer at all.
 */
describe('what a Soak may still undo', () => {
  const target = { ...emptySheet('greg', 'Greg'), wildCard: true, attributes: { ...emptySheet('greg', 'Greg').attributes, vigor: { die: 8 } } };
  const fresh = () => newTokenState('greg');

  it('is recorded on the token when a hit wounds', () => {
    const outcome = applyDamage(target, fresh(), { damage: 20 });
    expect(outcome.wounds).toBeGreaterThan(0);
    expect(outcome.state.soakable).toBe(outcome.wounds);
  });

  it('is absent when the hit did nothing', () => {
    expect(applyDamage(target, fresh(), { damage: 1 }).state.soakable).toBeUndefined();
  });

  it('is absent when the hit only Shook them', () => {
    const shaking = applyDamage(target, fresh(), { damage: effectiveToughness(target) });
    expect(shaking.wounds).toBe(0);
    expect(shaking.state.soakable).toBeUndefined();
  });

  /**
   * A later hit that does nothing does not take the offer away. The character has
   * not stopped being freshly wounded because somebody else's shot glanced off,
   * and closing the window over an event that cost them nothing would be the same
   * class of unfairness as the bug this replaced.
   */
  it('survives a later hit that does nothing', () => {
    const mauled = applyDamage(target, fresh(), { damage: 20 }).state;
    expect(applyDamage(target, mauled, { damage: 1 }).state.soakable).toBe(mauled.soakable);
  });

  it('is replaced, not added to, by a later hit that does wound', () => {
    const first = applyDamage(target, fresh(), { damage: 20 }).state;
    const second = applyDamage(target, first, { damage: 20 });
    expect(second.state.soakable).toBe(second.wounds);
  });

  it('closes on a successful Soak', () => {
    const hit = applyDamage(target, fresh(), { damage: 20 }).state;
    const after = soak(hit, 12, hit.soakable!);
    expect(after.wounds).toBeLessThan(hit.wounds);
    expect(after.soakable).toBeUndefined();
  });

  /**
   * A failed Soak spends the Benny too. Leaving the offer up would sell a second
   * attempt at the same wound for a second chip.
   */
  it('closes on a failed Soak as well', () => {
    const hit = applyDamage(target, fresh(), { damage: 20 }).state;
    const after = soak(hit, 1, hit.soakable!);
    expect(after.wounds).toBe(hit.wounds);
    expect(after.soakable).toBeUndefined();
  });

  it('survives the round trip through the token guard', () => {
    const hit = applyDamage(target, fresh(), { damage: 20 }).state;
    expect(isTokenState(JSON.parse(JSON.stringify(hit)))).toBe(true);
  });

  /** Every token bound before this field existed has none, and must still read. */
  it('is optional, so older bindings still validate', () => {
    expect(isTokenState(newTokenState('greg'))).toBe(true);
  });
});
