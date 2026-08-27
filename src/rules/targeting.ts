/**
 * Resolving a roll against the things it could have been aimed at.
 *
 * The panel used to annotate an attack with "(success; **1** raise)" worked out
 * against a target number of 4, which the dice engine supplies for every `s`/`e`
 * roll. For a Fighting roll that is simply wrong — the number to beat is the
 * target's Parry — and it was reported from the table as exactly that: a raise
 * claimed without anyone knowing the Parry. The answer is not to guess better but
 * to name the target, and since a fight has several possible targets, to show all
 * of them at once and let the reader pick the row.
 *
 * ## What is public
 *
 * Parry, Toughness and Pace only. Those are numbers the table is doing arithmetic
 * against all evening anyway, so keeping them secret costs more than it protects.
 * Everything else about a Marshal's character stays on the Marshal's screen — so
 * nothing here takes a whole `Sheet` into its output, and callers must not put one
 * into a broadcast roll entry.
 *
 * ## Range
 *
 * Measured in **grid cells**, which is what `OBR.scene.grid.getDistance` returns
 * — established by probe, round 3. It is hex- and grid-aware, so no geometry
 * happens here; the distance arrives already counted. A scene's scale multiplier
 * is a label ("12m") and never enters the arithmetic.
 */

/** Short, medium, long — as a weapon writes them, e.g. `12/24/48`. */
export type RangeBands = [short: number, medium: number, long: number];

export type Band = 'short' | 'medium' | 'long' | 'extreme' | 'over';

/**
 * The penalty for shooting at each band.
 *
 * Short, medium and long are from the Weird West core rules, p146. Extreme is
 * from the same table, and was missing until now — see `EXTREME_MULTIPLE`.
 */
export const BAND_PENALTY: Record<Band, number> = {
  short: 0,
  medium: -2,
  long: -4,
  extreme: -8,
  // Beyond *extreme* is not a penalty but a refusal: the shot cannot be taken,
  // and a number here would imply it could.
  over: Number.NaN,
};

/**
 * How far past long range a weapon can still reach: `"up to 4× its Long Range"`
 * (p114, and the range table on p146).
 *
 * This band did not exist here until Paul asked for the shot panel, and its
 * absence was a live bug rather than a gap: `over` was modelled as a refusal, so
 * a rifleman with a `24/48/96` Winchester was told a shot at 120 cells could not
 * be taken when the book says it can, at −8.
 */
export const EXTREME_MULTIPLE = 4;

/**
 * What a scope is worth at Extreme Range: the penalty is *"−8, or −6 with a
 * scope"* (p146).
 *
 * Expressed as the difference rather than as the resulting number, so it can ride
 * as an ordinary `range`-category modifier on top of `BAND_PENALTY.extreme`
 * instead of being a second way to compute the same figure. −8 + 2 = −6, and Aim
 * then eats it in the same pass as everything else in its category.
 */
export const SCOPE_AT_EXTREME = 2;

/**
 * Whether a weapon can reach Extreme Range at all.
 *
 * Two exceptions in the book, and both are refusals rather than penalties:
 * *"Shotguns may not be fired at Extreme Range"* (p161) and *"Characters may not
 * throw weapons at Extreme Range"* (p146). A shotgun firing **slugs** may — which
 * is a choice the shooter makes rather than a property of the gun, so it is the
 * caller's to pass, not something read off a weapon here.
 */
export interface BandOptions {
  /**
   * Whether this shot may reach Extreme Range.
   *
   * Defaults to **false**, so a caller that has not thought about it keeps the
   * behaviour it had before this band existed: past long is out of range. The
   * shot panel opts in; the skills list, which does not know what weapon is in
   * anyone's hand, does not.
   */
  extreme?: boolean;
}

/** `"12/24/48"` → `[12, 24, 48]`, or nothing if the line does not say. */
export function parseRangeBands(range: string | undefined): RangeBands | undefined {
  if (!range) return undefined;
  const parts = range.split('/').map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return undefined;
  return parts as RangeBands;
}

