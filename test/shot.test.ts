import { describe, expect, it } from 'vitest';
import {
  AIMABLE,
  AIM_BONUS,
  AIM_BUDGET,
  CALLED_SHOTS,
  COVER,
  RECOIL,
  SHOTGUN_BONUS,
  applyAim,
  bakesModifiers,
  bulletsLeft,
  calledShotDamage,
  calledShotMod,
  coverMod,
  describeAmendment,
  firesBuckshot,
  lockedByTheRoll,
  maxRateOfFire,
  negatesRecoil,
  rangeMod,
  reachesExtreme,
  recoilFor,
  shotTotal,
  shotsFired,
  shotgunDamage,
  shotgunMod,
  straysAsFired,
  type ShotMod,
} from '../src/rules/shot.js';
import { BAND_PENALTY, SCOPE_AT_EXTREME } from '../src/rules/targeting.js';
import { MANUAL_RANGE } from '../src/rules/modifiers.js';

const peacemaker = { name: 'Colt Peacemaker', damage: '2d6+1', rof: 1 };
const gatling = { name: 'Gatling pistol', damage: '2d6', rof: 3 };
const shotgun = { name: 'Double-Barrel shotgun', damage: '1–3d6', rof: 1 };
const knife = { name: 'Bowie knife', damage: 'Str+d4' };

describe('rate of fire', () => {
  it('is a ceiling, not a quantity', () => {
    expect(maxRateOfFire(gatling)).toBe(3);
    expect(maxRateOfFire(peacemaker)).toBe(1);
  });

  it('is at least one, whatever the sheet says', () => {
    expect(maxRateOfFire(undefined)).toBe(1);
    expect(maxRateOfFire({ rof: 0 })).toBe(1);
  });
});

/**
 * `"A Gatling pistol with a Rate of Fire of 3, for example, causes Recoil unless
 * its user fires only a single shot."` — p161. The number that matters is the one
 * declared, not the one printed on the gun.
 */
describe('recoil', () => {
  it('costs two when more than one shot is fired', () => {
    expect(recoilFor(2)?.value).toBe(RECOIL);
    expect(recoilFor(3)?.value).toBe(-2);
  });

  it('does not apply to a single shot from a rapid-firing weapon', () => {
    expect(recoilFor(1)).toBeUndefined();
  });

  it('is cancelled outright by Rock and Roll! or a mounting', () => {
    expect(recoilFor(3, true)).toBeUndefined();
    expect(negatesRecoil(['Rock and Roll!'])).toBe(true);
    expect(negatesRecoil(["Rock 'n' Roll"])).toBe(true);
    expect(negatesRecoil(['Rock & Roll'])).toBe(true);
    expect(negatesRecoil([], 'Mounted on a tripod')).toBe(true);
    expect(negatesRecoil(['Steady Hands'], 'black powder weapon')).toBe(false);
  });

  /** Aim's list names Range, Cover, Called Shot, Scale and Speed. Recoil is not on it. */
  it('is not something Aim can reduce', () => {
    const recoil = recoilFor(3)!;
    expect(AIMABLE).not.toContain(recoil.category);
    expect(applyAim([recoil], 'cancel').mods).toEqual([recoil]);
  });
});

/**
 * The bug this closes: `bystanders.ts` reads RoF off the weapon, so a Gatling
 * fired one shot at a time strayed on a 1–2 when only one bullet was in the air.
 */
describe('stray shots, as fired', () => {
  it('widens the window for a burst', () => {
    expect(straysAsFired(gatling, 3)).toBe(true);
  });

  it('narrows it again when that same gun fires once', () => {
    expect(straysAsFired(gatling, 1)).toBe(false);
  });

  it('keeps buckshot wide at any rate of fire', () => {
    expect(straysAsFired(shotgun, 1)).toBe(true);
  });

  /** `"Innocent Bystanders are hit only on a 1 (instead of 1 or 2)"` — p161. */
  it('narrows for slugs, which are a choice rather than a gun', () => {
    expect(straysAsFired(shotgun, 1, true)).toBe(false);
  });

  it('leaves an ordinary revolver alone', () => {
    expect(straysAsFired(peacemaker, 1)).toBe(false);
  });
});

