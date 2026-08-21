/**
 * One attack, from picking up the gun to the moment the dice land — and after.
 *
 * ## Why this is not `modifiers.ts`
 *
 * That module's own docstring drew the line and named this feature:
 *
 * > Cover (−2/−4/−6/−8), a prone target (which the book scores *as* Medium
 * > Cover), The Drop (+4), Gang Up, Range and Called Shots are all **excluded**,
 * > and that is not an oversight. They depend on the target of one particular
 * > attack… Those want a modifier box next to the attack, which is a different
 * > feature.
 *
 * This is that feature. The test there was **persistence** — does it stay true
 * across more than one roll by this character — and everything here fails it by
 * design. A shot's modifiers live exactly as long as the shot.
 *
 * ## The one irreversible step
 *
 * Everything on a shot is adjustable after the roll except the dice themselves.
 * That is the whole design, agreed with Paul: the Marshal reads the logged roll,
 * says "you aimed last round", and the player clicks Aim — the arithmetic changes
 * and the damage is rolled against the corrected number. Nothing re-rolls.
 *
 * So a modifier belongs here if it is **additive**, and belongs on the pre-roll
 * side if it decides **how many dice are thrown**:
 *
 *   - Rate of Fire, and the Edges that read as "increase RoF by 1" (Rapid Fire,
 *     Improved Rapid Fire), and Three-Round Burst's mode change. Locked at Roll.
 *   - Everything else — range, cover, Aim, Called Shots, the manual dial. Live.
 *
 * `lockedByTheRoll` names the first set, so the panel and the tests agree on
 * where the line falls rather than each having their own copy of it.
 *
 * ## Facts and choices
 *
 * A second distinction, which the app reports rather than enforces. Some
 * modifiers are **facts** about the world that were already true when the trigger
 * was pulled — the range, the cover, the lantern that had gone out, the Aim spent
 * on the previous turn. The panel could not have known them, so learning them
 * late is the app catching up, not the player revising.
 *
 * Others are **choices** the shooter made: a Called Shot to the head, a Wild
 * Attack. Clicking those after seeing a total of 11 is deciding where you aimed
 * once you know you had margin to spare.
 *
 * Both are adjustable — §8.1's test is *does the app commit an answer the player
 * cannot adjust?*, and it has no exceptions. But `ShotMod.kind` records which is
 * which so the log can mark a choice that changed after the roll, and the Marshal
 * can see it without reconstructing the sequence. A note, not a lock.
 */
import { situationalTotal, type ModifierState, type RollMod } from './modifiers.js';
import { BAND_PENALTY, SCOPE_AT_EXTREME, type Band } from './targeting.js';
import { isRollableDamage, type Weapon } from './gear.js';

/**
 * What kind of penalty this is, for Aim.
 *
 * Aim does not subtract a number — it *cancels* up to four points of specific
 * kinds, and the list in the book is exact: *"they may ignore up to 4 points of
 * Range, Cover, Called Shot, Scale, or Speed penalties; or add +2 to her roll"*
 * (p152). Recoil, Illumination, Multi-Action and Wound penalties are all absent
 * from that list, and Aim does nothing to them.
 *
 * This is the reason a shot cannot carry its modifiers as a single integer. A
 * summed −6 cannot say whether Aim may touch it.
 */
export type ModCategory =
  | 'range'
  | 'cover'
  | 'called-shot'
  | 'scale'
  | 'speed'
  /** Recoil, illumination, an unstable platform — everything Aim cannot help. */
  | 'other';

/** The categories Aim is allowed to spend its four points on. */
export const AIMABLE: readonly ModCategory[] = ['range', 'cover', 'called-shot', 'scale', 'speed'];

/** Whether this was true of the world, or chosen by the shooter. See the module docstring. */
export type ModKind = 'fact' | 'choice';

export interface ShotMod {
  key: string;
  label: string;
  value: number;
  category: ModCategory;
  kind: ModKind;
  /**
   * Whose row this sits on.
   *
   * `'shot'` is true of the whole attack — Aim, Recoil, the dial. `'target'` is
   * a property of one defender: **range**, which is the one that genuinely
   * cannot be shared, since one rolled expression cannot carry two different
   * range penalties. That is what `bakesModifiers` turns on.
   *
   * Cover used to be here too, and by the book still is — the water trough
   * belongs to whoever is behind it. The panel now asks for it once for the
   * whole shot anyway, because five sets of cover buttons down a target list
   * read as an instruction to fill all five in. See `ShotSession.cover`.
   */
  scope: 'shot' | 'target';
  note?: string;
}