/**
 * Which band a distance falls in.
 *
 * Inclusive at each boundary: a weapon with `Range 12/24/48` still reaches at
 * exactly 12, which is how a range is written on a card.
 *
 * Extreme is opt-in rather than automatic. It is not simply a further band — it
 * requires the shooter to have spent the previous turn Aiming, which nothing
 * here can know, and it is barred outright to shotguns and thrown weapons. So a
 * caller has to say that this shot could reach it. See `BandOptions`.
 */
export function bandFor(cells: number, bands: RangeBands, options: BandOptions = {}): Band {
  const [short, medium, long] = bands;
  if (cells <= short) return 'short';
  if (cells <= medium) return 'medium';
  if (cells <= long) return 'long';
  if (options.extreme && cells <= long * EXTREME_MULTIPLE) return 'extreme';
  return 'over';
}

export interface TargetStats {
  /** Melee attacks are resolved against this. Absent falls back to the default 2. */
  parry?: number;
  toughness?: number;
  armor?: number;
  wildCard: boolean;
}

/** SWADE's floor for an unstated Parry and Toughness. */
export const DEFAULT_PARRY = 2;
export const DEFAULT_TOUGHNESS = 4;

/**
 * What a roll beats when nothing is defending against it.
 *
 * The same 4 the dice engine assumes for every `s`/`e` roll — but reached
 * deliberately here, for a shot that is not into melee, rather than because it
 * was the only number available.
 */
export const FLAT_TARGET = 4;

export interface AttackOutcome {
  /** What the roll had to beat. */
  target: number;
  hit: boolean;
  /** Raises over the target, 0 when it merely hit. */
  raises: number;
}

/**
 * Whether a rolled total hits, and by how much.
 *
 * The target number is the defender's Parry for an attack that is resolved
 * against it, and 4 otherwise — which is the same 4 the dice engine assumes, but
 * arrived at deliberately rather than because nothing else was available.
 */
export function resolveAttack(total: number, target: number, raiseStep = 4): AttackOutcome {
  const margin = total - target;
  if (margin < 0) return { target, hit: false, raises: 0 };
  return { target, hit: true, raises: Math.trunc(margin / raiseStep) };
}

export interface AimedAttack extends AttackOutcome {
  /** The rolled total after range and the target's own conditions. */
  effective: number;
  outOfRange: boolean;
}

/**
 * One attack against one target, with everything that is per-target folded in.
 *
 * These modifiers cannot ride on the roll itself, because they are not properties
 * of the roller: range and the defender's condition differ for every target the
 * same die could have been aimed at. So the roll is made once and resolved here
 * once per candidate.
 *
 * Both directions land on the attacker's total rather than on the target number.
 * That is arithmetically the same for whether it *hits*, and deliberately the
 * same for *raises* too, which are counted off the margin — a Vulnerable target
 * at short range is easier to hit well, not merely easier to hit.
 *
 * Past the last band the weapon can reach, the shot is not taken at all. That is
 * not a penalty and must not be modelled as one: a big enough bonus would
 * otherwise let someone hit a target the weapon cannot reach. Which band that is
 * depends on the shot rather than the distance — see `bandFor` and `BandOptions`
 * — so `over` arrives here already decided.
 */
export function resolveAimedAttack({
  total,
  target,
  band,
  targetBonus = 0,
}: {
  total: number;
  target: number;
  band?: Band;
  targetBonus?: number;
}): AimedAttack {
  if (band === 'over') {
    return { target, hit: false, raises: 0, effective: total, outOfRange: true };
  }
  const bandPenalty = band ? BAND_PENALTY[band] : 0;
  const effective = total + targetBonus + bandPenalty;
  return { ...resolveAttack(effective, target), effective, outOfRange: false };
}

/**
 * Skills resolved against a target's Parry rather than against a flat 4.
 *
 * Fighting always. Shooting and Throwing only when the shot is into melee, which
 * nothing here can know — so they are listed and the reader decides, which is the
 * same judgement the Marshal was making before any of this existed.
 *
 * !! Opposed Tests — Taunt, Intimidate and the rest — are resolved against
 * Smarts or Spirit and are NOT handled. Adding them needs the book. !!
 */
const PARRY_SKILLS = /^(fighting)\b/i;
const MAYBE_PARRY_SKILLS = /^(shooting|throwing|athletics)\b/i;