describe('reaching extreme range', () => {
  it('is barred to shotguns', () => {
    expect(reachesExtreme(shotgun)).toBe(false);
  });

  it('is allowed again with slugs', () => {
    expect(reachesExtreme(shotgun, true)).toBe(true);
  });

  it('is barred to thrown weapons', () => {
    expect(reachesExtreme(knife)).toBe(false);
  });

  it('is open to an ordinary firearm', () => {
    expect(reachesExtreme(peacemaker)).toBe(true);
    expect(reachesExtreme(gatling)).toBe(true);
  });
});

describe('range as a modifier', () => {
  it('says nothing at short range', () => {
    expect(rangeMod('short')).toBeUndefined();
  });

  it('carries the band penalty', () => {
    expect(rangeMod('medium')?.value).toBe(-2);
    expect(rangeMod('long')?.value).toBe(-4);
    expect(rangeMod('extreme')?.value).toBe(-8);
  });

  it('takes two off extreme for a scope', () => {
    expect(rangeMod('extreme', true)?.value).toBe(BAND_PENALTY.extreme + SCOPE_AT_EXTREME);
    expect(rangeMod('extreme', true)?.value).toBe(-6);
  });

  /** A scope is worth nothing at the closer bands — the book only names Extreme. */
  it('leaves the closer bands alone even with a scope', () => {
    expect(rangeMod('long', true)?.value).toBe(-4);
  });

  it('has nothing to say about a shot that cannot be taken', () => {
    expect(rangeMod('over')).toBeUndefined();
  });

  it('is a fact rather than a choice, and belongs to the target', () => {
    expect(rangeMod('long')?.kind).toBe('fact');
    expect(rangeMod('long')?.scope).toBe('target');
  });
});

describe('cover', () => {
  it('runs to the book’s four steps', () => {
    expect(COVER.map((c) => c.value)).toEqual([0, -2, -4, -6, -8]);
  });

  it('is per target rather than per shot', () => {
    expect(coverMod(-4)?.scope).toBe('target');
  });

  it('says nothing when there is none', () => {
    expect(coverMod(0)).toBeUndefined();
  });

  /** Cover is the deepest single penalty in the app, and the dial must reach it. */
  it('is within reach of the manual dial', () => {
    for (const step of COVER) expect(Math.abs(step.value)).toBeLessThanOrEqual(MANUAL_RANGE);
  });
});

describe('called shots', () => {
  it('costs four to hit', () => {
    for (const shot of CALLED_SHOTS) expect(shot.value).toBe(-4);
  });

  /** `"Hitting the head or vital organs of living creatures adds +4 damage"` — p154. */
  it('earns four extra damage at the head or vitals, and nowhere else', () => {
    expect(calledShotDamage('head')).toBe(4);
    expect(calledShotDamage('limb')).toBe(0);
    expect(calledShotDamage('item')).toBe(0);
    expect(calledShotDamage(undefined)).toBe(0);
  });

  /** Clicking this after seeing the total is deciding where you aimed. */
  it('is recorded as a choice, not a fact', () => {
    expect(calledShotMod('head')?.kind).toBe('choice');
  });

  it('ignores a name it does not know', () => {
    expect(calledShotMod('elbow')).toBeUndefined();
  });
});

/**
 * `"they may ignore up to 4 points of Range, Cover, Called Shot, Scale, or Speed
 * penalties; or add +2 to her roll"` — p152.
 */
