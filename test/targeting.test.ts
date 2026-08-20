import { describe, expect, it } from 'vitest';
import { MANUAL_RANGE } from '../src/rules/modifiers.js';
import {
  BAND_PENALTY,
  EXTREME_MULTIPLE,
  FLAT_TARGET,
  SCOPE_AT_EXTREME,
  attackKind,
  bandFor,
  isTargeted,
  parseRangeBands,
  resolveAimedAttack,
  resolveAttack,
  verdictIsMeaningless,
  withoutFlatVerdict,
} from '../src/rules/targeting.js';

describe('range bands', () => {
  it('reads a weapon line', () => {
    expect(parseRangeBands('12/24/48')).toEqual([12, 24, 48]);
    expect(parseRangeBands(' 5 / 10 / 20 ')).toEqual([5, 10, 20]);
  });

  it('gives up on anything that is not three numbers', () => {
    expect(parseRangeBands(undefined)).toBeUndefined();
    expect(parseRangeBands('—')).toBeUndefined();
    expect(parseRangeBands('12/24')).toBeUndefined();
    expect(parseRangeBands('12/24/48/96')).toBeUndefined();
    expect(parseRangeBands('short/medium/long')).toBeUndefined();
  });

  /** A card writing "Range 12/24/48" means the weapon still reaches at exactly 12. */
  it('is inclusive at each boundary', () => {
    const bands = parseRangeBands('12/24/48')!;
    expect(bandFor(12, bands)).toBe('short');
    expect(bandFor(24, bands)).toBe('medium');
    expect(bandFor(48, bands)).toBe('long');
  });

  it('bands a distance', () => {
    const bands = parseRangeBands('12/24/48')!;
    expect(bandFor(0, bands)).toBe('short');
    expect(bandFor(13, bands)).toBe('medium');
    expect(bandFor(25, bands)).toBe('long');
    expect(bandFor(49, bands)).toBe('over');
  });
});

/**
 * `"Extreme Range: If you're looking to pick off a target way out yonder (up to
 * 4× Long Range)"` — p146. Until this band existed the app told a rifleman his
 * shot could not be taken, which is the bug these pin.
 */
describe('extreme range', () => {
  const bands = parseRangeBands('12/24/48')!;

  it('is not offered unless the shot asks for it', () => {
    expect(bandFor(49, bands)).toBe('over');
    expect(bandFor(192, bands)).toBe('over');
  });

  it('reaches four times long range when it is', () => {
    expect(bandFor(49, bands, { extreme: true })).toBe('extreme');
    expect(bandFor(192, bands, { extreme: true })).toBe('extreme');
  });

  /** Four times long and not a cell further, inclusive like every other band. */
  it('stops at four times long range', () => {
    expect(bandFor(193, bands, { extreme: true })).toBe('over');
    expect(48 * EXTREME_MULTIPLE).toBe(192);
  });

  it('leaves the closer bands alone', () => {
    for (const cells of [0, 12, 13, 24, 25, 48]) {
      expect(bandFor(cells, bands, { extreme: true })).toBe(bandFor(cells, bands));
    }
  });

  it('costs eight, or six with a scope', () => {
    expect(BAND_PENALTY.extreme).toBe(-8);
    expect(BAND_PENALTY.extreme + SCOPE_AT_EXTREME).toBe(-6);
  });

  /**
   * The dial has to be able to express by hand what the band expresses by name,
   * or a Marshal waiving the rule cannot dial the penalty back in.
   */
  it('is within reach of the manual dial', () => {
    expect(Math.abs(BAND_PENALTY.extreme)).toBeLessThanOrEqual(MANUAL_RANGE);
  });

  it('resolves as an ordinary penalty rather than a refusal', () => {
    const outcome = resolveAimedAttack({ total: 14, target: 4, band: 'extreme' });
    expect(outcome.outOfRange).toBe(false);
    expect(outcome.effective).toBe(6);
    expect(outcome.hit).toBe(true);
  });

  /** Past four times long there is still nothing to hit, and no bonus reaches it. */
  it('still refuses beyond four times long', () => {
    const outcome = resolveAimedAttack({ total: 30, target: 4, band: 'over' });
    expect(outcome.outOfRange).toBe(true);
    expect(outcome.hit).toBe(false);
  });
});