// ---------------------------------------------------------------------------
// Rate of Fire, and the two rules that must read the *declared* number
// ---------------------------------------------------------------------------

/**
 * `"Rate of Fire is how many Shooting dice you roll when firing that weapon (per
 * action)… Unless the weapon says otherwise, you can always roll less dice."`
 * — p147.
 *
 * So the weapon's RoF is a ceiling, not a quantity, and the number that matters
 * to every other rule is the one the shooter *declared*. Gatlings are the stated
 * exception: they *"can't fire single shots and must fire their full Rate of
 * Fire"* (p150), which is left to the Marshal rather than enforced — the note is
 * on the weapon and a player who dials it down has said something deliberate.
 */
export function maxRateOfFire(weapon: Pick<Weapon, 'rof'> | undefined): number {
  return Math.max(1, weapon?.rof ?? 1);
}

/**
 * How many shots each target was declared to take.
 *
 * `"Before you roll, assign your dice to all possible targets. With a Rate of
 * Fire 3, for example, you might put 2 dice into one walkin' dead and a third
 * into another"` (p147) — so a declaration is a count per target rather than a
 * list of targets, and the sum of the counts is how many dice are thrown.
 *
 * A Map for its insertion order, which is the order the targets were named and
 * so the order they are shown in.
 */
export type Bullets = ReadonlyMap<string, number>;

/**
 * How many dice a shot throws: the declared bullets, added up.
 *
 * `"Unless the weapon says otherwise, you can always roll less dice"` (p147), so
 * declaring fewer bullets than the Rate of Fire allows is how a shooter says so —
 * and this, not the weapon's Rate of Fire, is the number Recoil and the
 * stray-shot window read.
 *
 * One when nothing has been declared, so a shot can be priced before it has been
 * aimed. Capped at the ceiling, so a stale declaration left over from a larger
 * weapon cannot throw more dice than the gun in hand allows.
 */
export function shotsFired(rof: number, bullets: Bullets): number {
  const declared = [...bullets.values()].reduce((sum, n) => sum + n, 0);
  return Math.max(1, Math.min(rof, declared));
}

/** Bullets not yet spoken for — what the per-target counter has left to give. */
export function bulletsLeft(rof: number, bullets: Bullets): number {
  return rof - [...bullets.values()].reduce((sum, n) => sum + n, 0);
}

/**
 * Whether this shot's per-target modifiers can ride inside the rolled expression.
 *
 * Only when there is exactly one shot at exactly one target. Then range and cover
 * are unambiguous and the log line can read `s8-2 … = 13`, which is what it does
 * today and worth keeping.
 *
 * **Two bullets into one man do not qualify**, even though they share a range.
 * They are two attacks with two dice, and baking would put the range inside both
 * totals while the resolution still wants to apply it once to each — so the
 * second would be resolved against a number it had already paid. Simplifying this
 * to "one target" would reintroduce the double-count this whole panel exists to
 * have fixed.
 */
export function bakesModifiers(rof: number, bullets: Bullets): boolean {
  return shotsFired(rof, bullets) === 1 && bullets.size === 1;
}

/** Recoil is a flat −2 (p161). */
export const RECOIL = -2;

/**
 * `"Unless it says otherwise in its description, firing at a Rate of Fire greater
 * than 1 in one action causes Recoil, a −2 penalty to the attacker's Shooting
 * rolls."` — p161.
 *
 * Reads the **declared** RoF, not the weapon's. A Gatling pistol fired one shot
 * at a time has no Recoil, which the book says outright: *"A Gatling pistol with
 * a Rate of Fire of 3, for example, causes Recoil unless its user fires only a
 * single shot."*
 *
 * Not cumulative between actions — but that is a turn-level fact about a
 * Multi-Action, and a shot cannot see the other shot. Left to the Marshal.
 */
export function recoilFor(declaredRof: number, negated = false): ShotMod | undefined {
  if (declaredRof < 2 || negated) return undefined;
  return {
    key: 'recoil',
    label: 'Recoil',
    value: RECOIL,
    category: 'other',
    kind: 'choice',
    scope: 'shot',
    note: `Firing ${declaredRof} shots in one action (p161). Aim does not reduce it.`,
  };
}

