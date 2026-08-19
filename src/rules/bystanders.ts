/**
 * Innocent bystanders — the shot that goes wide and finds someone else.
 *
 * ## The rule
 *
 * Savage Worlds Deluxe, which is the edition Deadlands Reloaded and Coffin Rock
 * are written for: *"Each miss that comes up a 1 on the Shooting die indicates a
 * random adjacent character was hit. If the attacker was firing on full-auto or
 * with a shotgun, a roll of 1 or 2 hits the bystander."* SWADE keeps it, widening
 * "adjacent" to *"adjacent to or directly in the line of fire to the original
 * target"*.
 *
 * Four things in that wording decide everything below:
 *
 * 1. **The skill die, never the Wild Die.** A Wild Card who rolls trait 1 and
 *    wild 8 rolled an 8; the 1 is still a 1 for this. That is why the count
 *    filters on `role: 'trait'` — and it is the whole reason this is not simply
 *    "did the roll come up 1".
 * 2. **Only on a miss.** So it cannot be settled when the dice land: whether a
 *    shot missed is per-target, and the app deliberately never picks the target.
 *    The count travels with the roll; the targeting table decides whether to say
 *    anything.
 * 3. **Per die.** Each qualifying die is its own stray shot, which is why this
 *    counts rather than returning a boolean — RoF is not implemented today, so
 *    the count is always 0 or 1, and this will not need reshaping when it is not.
 * 4. **Only when there is someone to hit, and only when it is dramatic.** The
 *    book says so outright, and it is a Marshal's judgement. Nothing here picks a
 *    victim or applies damage.
 *
 * ## Widening the window
 *
 * The 1–2 window is not shotguns only — it is anything that throws lead about.
 * Full auto and RoF 2+ qualify, and so does Deadlands' Fan the Hammer, which says
 * it in its own text: *"If your Shooting die comes up 1 or 2, there's a chance you
 * hit an Innocent Bystander."* That is a **single-action revolver** at 1–2.
 *
 * Fan the Hammer is deliberately not detected from the sheet. Fanning is an
 * action a player chooses, not a property of the gun — a character with the Edge
 * who fires one aimed shot strays on a 1 like anyone else. Widening it because
 * the Edge is on the card would be wrong more often than right.
 */
import type { DieEvent } from '../dice/roller.js';
import { isRollableDamage, type Weapon } from './gear.js';

/** The plain window: a skill die of 1. */
export const STRAY_ON_MISS = 1;
/** Shotguns, full auto, RoF 2+ — anything that puts more lead in the air than it aims. */
export const STRAY_ON_SPRAY = 2;

/**
 * Skills whose misses can hit somebody else.
 *
 * Shooting and Throwing: a thrown knife goes wide exactly as a bullet does, and
 * Throwing is a skill in its own right in Deadlands Reloaded, rolled from the
 * skills list.
 *
 * **Athletics is deliberately not here**, though the targeting table does treat
 * it as a ranged attack. `weaponSkill` only ever returns Shooting or Fighting, so
 * a thrown weapon rolled off the weapons table arrives as Shooting — which means
 * an Athletics roll can only have come from the skills list, where it is a climb
 * or a swim. Including it would buy no real coverage and cost a nonsense warning
 * on one Athletics roll in four.
 *
 * Fighting is absent for a simpler reason: a missed swing does not travel.
 */
const STRAY_SKILLS = /^(shooting|throwing)\b/i;

export function skillCanStray(skill: string | undefined): boolean {
  return skill !== undefined && STRAY_SKILLS.test(skill.trim());
}

/**
 * Whether this weapon throws lead about, widening the window to 1–2.
 *
 * Four signals, because a stat block writes it four ways and none of them is
 * reliable alone:
 *
 *   - `RoF 2` or better — more bullets, more of them going elsewhere.
 *   - Damage written as a die *range*, `1–3d6`. That form is the scattergun's
 *     signature in both books: the number of dice depends on how much the shot
 *     has spread. `isRollableDamage` already recognises it, for a different
 *     reason, and this is the same fact read a second way.
 *   - The name. "Scattergun", "shotgun", "Gatling", and the LeMat's `(shotgun)`
 *     mode, which `parseGear` puts on the name when it splits the two barrels.
 *   - The notes, for the full-auto weapons whose RoF was left in prose —
 *     "must fire full RoF" and the like.
 */
export function spraysLead(weapon: Pick<Weapon, 'name' | 'damage' | 'rof' | 'notes'>): boolean {
  if ((weapon.rof ?? 1) >= 2) return true;
  if (weapon.damage && !isRollableDamage(weapon.damage)) return true;
  if (/shotgun|scatter\s?gun|gatling|buckshot|blunderbuss/i.test(weapon.name)) return true;
  // `full auto` and `full RoF` only. A bare "automatic" was tried and cut: it
  // matches "auto-loading" and every semi-automatic pistol in the book, none of
  // which spray.
  return /\bfull[\s-]?auto|full\s+rof/i.test(weapon.notes ?? '');
}

/** The die value at or under which a shot from this weapon can go astray. */
export function strayThreshold(
  weapon?: Pick<Weapon, 'name' | 'damage' | 'rof' | 'notes'>,
): number {
  return weapon && spraysLead(weapon) ? STRAY_ON_SPRAY : STRAY_ON_MISS;
}

/**
 * How many of this roll's dice could have found a bystander.
 *
 * `role === 'trait'` excludes the Wild Die, which the rule never counts.
 * `step === 0` excludes the dice an ace bought: those are the *same* die
 * continuing, and in any case a die that aced showed its maximum face.
 */
export function strayShots(dice: readonly DieEvent[], threshold = STRAY_ON_MISS): number {
  return dice.filter((die) => die.role === 'trait' && die.step === 0 && die.value <= threshold)
    .length;
}

/**
 * The warning, in the words the table needs — conditional, because the app knows
 * the die came up 1 and nothing else that matters.
 */
export function strayWarning(count: number, threshold: number): string {
  const dice = count === 1 ? 'die' : 'dice';
  const window = threshold >= STRAY_ON_SPRAY ? ' (1–2, this weapon sprays)' : '';
  return (
    `${count} skill ${dice} came up at or under ${threshold}${window}. ` +
    `On a **miss**, each one hits a random character adjacent to whoever you were ` +
    `aiming at, or directly in the line of fire. The Wild Die never counts. ` +
    `Marshal's call — and only if somebody is actually standing there.`
  );
}