describe('resolving an attack', () => {
  it('misses below the target', () => {
    expect(resolveAttack(5, 6)).toEqual({ target: 6, hit: false, raises: 0 });
  });

  it('hits without a raise on the number itself', () => {
    expect(resolveAttack(6, 6)).toEqual({ target: 6, hit: true, raises: 0 });
  });

  it('counts a raise every four over', () => {
    expect(resolveAttack(10, 6).raises).toBe(1);
    expect(resolveAttack(13, 6).raises).toBe(1);
    expect(resolveAttack(14, 6).raises).toBe(2);
  });

  /**
   * The bug this whole feature exists for: a Fighting roll of 8 was reported as
   * "success; 1 raise" against a blind 4, when against a Parry of 6 it is a hit
   * with none.
   */
  it('does not award the raise a flat 4 would have', () => {
    expect(resolveAttack(8, 4).raises).toBe(1);
    expect(resolveAttack(8, 6).raises).toBe(0);
  });
});

/**
 * Reported by Paul from a live room: Shooting 6 at medium range against a
 * Vulnerable target came back "hit, 1 raise". The range band was being computed
 * for the label and then dropped before the arithmetic, so the roll resolved as
 * 6 +2 = 8 against 4 — a raise that was never earned.
 */
describe('one attack against one target', () => {
  it('applies the range penalty as well as the target\'s condition', () => {
    // 6, −2 for medium range, +2 for Vulnerable = 6, against 4: hit by 2.
    const outcome = resolveAimedAttack({ total: 6, target: 4, band: 'medium', targetBonus: 2 });
    expect(outcome.effective).toBe(6);
    expect(outcome.hit).toBe(true);
    expect(outcome.raises).toBe(0);
  });

  it('would have found a raise without the range penalty — the bug', () => {
    expect(resolveAimedAttack({ total: 6, target: 4, targetBonus: 2 }).raises).toBe(1);
  });

  it('costs nothing at short range', () => {
    expect(resolveAimedAttack({ total: 6, target: 4, band: 'short' }).effective).toBe(6);
  });

  it('costs 4 at long range', () => {
    expect(resolveAimedAttack({ total: 10, target: 4, band: 'long' }).effective).toBe(6);
  });

  it('lets a Vulnerable target be hit well, not just hit', () => {
    const plain = resolveAimedAttack({ total: 7, target: 4 });
    const vulnerable = resolveAimedAttack({ total: 7, target: 4, targetBonus: 2 });
    expect(plain.raises).toBe(0);
    expect(vulnerable.raises).toBe(1);
  });

  /** A bonus must never reach past the end of the weapon. */
  it('cannot hit beyond long range, however good the roll', () => {
    const outcome = resolveAimedAttack({ total: 30, target: 4, band: 'over', targetBonus: 2 });
    expect(outcome.outOfRange).toBe(true);
    expect(outcome.hit).toBe(false);
    expect(outcome.raises).toBe(0);
  });

  it('resolves against Parry for a melee attack', () => {
    expect(resolveAimedAttack({ total: 8, target: 6 }).raises).toBe(0);
    expect(resolveAimedAttack({ total: 8, target: 4 }).raises).toBe(1);
  });

  it('misses when the penalty takes it under', () => {
    const outcome = resolveAimedAttack({ total: 5, target: 4, band: 'long' });
    expect(outcome.effective).toBe(1);
    expect(outcome.hit).toBe(false);
  });
});

describe('which skills name a target', () => {
  it('always resolves Fighting against Parry', () => {
    expect(attackKind('Fighting')).toBe('parry');
    expect(attackKind('fighting')).toBe('parry');
  });

  it('leaves Shooting and Throwing to the reader, since melee is a judgement', () => {
    expect(attackKind('Shooting')).toBe('maybe-parry');
    expect(attackKind('Throwing')).toBe('maybe-parry');
  });

  it('treats everything else as a flat target number', () => {
    expect(attackKind('Notice')).toBe('flat');
    expect(attackKind('Persuasion')).toBe('flat');
  });

  it('offers targets only where they would mean something', () => {
    expect(isTargeted('Fighting')).toBe(true);
    expect(isTargeted('Shooting')).toBe(true);
    expect(isTargeted('Notice')).toBe(false);
    expect(isTargeted(undefined)).toBe(false);
  });

  /** A weapon's attack is published as "Colt Rainmaker — Shooting". */
  it('reads a skill off the end of a weapon label', () => {
    expect(attackKind('Shooting')).toBe('maybe-parry');
  });
});

/**
 * Which rolls the engine's flat verdict is actually wrong for. Fighting only —
 * a shot or a climb against 4 is a roll against 4.
 */