describe('aim', () => {
  const range = rangeMod('long')!;
  const cover = coverMod(-2)!;

  it('does nothing when it is off', () => {
    expect(applyAim([range], 'off').mods).toEqual([range]);
  });

  it('can be taken as a flat bonus instead', () => {
    const result = applyAim([range], 'bonus');
    expect(result.mods.at(-1)?.value).toBe(AIM_BONUS);
    expect(result.mods.at(-1)?.label).toBe('Aim');
  });

  it('cancels four points of an eligible penalty', () => {
    const result = applyAim([range], 'cancel');
    expect(result.mods).toEqual([]);
    expect(result.spent).toEqual([{ key: 'range', label: 'Long range', points: 4 }]);
  });

  /** Four points against a −2 is worth 2. The rest has nothing to spend itself on. */
  it('does not bank what it cannot spend', () => {
    const result = applyAim([cover], 'cancel');
    expect(result.mods).toEqual([]);
    expect(result.unspent).toBe(2);
  });

  it('spends the largest penalty first', () => {
    const result = applyAim([cover, range], 'cancel');
    expect(result.spent).toEqual([{ key: 'range', label: 'Long range', points: 4 }]);
    expect(result.mods).toEqual([cover]);
  });

  it('leaves part of a penalty deeper than its budget', () => {
    const heavy = coverMod(-6)!;
    const result = applyAim([heavy], 'cancel');
    expect(result.mods).toEqual([{ ...heavy, value: -2 }]);
    expect(result.unspent).toBe(0);
  });

  /** Recoil, illumination, wounds and the hand-dialled number are all untouchable. */
  it('will not touch a category the book does not name', () => {
    const recoil = recoilFor(2)!;
    const result = applyAim([recoil], 'cancel');
    expect(result.mods).toEqual([recoil]);
    expect(result.spent).toEqual([]);
    expect(result.unspent).toBe(AIM_BUDGET);
  });

  it('never eats a bonus', () => {
    const drop: ShotMod = {
      key: 'drop',
      label: 'The Drop',
      value: 4,
      category: 'other',
      kind: 'fact',
      scope: 'shot',
    };
    expect(applyAim([drop], 'cancel').mods).toEqual([drop]);
  });

  /**
   * Reported rather than silently applied. Four points against a −4 called shot
   * and a −2 cover buys one of them and not the other, and which one is a choice
   * the player might want to make differently — so the panel has to be able to
   * say which it took.
   */
  it('says what it spent its points on', () => {
    const result = applyAim([coverMod(-2)!, calledShotMod('head')!], 'cancel');
    expect(result.spent).toEqual([{ key: 'called:head', label: 'Head or vitals', points: 4 }]);
    expect(result.mods.map((m) => m.label)).toEqual(['Light cover']);
    expect(result.unspent).toBe(0);
  });
});

describe('the one irreversible step', () => {
  it('locks only what decides how many dice are thrown', () => {
    expect(lockedByTheRoll('rof')).toBe(true);
    expect(lockedByTheRoll('burst')).toBe(true);
  });

  it('leaves every additive modifier live', () => {
    for (const key of ['range', 'cover', 'called:head', 'recoil', 'dial', 'aim', 'situation']) {
      expect(lockedByTheRoll(key)).toBe(false);
    }
  });
});

describe('a whole shot', () => {
  it('sums nothing for a point-blank shot with no complications', () => {
    expect(shotTotal({ rof: 1, aim: 'off', band: 'short' }).total).toBe(0);
  });

  it('adds up range, cover and a called shot', () => {
    const shot = shotTotal({ rof: 1, aim: 'off', band: 'medium', cover: -2, calledShot: 'head' });
    expect(shot.total).toBe(-8);
    expect(shot.mods.map((m) => m.label)).toEqual(['Medium range', 'Light cover', 'Head or vitals']);
  });

  it('brings in recoil from the declared rate of fire', () => {
    expect(shotTotal({ rof: 3, aim: 'off', band: 'short' }).total).toBe(RECOIL);
    expect(shotTotal({ rof: 1, aim: 'off', band: 'short' }).total).toBe(0);
    expect(shotTotal({ rof: 3, aim: 'off', band: 'short', steady: true }).total).toBe(0);
  });

  /**
   * The dial stands in for every rule the app does not know. Letting Aim cancel
   * it would cancel a penalty nobody could categorise.
   */
  it('does not let aim eat the hand-dialled number', () => {
    const shot = shotTotal({ rof: 1, aim: 'cancel', band: 'short', dial: -4 });
    expect(shot.total).toBe(-4);
    expect(shot.aim.unspent).toBe(AIM_BUDGET);
  });

  it('does not let aim eat the persistent track either', () => {
    const shot = shotTotal({
      rof: 1,
      aim: 'cancel',
      band: 'short',
      state: { conditions: ['pitch'] },
    });
    expect(shot.total).toBe(-6);
  });

  it('spends aim on range and cover together when both are shallow', () => {
    const shot = shotTotal({ rof: 1, aim: 'cancel', band: 'medium', cover: -2 });
    expect(shot.total).toBe(0);
    expect(shot.aim.spent).toHaveLength(2);
  });

  /** The whole of Damian's case: the roll is made, then someone remembers. */
  it('is the same shot before and after aim is remembered', () => {
    const before = shotTotal({ rof: 1, aim: 'off', band: 'long' });
    const after = shotTotal({ rof: 1, aim: 'cancel', band: 'long' });
    expect(before.total).toBe(-4);
    expect(after.total).toBe(0);
    expect(describeAmendment(before.mods, after.mods)).toBe('Long range dropped');
  });
});

