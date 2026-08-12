/**
 * Ports of `ExpressionEvaluator`, `ExpressionExplainer`, `ExpressionContext` and `CommandContext`.
 *
 * Evaluation and explanation are two passes over the same tree: the evaluator records a partial
 * explanation per node in an identity-keyed map, and the explainer stitches those together. The
 * Java version keys a `HashMap<Expression, String>` on object identity (Node overrides neither
 * equals nor hashCode); a JS `Map` keyed by the node object gives exactly the same semantics.
 */

import { JavaRandom } from './javaRandom.js';
import { Roller } from './roller.js';
import { rollGygaxRange, rollSwordWorldPower } from './specialRollers.js';
import { EvaluationError, Limits } from './results.js';
import {
  OPERATORS,
  type Expression,
  type Operator,
  type TargetNumberMode,
} from './ast.js';

/** Java `int` arithmetic wraps at 32 bits; JS numbers do not. */
const i32 = (n: number): number => n | 0;

export class CommandContext {
  readonly variables = new Map<string, number[]>();
  constructor(readonly random: JavaRandom = new JavaRandom()) {}
}

class ExpressionContext {
  private readonly explanations = new Map<Expression, string>();
  targetNumberMode: TargetNumberMode | undefined = undefined;
  targetNumber = 4;
  savageWorldsRaiseStep = 4;
  swordWorldAutoFail = false;

  constructor(readonly commandContext: CommandContext) {}

  putExplanation(expression: Expression, explanation: string): void {
    this.explanations.set(expression, explanation);
  }

  getExplanation(expression: Expression | undefined): string | undefined {
    return expression === undefined ? undefined : this.explanations.get(expression);
  }
}

export interface IntListResult {
  values: number[];
  explained: string;
}