describe('when the flat verdict is meaningless', () => {
  it('is meaningless for Fighting, which is always against Parry', () => {
    expect(verdictIsMeaningless('Fighting')).toBe(true);
  });

  /** A shot not into melee is against 4, and the table shows that same 4. */
  it('is kept for Shooting and Throwing', () => {
    expect(verdictIsMeaningless('Shooting')).toBe(false);
    expect(verdictIsMeaningless('Throwing')).toBe(false);
  });

  /**
   * Athletics is SWADE's throwing skill *and* its climbing skill, so it offers a
   * targeting table — but a cliff has no Parry, and stripping the verdict would
   * leave a climb roll with no result at all.
   */
  it('is kept for Athletics, which climbs as well as throws', () => {
    expect(verdictIsMeaningless('Athletics')).toBe(false);
    expect(isTargeted('Athletics')).toBe(true);
  });

  it('is kept for anything untargeted', () => {
    expect(verdictIsMeaningless('Notice')).toBe(false);
    expect(verdictIsMeaningless(undefined)).toBe(false);
  });
});

/**
 * The engine annotates every `s`/`e` roll against a flat 4. On a Fighting roll
 * that verdict is against nothing, and it is what was reported from the table.
 */
describe('stripping the dice engine\'s flat verdict', () => {
  it('removes a success with a raise', () => {
    expect(withoutFlatVerdict('s8+2: [6; w5] + 2 = **8** (success; **1** raise)')).toBe(
      's8+2: [6; w5] + 2 = **8**',
    );
  });

  it('removes a bare success', () => {
    expect(withoutFlatVerdict('s8: [6] = **6** (success)')).toBe('s8: [6] = **6**');
  });

  it('removes plural raises', () => {
    expect(withoutFlatVerdict('s8: [14] = **14** (success; **2** raises)')).toBe(
      's8: [14] = **14**',
    );
  });

  it('leaves a miss alone, since the engine says nothing on one', () => {
    expect(withoutFlatVerdict('s8: [2] = **2**')).toBe('s8: [2] = **2**');
  });

  it('leaves the total and the dice untouched', () => {
    const line = 's6-2: [5; w3] - 2 = **3**';
    expect(withoutFlatVerdict(line)).toBe(line);
  });

  it('does not eat other parenthesised text', () => {
    expect(withoutFlatVerdict('2d6 (Colt Rainmaker) = **7**')).toBe('2d6 (Colt Rainmaker) = **7**');
  });
});

/**
 * Reported by Paul from a live room: *"rolling shooting 5 against a vuln target
 * at range 10 gives result hit, no raises: seems wrong, like we've regressed"*.
 *
 * It is not a regression, and the arithmetic is right — a raise needs to beat
 * the target by four and this beats it by three. What made it look wrong is that
 * **no range penalty was applied at 10 cells**, which happens when the roll came
 * from the skills list rather than from a weapon: the table can measure the
 * distance but has no bands to place it in, because bands belong to a gun. The
 * cell now says so rather than showing a bare number.
 */
describe('a shot with no weapon behind it', () => {
  it('hits without a raise, beating 4 by three', () => {
    const outcome = resolveAimedAttack({ total: 5, target: FLAT_TARGET, targetBonus: 2 });
    expect(outcome.effective).toBe(7);
    expect(outcome.hit).toBe(true);
    expect(outcome.raises).toBe(0);
  });

  /** One more point and it is a raise, which is what makes the boundary readable. */
  it('takes a raise at exactly four over', () => {
    expect(resolveAimedAttack({ total: 6, target: FLAT_TARGET, targetBonus: 2 }).raises).toBe(1);
  });

  /**
   * The same shot at 10 cells with a weapon behind it: 10 is inside a pistol's
   * short range, so there is genuinely nothing to subtract. The answer agrees —
   * which is why the missing band was invisible.
   */
  it('agrees with a pistol at ten cells, since ten is short range', () => {
    const bands = parseRangeBands('12/24/48')!;
    expect(bandFor(10, bands)).toBe('short');
    const outcome = resolveAimedAttack({
      total: 5,
      target: FLAT_TARGET,
      band: 'short',
      targetBonus: 2,
    });
    expect(outcome.effective).toBe(7);
    expect(outcome.raises).toBe(0);
  });

  /**
   * Where it would have mattered: a thrown knife reaches 3/6/12, so ten cells is
   * long range and the same roll misses. That is the case the tooltip is there
   * to stop anyone missing.
   */
  it('misses at ten cells with a short-ranged weapon', () => {
    const bands = parseRangeBands('3/6/12')!;
    expect(bandFor(10, bands)).toBe('long');
    const outcome = resolveAimedAttack({
      total: 5,
      target: FLAT_TARGET,
      band: 'long',
      targetBonus: 2,
    });
    expect(outcome.effective).toBe(3);
    expect(outcome.hit).toBe(false);
  });
});
