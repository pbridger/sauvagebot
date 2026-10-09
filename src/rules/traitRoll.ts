/**
 * Trait rolls, expressed in the dice engine the Java bot was verified against.
 *
 * Nothing here reimplements dice. It builds the same expression string a player
 * would type at the bot (`s8+1`) and hands it to the conformance-tested engine,
 * so the VTT and Discord cannot drift apart — which is the payoff for doing the
 * TypeScript rewrite before the extension.
 */
import { CommandContext } from '../dice/evaluator.js';
import { RollInterpreter } from '../dice/interpreter.js';
import { JavaRandom } from '../dice/javaRandom.js';
import { parse } from '../dice/parser.js';
import type { DieEvent } from '../dice/roller.js';
import { traitDie, type DieSides, type Sheet } from './sheet.js';

export interface TraitRollRequest {
  die: DieSides;
  /** Trait modifier plus any situational modifier the caller has already summed. */
  mod?: number;
  /** Wild Cards roll a d6 Wild Die alongside and keep the better; Extras do not. */
  wildCard: boolean;
  /**
   * How many trait dice — the Rate of Fire of the weapon being fired.
   *
   * `"Rate of Fire is how many Shooting dice you roll when firing that weapon"`
   * (p147). The engine has always done this: `3s8` rolls three trait dice plus
   * the Wild Die and drops the single lowest across the set, which *is* the rule
   * — *"the Wild Die can take the place of a Shooting die if it winds up rolling
   * higher… They still can't hit more targets than the weapon's Rate of Fire."*
   *
   * One by default, and the syntax is unchanged at one, so nothing that was
   * rolling `s8` starts rolling `1s8` and drifting from the Discord corpus.
   */
  count?: number;
}

/**
 * `s8+1` for a Wild Card, `e8+1` for an Extra — the bot's own syntax, so the
 * explanation string players see in OBR is the one they already know.
 */
export function traitExpression({ die, mod = 0, wildCard, count = 1 }: TraitRollRequest): string {
  const sign = mod === 0 ? '' : mod > 0 ? `+${mod}` : `${mod}`;
  const dice = count > 1 ? String(count) : '';
  return `${dice}${wildCard ? 's' : 'e'}${die}${sign}`;
}

/**
 * Every total on one line, for a roll that produced more than one.
 *
 * `3s8+1` reports three results at once, and they cannot simply be read off as
 * `**…**` runs: the engine bolds its raise counts too, so
 * `**10** (success; **1** raise)` contains two bold numbers and only one of them
 * is a total. The verdicts are stripped first, which leaves the totals alone.
 *
 * Returns them in the order the engine reported, which for a Savage Worlds roll
 * is ascending — the lowest die was the one dropped. That order is not relied on:
 * a shot assigns its dice to targets by hand, which is the rule (p147).
 */
export function totalsOf(explained: string): number[] {
  const bare = explained.replace(/\s*\(success(?:;[^)]*)?\)/g, '');
  const at = bare.indexOf('=');
  if (at === -1) return [];
  return [...bare.slice(at).matchAll(/\*\*(-?\d+)\*\*/g)].map((m) => Number(m[1]));
}

export interface TraitRollResult {
  expression: string;
  /** The engine's explanation, e.g. `s8+1: [7; w3] +1 = **8**`. */
  explained: string;
  /**
   * Every die that was rolled, in the order it was rolled, for the animated tray.
   *
   * Always collected rather than gated behind a flag: it is one array push per die
   * on a code path that already builds strings, and a flag would mean two ways for
   * the same roll to behave.
   */
  dice: DieEvent[];
}

export function rollTrait(
  request: TraitRollRequest,
  random: JavaRandom = new JavaRandom(),
): TraitRollResult {
  const expression = traitExpression(request);
  const dice: DieEvent[] = [];
  const explained = new RollInterpreter(new CommandContext(random, (die) => dice.push(die)))
    .run(parse([expression]))
    .trim();
  return { expression, explained, dice };
}

/** Roll a named skill off a sheet, applying the untrained d4−2 where it applies. */
export function rollSkill(
  sheet: Sheet,
  skill: string,
  situational = 0,
  random?: JavaRandom,
  /** Trait dice to roll — a weapon's Rate of Fire. One unless a shot says more. */
  count = 1,
): TraitRollResult {
  const { die, mod } = traitDie(sheet, skill);
  return rollTrait(
    { die, mod: mod + situational, wildCard: sheet.wildCard, count },
    random ?? new JavaRandom(),
  );
}