export function evalUnsafe(expression: Expression, commandContext: CommandContext): IntListResult {
  const context = new ExpressionContext(commandContext);
  const evaluator = new Evaluator(context);
  const values = evaluator.eval(expression);
  const explained = new Explainer(context).explainExpressionResult(expression, values);
  return { values, explained };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

class Evaluator {
  private readonly roller: Roller;

  constructor(private readonly context: ExpressionContext) {
    this.roller = new Roller(context.commandContext.random);
  }

  eval(e: Expression): number[] {
    switch (e.kind) {
      case 'Int':
        return [e.value];

      case 'AssignVariable': {
        const value = this.eval(e.argument);
        this.context.commandContext.variables.set(e.variable, value);
        return value;
      }

      case 'Variable': {
        const value = this.context.commandContext.variables.get(e.variable);
        if (value === undefined) {
          throw new EvaluationError(`Undefined variable: \`${e.variable}\``);
        }
        this.context.putExplanation(
          e,
          value.length === 1 ? `{${e.variable}=${value[0]}}` : `{${e.variable}=${javaList(value)}}`,
        );
        return value;
      }

      case 'Commented':
        return this.eval(e.expression);

      case 'Operator':
        return this.evalOperator(e);

      case 'GenericRoll': {
        const diceCount = this.evalIntOr(e.diceCountArg, 1);
        this.checkDiceCount(diceCount);
        const facetsCount = this.evalIntRequired(e.facetsCountArg, `No facets count: \`${e.text}\``);

        let result;
        if (e.suffixOperator === 'SUCCESS_OR_FAIL') {
          const successThreshold = this.evalIntRequired(
            e.suffixArg1,
            `No success threshold: \`${e.text}\``,
          );
          const failThreshold = this.evalIntOr(e.suffixArg2, 0);
          result = this.roller.rollSuccessOrFail(
            diceCount,
            facetsCount,
            e.isOpenEnded,
            successThreshold,
            failThreshold,
          );
        } else {
          let suffixArg = 0;
          switch (e.suffixOperator) {
            case 'KEEP':
              suffixArg = this.evalIntRequired(e.suffixArg1, `No argument for 'k': \`${e.text}\``);
              break;
            case 'KEEP_LEAST':
              suffixArg = this.evalIntRequired(e.suffixArg1, `No argument for 'kl': \`${e.text}\``);
              break;
            case 'ADVANTAGE':
            case 'DISADVANTAGE':
              suffixArg = this.evalIntOr(e.suffixArg1, 1);
              break;
            case undefined:
              suffixArg = 0;
              break;
            default:
              throw new EvaluationError(`Unexpected suffix operator: ${e.suffixOperator}`);
          }
          result = this.roller.rollAndKeep(
            diceCount,
            facetsCount,
            e.isOpenEnded,
            e.suffixOperator,
            suffixArg,
          );
        }

        this.context.putExplanation(e, result.explained);
        return [result.value];
      }

      case 'FudgeRoll': {
        const diceCount = this.evalIntOr(e.diceCountArg, 4);
        this.checkDiceCount(diceCount);
        if (this.context.targetNumberMode === undefined && diceCount === 4) {
          this.context.targetNumberMode = 'FATE_LADDER';
        }
        const result = this.roller.rollFudge(diceCount);
        this.context.putExplanation(e, result.explained);
        return [result.value];
      }

      case 'CarcosaRoll': {
        const diceCount = this.evalIntOr(e.diceCountArg, 1);
        this.checkDiceCount(diceCount);
        const result = this.roller.rollCarcosa(diceCount);
        this.context.putExplanation(e, result.explained);
        return [result.value];
      }

      case 'WegD6Roll': {
        const diceCount = this.evalIntOr(e.diceCountArg, 1);
        this.checkDiceCount(diceCount);
        const result = this.roller.rollWegD6(diceCount);
        this.context.putExplanation(e, result.explained);
        return [result.value];
      }

      case 'SavageWorldsRoll': {
        this.context.targetNumberMode = 'SAVAGE_WORLDS_SUCCESS';
        const diceCount = this.evalIntOr(e.diceCountArg, 1);
        this.checkDiceCount(diceCount);
        const abilityDieFacets = this.evalIntRequired(
          e.abilityDieArg,
          `No ability die facets: \`${e.text}\``,
        );
        const wildDieFacets = this.evalIntOr(e.wildDieArg, 6);
        const result = this.roller.rollSavageWorlds(diceCount, abilityDieFacets, wildDieFacets);
        this.context.putExplanation(e, result.explained);
        return result.values;
      }

      case 'SavageWorldsExtrasRoll': {
        this.context.targetNumberMode = 'SAVAGE_WORLDS_SUCCESS';
        const facetsCount = this.evalIntOr(e.facetsArg, 6);
        const dieValue = this.roller.roll(facetsCount, true).value;
        const modifier = this.evalIntOr(e.modifierArg, 0);

        let result: number;
        let explanation = String(dieValue);
        if (e.modifierOperator === 'PLUS') {
          result = i32(dieValue + modifier);
          explanation += ` + ${modifier}`;
        } else if (e.modifierOperator === 'MINUS') {
          result = i32(dieValue - modifier);
          explanation += ` - ${modifier}`;
        } else {
          result = dieValue;
        }

        this.context.putExplanation(e, explanation);
        return [result];
      }

      case 'TargetNumberAndRaiseStep': {
        this.context.targetNumberMode = e.mode;
        if (e.targetNumberAndRaiseStep !== undefined) {
          const v = this.evalIntOr(e.targetNumberAndRaiseStep, 4);
          this.context.targetNumber = v;
          this.context.savageWorldsRaiseStep = v;
        }
        if (e.targetNumber !== undefined) {
          this.context.targetNumber = this.evalIntOr(e.targetNumber, 4);
        }
        if (e.raiseStep !== undefined) {
          this.context.savageWorldsRaiseStep = this.evalIntOr(e.raiseStep, 4);
        }
        return this.eval(e.argument);
      }

      case 'D66Roll': {
        const result = this.roller.rollD66(e.digitsCount);
        this.context.putExplanation(e, result.explained);
        return [result.value];
      }

      case 'GygaxRangeRoll': {
        const result = rollGygaxRange(this.roller, e.min, e.max);
        this.context.putExplanation(e, result.explained);
        return [result.value];
      }

      case 'SwordWorldPowerRoll': {
        const result = rollSwordWorldPower(this.roller, {
          power: this.evalIntRequired(e.power, 'Power value not provided'),
          critical: this.evalIntOr(e.critical, -1),
          autoFailThreshold: this.evalIntOr(e.autoFailThreshold, 2),
          numDice: this.evalIntOr(e.numDice, 2),
          rollModifier: this.evalIntOr(e.rollModifier, 0) * e.rollModifierSign,
          withHumanSwordGrace: e.withHumanSwordGrace,
        });
        this.context.putExplanation(e, result.explained);
        if (!this.context.swordWorldAutoFail) {
          this.context.swordWorldAutoFail = result.isAutoFail;
        }
        return [result.value];
      }
    }
  }

  private evalOperator(e: Extract<Expression, { kind: 'Operator' }>): number[] {
    if (e.operator === 'BOUND_TO') return this.evalBoundTo(e);

    const [a1, a2] = e.arguments;
    const arg1 = a1 === undefined ? undefined : this.eval(a1);
    const arg2 = a2 === undefined ? undefined : this.eval(a2);

    if (OPERATORS[e.operator].arity === 1) {
      if (e.operator === 'BRACKETS') {
        const inner = this.context.getExplanation(a1);
        if (inner !== undefined) this.context.putExplanation(e, inner);
      }
      return (arg1 ?? []).map((it) => applyUnary(e.operator, it));
    }

    const l = arg1 ?? [];
    const r = arg2 ?? [];
    const l0 = l[0]!;
    const r0 = r[0]!;
    if (l.length === 1 && r.length === 1) return [applyBinary(e.operator, l0, r0)];
    if (l.length === 1) return r.map((it) => applyBinary(e.operator, l0, it));
    if (r.length === 1) return l.map((it) => applyBinary(e.operator, it, r0));
    throw new EvaluationError(
      `Unexpected argument sizes: ${javaList(l)}, ${javaList(r)} in \`${e.text}\``,
    );
  }

  private evalBoundTo(e: Extract<Expression, { kind: 'Operator' }>): number[] {
    const [a1, a2, a3] = e.arguments;
    const arg = this.eval(a1!);
    // Java uses Integer.MIN_VALUE / MAX_VALUE as the "unbounded" sentinels.
    const lowBound = this.evalIntOr(a2, -2147483648);
    const highBound = this.evalIntOr(a3, 2147483647);

    if (lowBound > highBound) {
      throw new EvaluationError(`Empty range in \`${e.text}\`: [${lowBound}:${highBound}]`);
    }

    const result: number[] = [];
    const parts: string[] = [];
    for (const value of arg) {
      if (value > highBound) {
        parts.push(`${value}=>${highBound}`);
        result.push(highBound);
      } else if (value < lowBound) {
        parts.push(`${value}=>${lowBound}`);
        result.push(lowBound);
      } else {
        parts.push(String(value));
        result.push(value);
      }
    }

    const body = parts.join(',');
    this.context.putExplanation(e, arg.length > 1 ? `[${body}]` : body);
    return result;
  }

  private checkDiceCount(diceCount: number): void {
    if (diceCount > Limits.MAX_DICE) {
      throw new EvaluationError(
        `Too many dice: ${diceCount}, should be <= ${Limits.MAX_DICE}`,
      );
    }
  }

  private evalIntOr(e: Expression | undefined, defaultValue: number): number {
    if (e === undefined) return defaultValue;
    return this.single(e);
  }

  private evalIntRequired(e: Expression | undefined, message: string): number {
    if (e === undefined) throw new EvaluationError(message);
    return this.single(e);
  }

  private single(e: Expression): number {
    const result = this.eval(e);
    if (result.length !== 1) {
      throw new EvaluationError(`Single value expected in \`${e.text}\`: ${javaList(result)}`);
    }
    return result[0]!;
  }
}

function applyUnary(operator: Operator, value: number): number {
  switch (operator) {
    case 'UNARY_PLUS':
    case 'BRACKETS':
      return value;
    case 'UNARY_MINUS':
      return i32(-value);
    default:
      throw new EvaluationError(`Unexpected unary operator: ${operator}`);
  }
}

function applyBinary(operator: Operator, a: number, b: number): number {
  switch (operator) {
    case 'PLUS':
      return i32(a + b);
    case 'MINUS':
      return i32(a - b);
    case 'MUL':
      return Math.imul(a, b);
    case 'DIV':
      if (b === 0) throw new EvaluationError('Division by 0');
      return i32(Math.trunc(a / b)); // Java integer division truncates toward zero
    case 'MOD':
      if (b === 0) throw new EvaluationError('Division by 0');
      return i32(a % b); // JS % matches Java's sign-of-dividend remainder
    default:
      throw new EvaluationError(`Unexpected binary operator: ${operator}`);
  }
}

/** Java's `List<Integer>.toString()`. */
function javaList(values: number[]): string {
  return `[${values.join(', ')}]`;
}

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

const bold = (s: string | number): string => `**${s}**`;

function dropBrackets(e: Expression): Expression {
  if (e.kind === 'Operator' && e.operator === 'BRACKETS') {
    return dropBrackets(e.arguments[0]!);
  }
  return e;
}

function isD1(e: Expression): boolean {
  if (e.kind !== 'GenericRoll') return false;
  const facets = e.facetsCountArg;
  return facets !== undefined && facets.kind === 'Int' && facets.value === 1;
}

export function isTrivialExpression(e: Expression): boolean {
  const inner = dropBrackets(e);
  return inner.kind === 'Int' || isD1(inner);
}

export function isNonTrivialExpression(e: Expression): boolean {
  return !isTrivialExpression(e);
}

function shouldExplanationAlreadyBeResult(e: Expression): boolean {
  if (e.kind === 'Int' || e.kind === 'D66Roll') return true;
  if (e.kind === 'GenericRoll') {
    if (e.suffixOperator !== undefined) return false;
    if (e.isOpenEnded) return false;
    const diceCount = e.diceCountArg;
    if (diceCount === undefined) return true;
    return diceCount.kind === 'Int' && diceCount.value === 1;
  }
  return false;
}

class Explainer {
  constructor(private readonly context: ExpressionContext) {}

  explainExpressionResult(expression: Expression, values: number[]): string {
    const explanation = this.explain(expression);

    if (isTrivialExpression(expression)) return explanation;

    if (this.context.targetNumberMode !== undefined) {
      return `${expression.text}: ${explanation} = ${values
        .map((i) => bold(i) + this.successesIfAny(i))
        .join(', ')}`;
    }

    if (shouldExplanationAlreadyBeResult(expression)) {
      return `${expression.text}: ${bold(explanation)}`;
    }

    if (this.context.swordWorldAutoFail) {
      return `${expression.text}: ${explanation} = ${bold('NO EFFECT')}`;
    }

    const results = values.map((i) => bold(i)).join(', ');

    if (expression.kind === 'Commented') return `${explanation} = ${results}`;

    return `${expression.text}: ${explanation} = ${results}`;
  }

  private successesIfAny(value: number): string {
    const targetNumber = this.context.targetNumber;
    const raiseStep = this.context.savageWorldsRaiseStep;
    if (raiseStep <= 0) {
      throw new EvaluationError(`Raise step should be above 0: ${raiseStep}`);
    }

    switch (this.context.targetNumberMode) {
      case 'SAVAGE_WORLDS_SUCCESS': {
        const margin = value - targetNumber;
        if (margin < 0) return '';
        let s = ' (success';
        const raiseCount = Math.trunc(margin / raiseStep);
        if (raiseCount > 0) {
          s += `; ${bold(raiseCount)}${raiseCount === 1 ? ' raise' : ' raises'}`;
        }
        return `${s})`;
      }
      case 'SAVAGE_WORLDS_DAMAGE': {
        const margin = value - targetNumber;
        if (margin < 0) return '';
        const wounds = Math.trunc(margin / raiseStep);
        let s = ' (shaken';
        if (wounds > 0) {
          s += `, ${bold(wounds)}${wounds > 1 ? ' wounds' : ' wound'}`;
        }
        return `${s})`;
      }
      case 'GENERIC_ROLL_ABOVE': {
        const margin = value - targetNumber;
        return margin >= 0 ? ` (success, MoS=${margin})` : ` (failure, MoF=${-margin})`;
      }
      case 'GENERIC_ROLL_UNDER': {
        const margin = targetNumber - value;
        return margin >= 0 ? ` (success, MoS=${margin})` : ` (failure, MoF=${-margin})`;
      }
      case 'FATE_LADDER':
        return fudgeLadder(value);
      default:
        throw new Error(`Unexpected target number mode: ${this.context.targetNumberMode}`);
    }
  }

  private knownExplanation(e: Expression): string {
    if (e.kind === 'Operator' && e.operator === 'BRACKETS') {
      return this.knownExplanation(e.arguments[0]!);
    }
    return this.context.getExplanation(e) ?? e.text;
  }

  private explainOrUndefined(e: Expression | undefined): string | undefined {
    return e === undefined ? undefined : this.explain(e);
  }

  explain(e: Expression): string {
    switch (e.kind) {
      case 'Int':
        return e.text;

      case 'AssignVariable': {
        const argumentExplanation = this.context.getExplanation(e.argument);
        if (argumentExplanation !== undefined) {
          return `{${e.variable}=${argumentExplanation}}`;
        }
        return this.knownExplanation(e);
      }

      case 'Variable':
        // Always populated by the evaluator before the explainer runs.
        return this.context.getExplanation(e) as string;

      case 'Commented':
        return `${e.comment}: ${this.explain(e.expression)}`;

      case 'Operator':
        return this.explainOperator(e);

      case 'TargetNumberAndRaiseStep':
        return this.knownExplanation(e.argument);

      default:
        return this.knownExplanation(e);
    }
  }

  private explainOperator(e: Extract<Expression, { kind: 'Operator' }>): string {
    const [a1, a2, a3] = e.arguments;
    let explanation1 = this.explainOrUndefined(a1);
    let explanation2 = this.explainOrUndefined(a2);
    this.explainOrUndefined(a3);

    if (e.operator === 'BOUND_TO') return this.explainBoundTo(e);

    const info = OPERATORS[e.operator];
    let operatorExplanation: string;

    switch (info.kind) {
      case 'BINARY':
        if (e.operator === 'MUL' || e.operator === 'DIV' || e.operator === 'MOD') {
          if (a1 !== undefined && isRepresentedAsAdditive(a1)) explanation1 = `(${explanation1})`;
          if (a2 !== undefined && isRepresentedAsAdditive(a2)) explanation2 = `(${explanation2})`;
        }
        operatorExplanation = `${explanation1} ${info.outputImage} ${explanation2}`;
        break;
      case 'PREFIX':
        operatorExplanation = `${info.image1}${explanation1}`;
        break;
      case 'BRACKETS':
        operatorExplanation = `${info.image1}${explanation1}${info.image2}`;
        break;
      default:
        throw new EvaluationError(`Unexpected operator kind: ${info.kind}`);
    }

    if (
      this.context.getExplanation(a1) !== undefined ||
      this.context.getExplanation(a2) !== undefined ||
      this.context.getExplanation(a3) !== undefined
    ) {
      this.context.putExplanation(e, operatorExplanation);
    }

    return operatorExplanation;
  }

  private explainBoundTo(e: Extract<Expression, { kind: 'Operator' }>): string {
    const [a1, a2, a3] = e.arguments;
    const e1 = this.context.getExplanation(a1);
    const e2 = this.context.getExplanation(a2);
    const e3 = this.context.getExplanation(a3);

    if (e1 !== undefined || e2 !== undefined || e3 !== undefined) {
      let out = '{';
      if (e1 !== undefined) out += `${e1} `;
      if (e2 !== undefined) out += `${a2!.text}: ${e2} `;
      if (e3 !== undefined) out += `${a3!.text}: ${e3} `;
      out += `= ${this.context.getExplanation(e)}}`;
      return out;
    }

    return this.knownExplanation(e);
  }
}

function isRepresentedAsAdditive(e: Expression): boolean {
  if (e.kind === 'GenericRoll') {
    const diceCountArg = e.diceCountArg;
    if (diceCountArg !== undefined && diceCountArg.kind === 'Int') {
      return diceCountArg.value > 1;
    }
    return true;
  }
  return e.kind === 'CarcosaRoll' || e.kind === 'WegD6Roll';
}

function fudgeLadder(value: number): string {
  const ladder: Record<number, string> = {
    [-2]: ' Terrible',
    [-1]: ' Poor',
    0: ' Mediocre',
    1: ' Average',
    2: ' Fair',
    3: ' Good',
    4: ' Great',
    5: ' Superb',
    6: ' Fantastic',
    7: ' Epic',
    8: ' Legendary',
  };
  const known = ladder[value];
  if (known !== undefined) return known;
  return value < -2 ? ` Terrible${value + 2}` : ` Legendary+${value - 8}`;
}
