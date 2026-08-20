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