export function attackKind(skill: string): 'parry' | 'maybe-parry' | 'flat' {
  if (PARRY_SKILLS.test(skill.trim())) return 'parry';
  if (MAYBE_PARRY_SKILLS.test(skill.trim())) return 'maybe-parry';
  return 'flat';
}

/** Whether naming targets would tell the reader anything for this skill. */
export function isTargeted(skill: string | undefined): boolean {
  return skill !== undefined && attackKind(skill) !== 'flat';
}

/**
 * How close a shot has to be before it counts as fired *into melee*.
 *
 * ## The rule
 *
 * p160, *Ranged Weapons in Melee*: `"The TN is the defender's Parry instead of
 * Short Range as they struggle, wrestle back and forth, etc."` The same
 * paragraph bars long arms — a pistol or a power only — and makes an attacker
 * who shoots at a *non*-adjacent target while engaged instantly Vulnerable.
 * Neither of those is enforced: `Weapon` records no handedness, and Vulnerable
 * is a condition on the shooter that no code on this path can set. Both are said
 * in the tooltip, where the Marshal can act on them.
 *
 * ## Why a distance decides it
 *
 * Being *engaged* is not the same as being close, and the book never gives a
 * number for it — this is the app's cue, not a rule. It used to be a question
 * the panel asked and never answered on its own; Paul's call is that it should
 * answer, and the shot panel now assumes melee inside this radius and lets the
 * row say otherwise with a click.
 *
 * So this constant is **load-bearing for the arithmetic**, not only for the
 * screen. It was originally a privacy line — how close before this table may
 * print a Parry at all — and it is still that, deliberately the same number, so
 * that the case where the TN reveals a Parry is exactly the case where showing
 * one is already sanctioned. Retuning it moves a rule as well as a screen.
 *
 * ## Why 1.5, and not the 2 it started at
 *
 * Two was too wide, reported from the table on 2026-08-26: a pair of tokens with
 * a clear cell between them were being resolved against Parry. The reason is that
 * the comparison is against the *raw* distance while the row prints a rounded
 * one, so everything from 1.01 to 1.99 showed as "Dist 2" and was treated as
 * melee — Damian's own guess, and it was right.
 *
 * 1.5 is chosen to sit in the gap the square grid leaves: an orthogonal
 * neighbour is 1, a diagonal one is √2 ≈ 1.414, and the next ring out starts at
 * 2. So every token actually touching another is inside it and nothing else is,
 * which is as close to "adjacent" as a single radius can get.
 */
export const PARRY_VISIBLE_CELLS = 1.5;

/** How many decimal places a measured distance is kept — and shown — to. */
const CELL_PLACES = 1;

/**
 * A raw grid distance, quantised to the precision the panel will display.
 *
 * **Everything downstream must use this rather than the raw figure**, and that is
 * the whole point of it existing. The bug it fixes was reported on 2026-08-26:
 * the row printed `Math.round(cells)` while `bandFor` compared the unrounded
 * value, so a shot at a true 2.1 cells read `Dist 2` and was charged Medium —
 * *"impossible to use this 2/4/8 range ability at short range"*.
 *
 * Showing a decimal alone would not have fixed it. `2.04` displays as `2.0` at
 * one place and would still have been banded as over 2. Quantising at the
 * *measurement* instead means the number on screen is the number the arithmetic
 * used, whatever it is rounded to — a display can no longer disagree with a
 * result, because there is only one value.
 *
 * One decimal place because that is what a person can read off a row at a glance,
 * and because a tenth of a cell is four inches of tabletop: fine enough that
 * nobody is being cheated, coarse enough to absorb the float noise a grid
 * measurement carries.
 */
export function measuredCells(raw: number): number {
  const factor = 10 ** CELL_PLACES;
  return Math.round(raw * factor) / factor;
}

/**
 * A measured distance as a row should print it.
 *
 * Whole numbers stay whole — `Dist 2`, which is what the grid gives for tokens
 * sitting on cells and is what nearly every row shows. The decimal appears only
 * when there really is a fraction, which is exactly when it is deciding a range
 * band and the reader needs to see it.
 */
export function formatCells(cells: number): string {
  return Number.isInteger(cells) ? String(cells) : cells.toFixed(CELL_PLACES);
}

