import { describe, expect, it } from 'vitest';
import {
  skillCanStray,
  spraysLead,
  strayShots,
  strayThreshold,
  strayWarning,
  STRAY_ON_MISS,
  STRAY_ON_SPRAY,
} from '../src/rules/bystanders.js';
import { parseGear } from '../src/rules/gear.js';
import type { DieEvent } from '../src/dice/roller.js';
import { rollTrait } from '../src/rules/traitRoll.js';
import { JavaRandom } from '../src/dice/javaRandom.js';

/** One die as the roller emits it. `step: 0` is the die itself, not an ace's child. */
function die(value: number, role: DieEvent['role'] = 'trait', step = 0): DieEvent {
  return { sides: value === 1 ? 6 : 8, value, chain: 0, step, role };
}

describe('which shots can go astray', () => {
  it('counts a skill die of 1', () => {
    expect(strayShots([die(1)], STRAY_ON_MISS)).toBe(1);
  });

  /**
   * The rule the whole module turns on. A Wild Card rolling trait 1 / wild 8 hit
   * with an 8 — but the 1 is still on the table, and the Wild Die never counts it.
   */
  it('never counts the Wild Die', () => {
    expect(strayShots([die(1, 'wild'), die(7)], STRAY_ON_MISS)).toBe(0);
    expect(strayShots([die(1), die(8, 'wild')], STRAY_ON_MISS)).toBe(1);
  });

  /** An ace's continuation is the same die going again, and it showed its maximum. */
  it('ignores the dice an ace bought', () => {
    expect(strayShots([die(6), die(1, 'trait', 1)], STRAY_ON_MISS)).toBe(0);
  });

  it('takes a 2 only when the weapon sprays', () => {
    expect(strayShots([die(2)], STRAY_ON_MISS)).toBe(0);
    expect(strayShots([die(2)], STRAY_ON_SPRAY)).toBe(1);
  });

  /** Counted rather than flagged: each die is its own stray shot. */
  it('counts each qualifying die', () => {
    expect(strayShots([die(1), die(1), die(5)], STRAY_ON_MISS)).toBe(2);
  });

  /**
   * End to end against the real engine, not against hand-built `DieEvent`s.
   *
   * Both halves matter. Seed 4096 rolls `s8: [1; w4]` — a Wild Card whose trait
   * die is a 1 and whose *roll* is a 4, so this also pins that the count is taken
   * off the skill die and not off the result. Seed 4480 rolls `[2; w2]`, which is
   * a 2 on the skill die: nothing for a rifle, one stray shot for a scattergun.
   */
  it('sees a real roll from the engine', () => {
    const wide = rollTrait({ die: 8, mod: 0, wildCard: true }, new JavaRandom(4096));
    expect(wide.explained).toContain('[1; w4]');
    expect(strayShots(wide.dice, STRAY_ON_MISS)).toBe(1);

    const two = rollTrait({ die: 8, mod: 0, wildCard: true }, new JavaRandom(4480));
    expect(two.explained).toContain('[2; w2]');
    expect(strayShots(two.dice, STRAY_ON_MISS)).toBe(0);
    expect(strayShots(two.dice, STRAY_ON_SPRAY)).toBe(1);
  });

  /**
   * Three trait dice, from the engine, through the real path.
   *
   * The point is the **roles**. `strayShots` filters `role === 'trait'`, and the
   * whole count silently becomes zero if a multi-die trait roll were to come back
   * as one `trait` plus two `plain` — which is exactly the RoF > 1 case the shot
   * panel now depends on, and the case this function predates. Seed 5 rolls
   * `3s8: [1; 2; 6; w3]`: one stray for a rifle, two for a scattergun.
   */
  it('counts every trait die of a multi-shot roll', () => {
    const burst = rollTrait({ die: 8, mod: 0, wildCard: true, count: 3 }, new JavaRandom(5));
    expect(burst.explained).toContain('[1; 2; 6; w3]');
    expect(burst.dice.filter((d) => d.role === 'trait')).toHaveLength(3);
    expect(strayShots(burst.dice, STRAY_ON_MISS)).toBe(1);
    expect(strayShots(burst.dice, STRAY_ON_SPRAY)).toBe(2);
  });

  /** The modifier is not on the die: an untrained d4−2 strays on the face, not the total. */
  it('reads the face, not the total', () => {
    const roll = rollTrait({ die: 8, mod: -2, wildCard: true }, new JavaRandom(4096));
    expect(roll.explained).toContain('= **2**');
    expect(strayShots(roll.dice, STRAY_ON_MISS)).toBe(1);
  });
});

