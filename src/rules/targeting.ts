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

export type Band = 'short' | 'medium' | 'long' | 'over';

/**
 * The penalty for shooting at each band.
 *
 * !! SWADE-standard, confirmed with Paul rather than from the book. !!
 */
export const BAND_PENALTY: Record<Band, number> = {
  short: 0,
  medium: -2,
  long: -4,
  // Beyond long is not a penalty but a refusal: the shot cannot be taken, and a
  // number here would imply it could.
  over: Number.NaN,
};

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
 */
export function bandFor(cells: number, bands: RangeBands): Band {
  const [short, medium, long] = bands;
  if (cells <= short) return 'short';
  if (cells <= medium) return 'medium';
  if (cells <= long) return 'long';
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
 * Beyond long range the shot is not taken at all. That is not a penalty and must
 * not be modelled as one: a big enough bonus would otherwise let someone hit a
 * target the weapon cannot reach.
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
 * Whether the engine's flat verdict on this roll is simply wrong.
 *
 * Only for Fighting. A Fighting roll is *always* against the target's Parry, so
 * "(success; 1 raise)" against 4 is meaningless and gets stripped.
 *
 * Not for Shooting, Throwing or Athletics, even though all three offer a
 * targeting table. There, 4 genuinely is the number to beat unless the shot is
 * into melee — so the verdict is right in the common case, and the table shows
 * the same 4 beside it. Stripping it would have been worse than leaving it: an
 * Athletics roll to climb a cliff is a plain roll against 4, and it would have
 * silently lost the only verdict it had.
 */
export function verdictIsMeaningless(skill: string | undefined): boolean {
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