/**
 * Edges and mountings that cancel Recoil outright.
 *
 * `"Ignore the Recoil penalty when firing weapons with a RoF of 2 or higher"` —
 * the Rock and Roll! Edge, p47. Bipods and tripods do the same: *"may reduce the
 * Recoil penalty"* (p116).
 *
 * Matched against the character's Edge names and the weapon's notes, because a
 * tripod is written on the gun and an Edge is written on the sheet.
 */
const RECOIL_NEGATED = /\brock\s*(?:and|&|'?n'?)\s*roll\b|\bbipod\b|\btripod\b/i;

export function negatesRecoil(edgeNames: readonly string[], weaponNotes?: string): boolean {
  return (
    edgeNames.some((name) => RECOIL_NEGATED.test(name)) || RECOIL_NEGATED.test(weaponNotes ?? '')
  );
}

/**
 * Whether this weapon throws buckshot rather than a bullet.
 *
 * `spraysLead` answers a broader question — does this put more lead in the air
 * than it aims — and counts `rof >= 2` towards it, which is right for bystanders
 * but wrong for everything that follows from the *spread*. A Gatling is not a
 * shotgun: it cannot be loaded with slugs, its damage does not fall off by band,
 * and it may be fired at Extreme Range.
 *
 * Two signals, and neither is the Rate of Fire. Damage written as a die *range*
 * — `1–3d6` — is the scattergun's signature in both books, because the number of
 * dice depends on how far the shot has spread. The rest is the name.
 */
export function firesBuckshot(weapon: Pick<Weapon, 'name' | 'damage'>): boolean {
  if (weapon.damage && !isRollableDamage(weapon.damage)) return true;
  return /shotgun|scatter\s?gun|buckshot|blunderbuss/i.test(weapon.name);
}

/**
 * The stray-shot window for a shot *as fired*.
 *
 * `bystanders.ts` reads RoF off the weapon, which was right when nothing could
 * declare a different one. It no longer is: a Gatling fired at RoF 1 puts one
 * bullet in the air and should stray on a 1, not on a 1–2. The book scopes the
 * wide window to weapons that *"spray bullets or buckshot"* (p158) and to the
 * fire actually taken — Recoil is worded the same way, from the same number.
 *
 * Buckshot is a property of the gun and stays wide at any RoF. Slugs go the other
 * way: *"Innocent Bystanders are hit only on a 1 (instead of 1 or 2)"* (p161),
 * which is a choice of ammunition and so is the caller's to pass.
 */
export function straysAsFired(
  weapon: Pick<Weapon, 'name' | 'damage' | 'rof' | 'notes'>,
  declaredRof: number,
  slugs = false,
): boolean {
  if (slugs) return false;
  if (declaredRof >= 2) return true;
  // What is left once the declaration has superseded RoF: buckshot, whose spread
  // is wide because of what comes out of the barrel rather than how much of it.
  // `spraysLead` also matches "gatling" by name, and that is deliberately *not*
  // carried over — a Gatling's window is wide because of the number of bullets in
  // the air, which is exactly the thing the declared RoF now states. Reading it
  // off the name as well would put the old bug back under a different signal.
  return firesBuckshot(weapon);
}

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

/**
 * Whether this weapon may reach Extreme Range.
 *
 * `"Shotguns may not be fired at Extreme Range"` (p161) and *"Characters may not
 * throw weapons at Extreme Range"* (p146). Slugs put a shotgun back in — *"they
 * may be fired at Extreme Range"* — which is why it is a parameter here rather
 * than read off the gun.
 *
 * Thrown weapons are recognised by a Strength-based damage line on something that
 * has a range at all, which is how the book writes a knife, a tomahawk or a
 * bottle: `Range 3/6/12, Damage Str+d4`. A gun's damage never scales with the
 * arm holding it.
 */
export function reachesExtreme(
  weapon: Pick<Weapon, 'name' | 'damage' | 'notes'>,
  slugs = false,
): boolean {
  if (slugs) return true;
  if (firesBuckshot(weapon)) return false;
  return !/^\s*str/i.test(weapon.damage ?? '');
}