/**
 * What a shot at this defender has to beat: their Parry when it is into melee,
 * and the usual flat 4 when it is not.
 *
 * A real target number rather than a modifier on the attacker's total. The two
 * are arithmetically identical — `resolveAttack` counts off `total - target` —
 * and the modifier form was tried first, because it rides the shot panel's
 * amendment machinery for free. It was dropped for one reason: the row has to
 * *say* "vs 6", and a line that shows one number while resolving against another
 * is a bug waiting to be reported as one.
 */
export function targetNumber(parry: number | undefined, intoMelee: boolean): number {
  return intoMelee ? (parry ?? DEFAULT_PARRY) : FLAT_TARGET;
}

/**
 * Whether the targeting table should print this target's Parry.
 *
 * Presentation rather than arithmetic — `resolveAimedAttack` is given the target
 * number directly and never consults this. It lives here anyway because it is
 * only decidable from `attackKind`, and because it is the kind of thing that
 * regresses silently: it was reported as data leakage, and a change that quietly
 * put the number back would look like nothing at all in a diff.
 *
 * A Fighting roll resolves *against* Parry, so it must be shown — the table
 * exists because a raise was once claimed with the Parry unknown. A shot resolves
 * against 4, so printing Parry beside every candidate hands the players a stat
 * from the sheet of every character on the map and buys the arithmetic nothing.
 * The exception is the shot that may have been into melee, which is the only case
 * where the Marshal needs the number.
 *
 * An unmeasured distance withholds it. Getting that backwards would leak on
 * exactly the rolls where something has already gone wrong.
 */
export function showsParry(skill: string | undefined, cells: number | undefined): boolean {
  if (skill === undefined) return false;
  const kind = attackKind(skill);
  if (kind === 'parry') return true;
  // `flat` is not an attack at all — a Notice roll offers no targeting table, and
  // it is only the caller's `isAttack` guard that stopped this saying otherwise.
  // Answering correctly without that guard is the point of it living here.
  if (kind !== 'maybe-parry') return false;
  return cells !== undefined && cells < PARRY_VISIBLE_CELLS;
}

/**
 * Whether the engine's flat verdict on this roll is simply wrong.
 *
 * Two ways it can be.
 *
 * **Fighting**, always. A Fighting roll is resolved against the target's Parry,
 * so "(success; 1 raise)" against 4 is meaningless and gets stripped.
 *
 * **Any roll that named its target**, because the shot panel resolves it. When a
 * shot has several targets its modifiers cannot ride in the expression — one roll
 * cannot carry two different range penalties — so the engine counts its raises
 * off a total that has not had the range taken out of it yet. It says two raises
 * where the panel says one, or a miss. That is the same disagreement Damian
 * reported twice, arriving through a third route.
 *
 * Not for an ordinary Shooting, Throwing or Athletics roll off the skills list.
 * There 4 genuinely is the number to beat unless the shot was into melee, so the
 * verdict is right in the common case and the targeting table shows the same 4
 * beside it. Stripping it would have been worse than leaving it: an Athletics
 * roll to climb a cliff is a plain roll against 4, and it would have silently
 * lost the only verdict it had.
 */
export function verdictIsMeaningless(skill: string | undefined, named = false): boolean {
  if (named) return true;
  return skill !== undefined && attackKind(skill) === 'parry';
}

/**
 * Remove the dice engine's own verdict from an explanation.
 *
 * The `s` and `e` roll forms set a Savage Worlds target number of 4 and annotate
 * every result with "(success; **1** raise)". For an attack that verdict is
 * against nothing — the number to beat is the target's Parry — and it is the
 * exact thing Damian reported: a raise claimed on a Fighting roll with the Parry
 * unknown.
 *
 * The engine cannot be changed to suit: it is shared with the Discord bot, whose
 * output is pinned by the conformance corpus. So the annotation is stripped from
 * the line at the point an attack is published, and the targeting table supplies
 * the verdict that actually means something.
 *
 * Only ever applied to attack rolls. A Notice roll against 4 is genuinely a roll
 * against 4, and its "(success)" is correct.
 */
export function withoutFlatVerdict(explained: string): string {
  return explained.replace(/\s*\(success(?:;[^)]*)?\)/g, '');
}