describe('describing an amendment', () => {
  it('names what appeared', () => {
    expect(describeAmendment([], [coverMod(-2)!])).toBe('Light cover -2');
  });

  it('names what changed, and by how much', () => {
    expect(describeAmendment([coverMod(-2)!], [coverMod(-6)!])).toBe('Heavy cover -2 → -6');
  });

  it('names what went away', () => {
    expect(describeAmendment([rangeMod('long')!], [])).toBe('Long range dropped');
  });

  it('says nothing when nothing changed', () => {
    const mods = [rangeMod('long')!, coverMod(-2)!];
    expect(describeAmendment(mods, mods)).toBe('');
  });
});

/**
 * `"shotguns add +2 to the user's Shooting rolls and cause 3d6 damage at Short
 * Range, 2d6 at Medium, and 1d6 at Long."` — p161.
 */
describe('shotguns', () => {
  const options = ['1d6', '2d6', '3d6'];

  it('add two to the roll', () => {
    expect(shotgunMod(shotgun)?.value).toBe(SHOTGUN_BONUS);
  });

  it('give that bonus up when firing slugs', () => {
    expect(shotgunMod(shotgun, true)).toBeUndefined();
  });

  it('say nothing about a rifle', () => {
    expect(shotgunMod(peacemaker)).toBeUndefined();
  });

  /** Aim's budget must never be spent cancelling a bonus. */
  it('are not something aim can touch', () => {
    expect(AIMABLE).not.toContain(shotgunMod(shotgun)!.category);
  });

  it('do the most damage where the least of the shot has spread', () => {
    expect(shotgunDamage(options, 'short')).toBe('3d6');
    expect(shotgunDamage(options, 'medium')).toBe('2d6');
    expect(shotgunDamage(options, 'long')).toBe('1d6');
  });

  it('fall back to the closest band when the range is unknown', () => {
    expect(shotgunDamage(options, undefined)).toBe('3d6');
  });

  it('have nothing to offer a weapon that does not write a range of dice', () => {
    expect(shotgunDamage([], 'short')).toBeUndefined();
  });

  /** Never a silent undefined, which would read as "this gun does no damage". */
  it('answer for a band buckshot cannot reach rather than falling through', () => {
    expect(shotgunDamage(options, 'extreme')).toBe('1d6');
    expect(shotgunDamage(options, 'over')).toBe('1d6');
  });
});

/**
 * A Gatling is not a shotgun. `spraysLead` counts `rof >= 2` towards its own
 * broader question, which is right for bystanders and wrong for everything that
 * follows from the *spread* — slugs, damage by band, and Extreme Range.
 */
describe('telling buckshot from rapid fire', () => {
  it('knows a scattergun by its spread of damage dice', () => {
    expect(firesBuckshot(shotgun)).toBe(true);
    expect(firesBuckshot({ name: 'Winchester Lever-Action', damage: '1–3d6' })).toBe(true);
  });

  it('knows one by name even when the damage is written plainly', () => {
    expect(firesBuckshot({ name: 'Sawed-off scattergun', damage: '3d6' })).toBe(true);
  });

  it('does not mistake a rapid-firing weapon for one', () => {
    expect(firesBuckshot(gatling)).toBe(false);
    expect(firesBuckshot(peacemaker)).toBe(false);
  });

  /** Which is what keeps the slug selector and Extreme Range off a Gatling. */
  it('leaves a Gatling able to reach extreme range', () => {
    expect(reachesExtreme(gatling)).toBe(true);
    expect(reachesExtreme(shotgun)).toBe(false);
  });
});