export function rollAttribute(
  sheet: Sheet,
  attribute: keyof Sheet['attributes'],
  situational = 0,
  random?: JavaRandom,
): TraitRollResult {
  const trait = sheet.attributes[attribute];
  // An attribute a character somehow lacks behaves like an untrained skill.
  const die = trait?.die ?? 4;
  const mod = (trait ? (trait.mod ?? 0) : -2) + situational;
  return rollTrait({ die, mod, wildCard: sheet.wildCard }, random ?? new JavaRandom());
}

/**
 * Whether these dice are a Critical Failure.
 *
 * > *"If a Wild Card rolls a 1 on both their Trait and Wild Die, they suffer a
 * > Critical Failure… If you're rolling multiple Trait dice… a Critical Failure
 * > occurs when more than half the die results are 1."* — p6
 *
 * > *"Gabe fires a Gatling gun with a Rate of Fire of 3. He rolls three Shooting
 * > dice and one Wild Die. If three or more of the dice come up 1s, including the
 * > Wild Die, it's a Critical Failure."* — p140
 *
 * So the Wild Die is counted, and one rule covers both cases: a single trait die
 * needs two ones out of two, RoF 3 needs three out of four.
 *
 * Only the first die of each chain is read (`step === 0`). An ace's follow-up die
 * showing 1 is the end of an exploding die, not a die that came up 1.
 *
 * **Wild Cards only**, which is to say: only when there is a Wild Die. For an
 * Extra the book says *"If an Extra rolls a 1 on a Trait check and only it's
 * important to know if it's a Critical Failure, such as when casting a spell,
 * roll a d6"* — a Marshal's call on the occasion, not a property of the dice.
 */
export function criticalFailure(dice: readonly Pick<DieEvent, 'value' | 'step' | 'role'>[]): boolean {
  const faces = dice.filter((die) => die.step === 0 && (die.role === 'trait' || die.role === 'wild'));
  if (!faces.some((die) => die.role === 'wild')) return false;
  const ones = faces.filter((die) => die.value === 1).length;
  return ones * 2 > faces.length;
}

/**
 * What a Critical Failure does to the engine's explanation.
 *
 * *"The attempt automatically fails"* (p140) — so any `(success…)` the engine
 * wrote against the flat 4 comes off, whatever the modifiers pushed the total to,
 * and the marker goes on in plain text. Plain, not bold: `totalOf` and `totalsOf`
 * read bold numbers, and nothing that parses a total should be able to trip on it.
 */
export const CRITICAL_MARK = 'CRITICAL FAILURE';

export function markCritical(explained: string): string {
  return `${explained.replace(/\s*\(success(?:;[^)]*)?\)/g, '')} — ${CRITICAL_MARK}`;
}

/**
 * Elan: *"When you spend a Benny to reroll a Trait, add +2 to the total. The
 * bonus applies only when rerolling. It doesn't apply to damage rolls… nor does
 * it apply to Soak rolls unless you're using another Benny to reroll the Vigor
 * check."* So: every Benny reroll of a trait, Soak included.
 */
export const ELAN_BONUS = 2;

export function hasElan(edges: readonly { name: string }[]): boolean {
  return edges.some((edge) => /^\s*elan\b/i.test(edge.name));
}

/**
 * A trait expression with its modifier moved by `by`: `s8-1` → `s8+1`.
 *
 * Rebuilt rather than appended to, because the modifier on a multi-die roll
 * applies to each die's total and an appended `+2` would not mean the same thing.
 * Only the shape `traitExpression` writes is understood; anything else returns
 * `undefined` and the caller rolls without the bonus rather than guessing.
 */
export function raisedBy(expression: string, by: number): string | undefined {
  const found = /^(\d*)([se])(\d+)([+-]\d+)?$/.exec(expression.trim());
  if (!found) return undefined;
  const mod = Number(found[4] ?? 0) + by;
  return `${found[1]}${found[2]}${found[3]}${mod === 0 ? '' : mod > 0 ? `+${mod}` : `${mod}`}`;
}