/**
 * The range penalty for one target, as a modifier rather than a bare number.
 *
 * Categorised `range`, which is what lets Aim eat it. A scope rides alongside at
 * Extreme rather than changing the band's own number — see `SCOPE_AT_EXTREME`.
 */
export function rangeMod(band: Band, scoped = false): ShotMod | undefined {
  if (band === 'over') return undefined;
  const penalty = BAND_PENALTY[band];
  if (!penalty) return undefined;
  const bonus = band === 'extreme' && scoped ? SCOPE_AT_EXTREME : 0;
  return {
    key: 'range',
    label: band === 'extreme' ? (scoped ? 'Extreme range, scoped' : 'Extreme range') : `${band[0]!.toUpperCase()}${band.slice(1)} range`,
    value: penalty + bonus,
    category: 'range',
    kind: 'fact',
    scope: 'target',
    ...(band === 'extreme'
      ? { note: 'Extreme Range requires the shooter to have spent their last turn Aiming (p146).' }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Shotguns
// ---------------------------------------------------------------------------

/**
 * `"shotguns add +2 to the user's Shooting rolls and cause 3d6 damage at Short
 * Range, 2d6 at Medium, and 1d6 at Long."` — p161.
 *
 * Not with slugs: *"The attacker doesn't get the +2 shotgun bonus to their
 * Shooting roll, but the damage is 2d10 regardless of Range."*
 *
 * Categorised `other`, so Aim cannot spend its budget cancelling a bonus — which
 * `applyAim` refuses anyway, but a bonus filed under `range` would be a trap for
 * whoever next changes that function.
 */
export const SHOTGUN_BONUS = 2;

export function shotgunMod(
  weapon: Pick<Weapon, 'name' | 'damage'>,
  slugs = false,
): ShotMod | undefined {
  if (slugs || reachesExtreme(weapon, false)) return undefined;
  return {
    key: 'shotgun',
    label: 'Shotgun',
    value: SHOTGUN_BONUS,
    category: 'other',
    kind: 'fact',
    scope: 'shot',
    note: 'A spread of shot is easier to land: +2 to Shooting (p161).',
  };
}

/** Damage with slugs, at any range. */
export const SLUG_DAMAGE = '2d10';

/**
 * Which of a scattergun's dice counts apply at this range.
 *
 * `damageDiceOptions` turns `1–3d6` into `['1d6', '2d6', '3d6']` — fewest first,
 * because that is how the range is written. The bands run the other way: the most
 * dice at Short, where the least of the shot has spread.
 *
 * Extreme never arrives here — a shotgun firing buckshot cannot reach it, which
 * is `reachesExtreme`'s business — but it is answered rather than left to fall
 * through, since a silent `undefined` would read as "this gun does no damage".
 */
export function shotgunDamage(options: readonly string[], band: Band | undefined): string | undefined {
  if (!options.length) return undefined;
  const byBand: Partial<Record<Band, number>> = {
    short: options.length - 1,
    medium: options.length - 2,
    long: options.length - 3,
    extreme: 0,
    over: 0,
  };
  const index = band === undefined ? options.length - 1 : byBand[band];
  return options[Math.max(0, Math.min(options.length - 1, index ?? options.length - 1))];
}

// ---------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------

/**
 * `"Melee and ranged attacks suffer a penalty when attempting to hit a target
 * behind Cover"` — p154.
 *
 * Per target, always: the shot is one thing but the water trough is not.
 */
export const COVER: readonly { value: number; label: string; note: string }[] = [
  { value: 0, label: 'None', note: 'In the open' },
  { value: -2, label: 'Light', note: 'A quarter of the target is obscured' },
  { value: -4, label: 'Medium', note: 'Half the target is obscured' },
  { value: -6, label: 'Heavy', note: 'Three quarters of the target is obscured' },
  { value: -8, label: 'Near total', note: 'Only a small part of the target is exposed' },
];

export function coverMod(value: number): ShotMod | undefined {
  if (!value) return undefined;
  const found = COVER.find((c) => c.value === value);
  return {
    key: 'cover',
    label: `${found?.label ?? 'Cover'} cover`,
    value,
    category: 'cover',
    kind: 'fact',
    // Declared once for the shot, not per defender — see `ShotMod.scope`.
    scope: 'shot',
    ...(found ? { note: found.note } : {}),
  };
}

// ---------------------------------------------------------------------------
// Called Shots
// ---------------------------------------------------------------------------

/**
 * How big the thing you are shooting at is, and what that costs — p161's Scale
 * Modifiers table.
 *
 * This is the whole of the called-shot penalty, which is the part that was
 * missing: `"Use the Scale of the target when making called shots against
 * creatures, not their Scale. If a hero wants to blast the eye out of a Huge
 * terrantula, for example, use the Scale of the eye, not the critter. If the eye
 * is about the size of a wagon wheel, the hero adds +0 to their roll because it's
 * Normal Scale, a +0 bonus."*
 *
 * So −4 for a head was never a rule about heads. It is the Very Small row, and it
 * is right only because the head in question was on a person. A called shot at
 * something the size of a wagon wheel is free, and one at an armour joint is −6.
 *
 * The examples are the book's, and are the point: nobody can rank "very small"
 * against "small" from the words, and everybody can rank a house cat against a
 * bobcat.
 *
 * This is the whole of the called-shot control now. See `calledShotMod`.
 */
export const SCALES: readonly { value: number; label: string; examples: string }[] = [
  { value: -6, label: 'Tiny', examples: 'Armour joint, baseball, mouse' },
  { value: -4, label: 'Very Small', examples: 'Human hand or head, basketball, house cat' },
  { value: -2, label: 'Small', examples: 'Human limb, bobcat' },
  { value: 0, label: 'Normal', examples: 'Human, motorcycle, bull, horse' },
  { value: 2, label: 'Large', examples: 'Hippo, most vehicles' },
  { value: 4, label: 'Huge', examples: 'Terrantula, whale' },
  { value: 6, label: 'Gargantuan', examples: 'Building, old rattler, ship' },
];

/**
 * !! The **other** Scale rule is not implemented. p161: *"When creatures of
 * different Scales attack each other, the smaller creature adds the difference
 * between its Scale and its target to its attacks"* — a Tiny spirit hurling a
 * bolt at a Huge terrantula adds +10. That needs a Size on both ends and `Sheet`
 * records none, so it is the hand dial for now. !!
 */

/**
 * A called shot: the penalty **is** the Scale of what you are aiming at.
 *
 * There is no list of body parts here any more, and that is the rule rather than
 * a simplification. Every figure the old list carried was a row of `SCALES` read
 * off a human — head and hand Very Small (−4), a limb Small (−2), a pistol-sized
 * item Very Small — which is right only for as long as the target is a person.
 * p161 says what to do instead: use the Scale of the thing, whatever it is on.
 *
 * `undefined` means no called shot. **Zero does not**: a called shot at something
 * Normal-sized costs nothing and is still a called shot — the book's own example
 * is blowing the eye out of a Huge terrantula when the eye is the size of a wagon
 * wheel. Every test of this has to be `!== undefined`.
 */
export function calledShotMod(scale: number | undefined): ShotMod | undefined {
  if (scale === undefined) return undefined;
  const named = SCALES.find((s) => s.value === scale);
  return {
    // Stable across a change of size, so `describeAmendment` reads a re-sized
    // called shot as "Called shot -4 → 0" rather than as one gone and one new.
    key: 'called',
    label: named ? `Called shot (${named.label})` : 'Called shot',
    value: scale,
    category: 'called-shot',
    kind: 'choice',
    scope: 'shot',
    note: named
      ? `${named.label} Scale — ${named.examples}. Use the Scale of the part you are ` +
        `aiming at, not of the creature it is on (p161).`
      : 'Use the Scale of the part you are aiming at, not of the creature (p161).',
  };
}

/**
 * `"Hitting the head or vital organs of living creatures adds +4 damage"` — p154.
 *
 * Deliberately **not** derived from the size. A rattler's head is Gargantuan and
 * a man's is Very Small, and both are vitals; how big the thing is and whether it
 * is a vital spot are two different questions, which is why the panel asks them
 * separately. Living creatures only — the Marshal's call, as ever.
 *
 * A head shot against an open-faced helmet is −5 rather than −4 and bypasses its
 * armour (p154). Not modelled: it is one point and a Marshal's judgement about
 * headgear, which is what the hand dial is for.
 */
export const VITALS_DAMAGE = 4;

export function calledShotDamage(vitals: boolean): number {
  return vitals ? VITALS_DAMAGE : 0;
}

// ---------------------------------------------------------------------------
// Aim
// ---------------------------------------------------------------------------

export type Aim = 'off' | 'cancel' | 'bonus';

/** What Aim is worth when taken as a flat bonus instead. */
export const AIM_BONUS = 2;
/** How many points of eligible penalty Aim can cancel instead. */
export const AIM_BUDGET = 4;

export interface AimResult {
  /** The modifiers as they now stand, with cancelled ones reduced or removed. */
  mods: ShotMod[];
  /** What the four points were spent on, so the panel can say. */
  spent: { key: string; label: string; points: number }[];
  /** Points of budget left unspent — there was less eligible penalty than 4. */
  unspent: number;
}

/**
 * `"If a character spends their entire turn Aiming a ranged weapon at a
 * particular target and takes no other actions, on their next turn they may
 * ignore up to 4 points of Range, Cover, Called Shot, Scale, or Speed penalties;
 * or add +2 to her roll."` — p152.
 *
 * Two things this must not get wrong.
 *
 * **It cancels, it does not add.** Four points against a −2 cover penalty is
 * worth 2, not 4 — the other two points have nothing to spend themselves on and
 * are lost. `unspent` reports that rather than quietly banking it.
 *
 * **It only touches the named categories.** Recoil, Illumination, Multi-Action
 * and Wounds are untouched no matter how much budget is left. This is why a shot
 * carries categorised modifiers instead of a summed integer.
 *
 * Spent largest-first, which maximises the cancellation and is what a player
 * would do anyway. It is *reported* rather than silently applied: with `range −4`
 * and `cover −2` the four points could go either way, and a player who wants them
 * elsewhere can dial the difference. Committing an answer nobody can see is the
 * failure mode §8.1 names.
 */
export function applyAim(mods: readonly ShotMod[], aim: Aim): AimResult {
  if (aim === 'off') return { mods: [...mods], spent: [], unspent: 0 };

  if (aim === 'bonus') {
    return {
      mods: [
        ...mods,
        {
          key: 'aim',
          label: 'Aim',
          value: AIM_BONUS,
          category: 'other',
          kind: 'fact',
          scope: 'shot',
          note: 'Spent the whole of last turn aiming, taken as a flat bonus (p152).',
        },
      ],
      spent: [],
      unspent: 0,
    };
  }

  let budget = AIM_BUDGET;
  const spent: AimResult['spent'] = [];
  // Largest penalty first, so the four points buy as much as they can.
  const order = [...mods]
    .map((mod, index) => ({ mod, index }))
    .sort((a, b) => a.mod.value - b.mod.value);
  const cancelled = new Map<number, number>();

  for (const { mod, index } of order) {
    if (budget <= 0) break;
    if (mod.value >= 0 || !AIMABLE.includes(mod.category)) continue;
    const points = Math.min(budget, -mod.value);
    budget -= points;
    cancelled.set(index, points);
    spent.push({ key: mod.key, label: mod.label, points });
  }

  const next = mods.map((mod, index) => {
    const points = cancelled.get(index);
    return points === undefined ? mod : { ...mod, value: mod.value + points };
  });
  // A penalty Aim wholly cancelled is gone rather than shown as zero: a row of
  // "0" pills reads as modifiers that did nothing, not as ones that were paid for.
  //
  // Only the ones Aim *paid for*, though. A called shot at a Normal-scale target
  // is legitimately +0 — p161's wagon-wheel eye — and it has to stay on the list
  // whether or not the shooter aimed, or the log would stop recording that a
  // called shot was declared at all the moment somebody spent a turn aiming.
  return {
    mods: next.filter((mod, index) => mod.value !== 0 || !cancelled.has(index)),
    spent,
    unspent: budget,
  };
}

// ---------------------------------------------------------------------------
// Putting a shot together
// ---------------------------------------------------------------------------

/**
 * Whether this modifier is fixed at the moment the dice are thrown.
 *
 * The single hard commit point in the whole sequence. Anything that decides *how
 * many dice* cannot be revisited afterwards, because revisiting it would mean
 * re-rolling — and the design's one promise is that the arithmetic changes and
 * the dice never do.
 */
export function lockedByTheRoll(key: string): boolean {
  return key === 'rof' || key === 'burst';
}

export interface ShotRequest {
  /** How many Shooting dice, already chosen — the ceiling is the weapon's. */
  rof: number;
  aim: Aim;
  /**
   * A called shot, as the Scale of what is being aimed at — p161, `SCALES`.
   *
   * `undefined` is no called shot. Zero *is* one: a called shot at something
   * Normal-sized costs nothing and is still a called shot.
   */
  scale?: number | undefined;
  /** Per-target, and so only meaningful once a target is named. */
  band?: Band | undefined;
  cover?: number | undefined;
  scoped?: boolean | undefined;
  /** The manual dial, for everything the app will never know. */
  dial?: number | undefined;
  /** Whether Rock and Roll!, a bipod or a tripod cancels Recoil. */
  steady?: boolean | undefined;
  /**
   * The persistent track from the token: darkness, Running, an unstable platform.
   *
   * !! Leave this out if the caller already holds a `RollBreakdown`. That carries
   * the same numbers — `rollBreakdown` sums `situationalMods` itself — and
   * passing both counts every condition twice. It is here for a caller that has
   * a token state and nothing else. !!
   */
  state?: ModifierState | undefined;
}

export interface ShotTotal {
  mods: ShotMod[];
  total: number;
  aim: AimResult;
}

/**
 * Every modifier on one shot at one target, and what they come to.
 *
 * Order matters and is deliberate: the situational track and the per-target facts
 * are assembled first, Aim is applied to that assembly, and only then is the
 * manual dial added. The dial must not be aimable — it stands in for rules the
 * app does not know, and letting Aim eat a Marshal's hand-dialled −4 would cancel
 * a penalty nobody could categorise.
 */
export function shotTotal(request: ShotRequest): ShotTotal {
  const base: ShotMod[] = [];

  const range = request.band ? rangeMod(request.band, request.scoped) : undefined;
  if (range) base.push(range);

  const cover = coverMod(request.cover ?? 0);
  if (cover) base.push(cover);

  const called = calledShotMod(request.scale);
  if (called) base.push(called);

  const recoil = recoilFor(request.rof, request.steady ?? false);
  if (recoil) base.push(recoil);

  const aim = applyAim(base, request.aim);
  const mods = [...aim.mods];

  // The persistent track — wounds, fatigue, the dark, an unstable platform —
  // arrives already summed and already filtered to `affects: 'self'`. It is not
  // aimable and is added after: Aim's list names Range, Cover, Called Shot, Scale
  // and Speed, and Illumination is conspicuously not among them.
  const persistent = situationalTotal(request.state);
  if (persistent) {
    mods.push({
      key: 'situation',
      label: 'Situation',
      value: persistent,
      category: 'other',
      kind: 'fact',
      scope: 'shot',
      note: 'From the token: wounds, fatigue and whatever the Marshal has dialled in there.',
    });
  }

  if (request.dial) {
    mods.push({
      key: 'dial',
      label: 'Modifier',
      value: request.dial,
      category: 'other',
      kind: 'choice',
      scope: 'shot',
      note: 'Dialled by hand — Aim does not reduce it.',
    });
  }

  return { mods, total: mods.reduce((sum, mod) => sum + mod.value, 0), aim };
}

/** The shot's modifiers as the roll log wants them, for the pills on the line. */
export function asRollMods(mods: readonly ShotMod[]): RollMod[] {
  return mods.map((mod) => ({
    label: mod.label,
    value: mod.value,
    kind: 'situational' as const,
    short: `${mod.value > 0 ? '+' : ''}${mod.value}`,
  }));
}

/**
 * What changed between two versions of the same shot, for an amendment line.
 *
 * Returns the modifiers that were added, removed or retuned — not a diff of the
 * totals, which would say "+2" without saying what for. A Marshal reading "you
 * aimed last round" back off the log wants to see the word Aim.
 */
export function describeAmendment(before: readonly ShotMod[], after: readonly ShotMod[]): string {
  const was = new Map(before.map((mod) => [mod.key, mod]));
  const now = new Map(after.map((mod) => [mod.key, mod]));
  const parts: string[] = [];

  for (const [key, mod] of now) {
    const old = was.get(key);
    if (!old) parts.push(`${mod.label} ${signed(mod.value)}`);
    else if (old.value !== mod.value) parts.push(`${mod.label} ${signed(old.value)} → ${signed(mod.value)}`);
  }
  for (const [key, mod] of was) {
    if (!now.has(key)) parts.push(`${mod.label} dropped`);
  }
  return parts.join(', ');
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
