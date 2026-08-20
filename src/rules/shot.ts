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
   * `'shot'` is true of the whole attack — Aim, Recoil, the dial. `'target'`
   * differs per defender, which is why cover cannot live on the shot row: with
   * RoF 3 into three targets, one shared control cannot say that the first is
   * behind a water trough and the second is standing in the open.
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
  if (weapon.damage && !isRollableDamage(weapon.damage)) return true;
  return /shotgun|scatter\s?gun|buckshot|blunderbuss/i.test(weapon.name);
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
  if (/shotgun|scatter\s?gun|buckshot|blunderbuss/i.test(weapon.name)) return false;
  // A die *range* for damage — `1–3d6` — is buckshot under another name, and the
  // signature of every scattergun in the book that is not called one.
  if (weapon.damage && !isRollableDamage(weapon.damage)) return false;
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
    scope: 'target',
    ...(found ? { note: found.note } : {}),
  };
}

// ---------------------------------------------------------------------------
// Called Shots
// ---------------------------------------------------------------------------

export interface CalledShot {
  key: string;
  label: string;
  /** The penalty to hit. */
  value: number;
  /** Extra damage this earns on a hit, which must survive into the damage roll. */
  damage?: number;
  note: string;
}

/**
 * `"Targeting a particular part of the body is a Called Shot."` — p154.
 *
 * The penalties in parentheses there are for Normal-scale creatures, which is
 * every bandit and walkin' dead in Coffin Rock. Anything of a different Scale
 * changes them, and Scale is not implemented — so the manual dial stands in, and
 * `category: 'scale'` exists for when it is.
 *
 * Head or vitals is the one that matters twice: −4 to hit **and +4 damage**, so
 * it has to survive the roll and reach the damage. That is most of the reason the
 * shot panel holds state across roll → damage → apply rather than publishing and
 * forgetting.
 */
export const CALLED_SHOTS: readonly CalledShot[] = [
  {
    key: 'head',
    label: 'Head or vitals',
    value: -4,
    damage: 4,
    note: 'Adds +4 damage to the attacker’s total (p154). −5 against an open-faced helmet, bypassing its armour.',
  },
  {
    key: 'limb',
    label: 'Hand',
    value: -4,
    note: 'The target may be Disarmed (p155).',
  },
  {
    key: 'item',
    label: 'Item',
    value: -4,
    note: 'Something the size of a pistol. A 3′ rifle is only −2 — use the dial (p154).',
  },
];

export function calledShotMod(key: string | undefined): ShotMod | undefined {
  const shot = CALLED_SHOTS.find((c) => c.key === key);
  if (!shot) return undefined;
  return {
    key: `called:${shot.key}`,
    label: shot.label,
    value: shot.value,
    category: 'called-shot',
    kind: 'choice',
    scope: 'shot',
    note: shot.note,
  };
}

/** The bonus damage a called shot earns, for the damage roll that follows. */
export function calledShotDamage(key: string | undefined): number {
  return CALLED_SHOTS.find((c) => c.key === key)?.damage ?? 0;
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
  return { mods: next.filter((mod) => mod.value !== 0), spent, unspent: budget };
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
  calledShot?: string | undefined;
  /** Per-target, and so only meaningful once a target is named. */
  band?: Band | undefined;
  cover?: number | undefined;
  scoped?: boolean | undefined;
  /** The manual dial, for everything the app will never know. */
  dial?: number | undefined;
  /** Whether Rock and Roll!, a bipod or a tripod cancels Recoil. */
  steady?: boolean | undefined;
  /** The persistent track from the token: wounds, fatigue, darkness, Running. */
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

  const called = calledShotMod(request.calledShot);
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