describe('the window a weapon strays in', () => {
  it('is 1 for an ordinary gun', () => {
    expect(strayThreshold({ name: 'Colt Frontier', damage: '2d6', rof: 1 })).toBe(STRAY_ON_MISS);
  });

  it('is 1 when there is no weapon at all', () => {
    expect(strayThreshold()).toBe(STRAY_ON_MISS);
  });

  it('is 2 for RoF 2 or better', () => {
    expect(strayThreshold({ name: 'Gatling Pistol', damage: '2d6', rof: 3 })).toBe(STRAY_ON_SPRAY);
  });

  /**
   * The scattergun's real signature. Paige's LeMat splits into two rows, and only
   * the shotgun barrel — the one written `1-3d6` — widens the window; her pistol
   * barrel out of the same bracket does not.
   */
  it('is 2 for the shotgun barrel of a LeMat and 1 for the pistol barrel', () => {
    const { weapons } = parseGear(
      'LeMat Revolver (pistol—Range 12/24/49, Damage 2d6, RoF 1, Shots 9; ' +
        'shotgun—Range 5/10/20, Damage 1-3d6, RoF 1, Shots 1)',
    );
    const pistol = weapons.find((w) => w.name.includes('pistol'))!;
    const shotgun = weapons.find((w) => w.name.includes('shotgun'))!;
    expect(strayThreshold(pistol)).toBe(STRAY_ON_MISS);
    expect(strayThreshold(shotgun)).toBe(STRAY_ON_SPRAY);
  });

  it('reads the name when the numbers do not say', () => {
    expect(spraysLead({ name: 'Double barrel shotgun' })).toBe(true);
    expect(spraysLead({ name: 'Scattergun' })).toBe(true);
    expect(spraysLead({ name: 'Winchester Rifle', damage: '2d8', rof: 1 })).toBe(false);
  });

  it('reads full auto out of the notes', () => {
    expect(spraysLead({ name: 'Maxim Gun', damage: '2d8', notes: 'must fire full RoF' })).toBe(true);
  });
});

describe('which skills stray at all', () => {
  it('covers shots and thrown weapons', () => {
    expect(skillCanStray('Shooting')).toBe(true);
    expect(skillCanStray('Throwing')).toBe(true);
  });

  /**
   * Athletics is out even though the targeting table treats it as a ranged
   * attack: `weaponSkill` never returns it, so it can only have come from the
   * skills list, where it is a climb.
   */
  it('leaves Athletics and Fighting out', () => {
    expect(skillCanStray('Athletics')).toBe(false);
    expect(skillCanStray('Fighting')).toBe(false);
    expect(skillCanStray('Notice')).toBe(false);
    expect(skillCanStray(undefined)).toBe(false);
  });
});

describe('what the table is told', () => {
  /** Conditional on purpose: the app knows the die, not whether it missed. */
  it('says the miss is the condition, and the Marshal decides', () => {
    const warning = strayWarning(1, STRAY_ON_MISS);
    expect(warning).toContain('miss');
    expect(warning).toContain('Wild Die never counts');
    expect(warning).toMatch(/Marshal/);
  });

  it('explains the wider window for a weapon that sprays', () => {
    expect(strayWarning(1, STRAY_ON_SPRAY)).toContain('1–2');
    expect(strayWarning(1, STRAY_ON_MISS)).not.toContain('1–2');
  });

  it('agrees with itself about plurals', () => {
    expect(strayWarning(1, STRAY_ON_MISS)).toContain('1 skill die');
    expect(strayWarning(2, STRAY_ON_MISS)).toContain('2 skill dice');
  });
});