/**
 * The number every other rule reads. Recoil and the stray window key off the
 * shots actually fired, and that is the count of bullets *declared*, not the
 * weapon's Rate of Fire — "you can always roll less dice" (p147).
 */
describe('how many dice a shot throws', () => {
  const bullets = (...pairs: [string, number][]): Map<string, number> => new Map(pairs);

  it('is one before anything has been declared, so a shot can be priced', () => {
    expect(shotsFired(3, bullets())).toBe(1);
    expect(recoilFor(shotsFired(3, bullets()))).toBeUndefined();
  });

  it('adds up the bullets rather than counting the targets', () => {
    expect(shotsFired(3, bullets(['a', 2]))).toBe(2);
    expect(shotsFired(3, bullets(['a', 2], ['b', 1]))).toBe(3);
    expect(shotsFired(3, bullets(['a', 1], ['b', 1]))).toBe(2);
  });

  /** A stale declaration must never throw more dice than the gun in hand allows. */
  it('never exceeds the weapon’s rate of fire', () => {
    expect(shotsFired(1, bullets(['a', 3]))).toBe(1);
    expect(maxRateOfFire(peacemaker)).toBe(1);
  });

  it('leaves bullets to spend until the ceiling is reached', () => {
    expect(bulletsLeft(3, bullets())).toBe(3);
    expect(bulletsLeft(3, bullets(['a', 2]))).toBe(1);
    expect(bulletsLeft(3, bullets(['a', 2], ['b', 1]))).toBe(0);
  });

  /** One target named from a three-shot weapon is one shot, and costs nothing. */
  it('takes no Recoil for one bullet from a three-shot weapon', () => {
    expect(recoilFor(shotsFired(3, bullets(['a', 1])))).toBeUndefined();
    expect(straysAsFired(gatling, shotsFired(3, bullets(['a', 1])))).toBe(false);
  });

  it('takes Recoil as soon as a second bullet is spoken for', () => {
    expect(recoilFor(shotsFired(3, bullets(['a', 2])))?.value).toBe(RECOIL);
    expect(straysAsFired(gatling, shotsFired(3, bullets(['a', 2])))).toBe(true);
  });

  it('prices the whole shot from the declared count', () => {
    expect(shotTotal({ rof: 2, aim: 'off', band: 'short' }).total).toBe(RECOIL);
    expect(shotTotal({ rof: 3, aim: 'off', band: 'medium' }).total).toBe(RECOIL - 2);
  });
});

/**
 * Which of two resolution paths a shot takes. One shot at one target can carry
 * its range and cover inside the rolled expression; anything else cannot, and
 * has them applied to each assigned shot afterwards.
 */
describe('whether the modifiers ride in the roll', () => {
  const bullets = (...pairs: [string, number][]): Map<string, number> => new Map(pairs);

  it('bakes one bullet at one target', () => {
    expect(bakesModifiers(3, bullets(['a', 1]))).toBe(true);
    expect(bakesModifiers(1, bullets(['a', 1]))).toBe(true);
  });

  /**
   * The subtle one. Two bullets into one man share a range but not a die: baking
   * would put the range inside both totals while the resolution still applies it
   * once to each, so the second would be resolved against a number it had already
   * paid. Simplifying this to "one target" reintroduces the double-count the
   * whole panel exists to have fixed.
   */
  it('does not bake two bullets at one target', () => {
    expect(bakesModifiers(3, bullets(['a', 2]))).toBe(false);
  });

  it('does not bake a shot spread over two targets', () => {
    expect(bakesModifiers(3, bullets(['a', 1], ['b', 1]))).toBe(false);
  });

  it('does not bake a shot nobody has declared', () => {
    expect(bakesModifiers(3, bullets())).toBe(false);
  });
});
