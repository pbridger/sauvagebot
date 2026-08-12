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
import { traitDie, type DieSides, type Sheet, type Skill } from './sheet.js';

export interface TraitRollRequest {
  die: DieSides;
  /** Trait modifier plus any situational modifier the caller has already summed. */
  mod?: number;
  /** Wild Cards roll a d6 Wild Die alongside and keep the better; Extras do not. */
  wildCard: boolean;
}

/**
 * `s8+1` for a Wild Card, `e8+1` for an Extra — the bot's own syntax, so the
 * explanation string players see in OBR is the one they already know.
 */
export function traitExpression({ die, mod = 0, wildCard }: TraitRollRequest): string {
  const sign = mod === 0 ? '' : mod > 0 ? `+${mod}` : `${mod}`;
  return `${wildCard ? 's' : 'e'}${die}${sign}`;
}

export interface TraitRollResult {
  expression: string;
  /** The engine's explanation, e.g. `s8+1: [7; w3] +1 = **8**`. */
  explained: string;
}

export function rollTrait(
  request: TraitRollRequest,
  random: JavaRandom = new JavaRandom(),
): TraitRollResult {
  const expression = traitExpression(request);
  const explained = new RollInterpreter(new CommandContext(random))
    .run(parse([expression]))
    .trim();
  return { expression, explained };
}

/** Roll a named skill off a sheet, applying the untrained d4−2 where it applies. */
export function rollSkill(
  sheet: Sheet,
  skill: Skill,
  situational = 0,
  random?: JavaRandom,
): TraitRollResult {
  const { die, mod } = traitDie(sheet, skill);
  return rollTrait(
    { die, mod: mod + situational, wildCard: sheet.wildCard },
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
