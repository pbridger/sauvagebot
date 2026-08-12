/**
 * AST for the R2 dice expression language.
 *
 * The Java original models this as ~25 classes with a visitor interface. TypeScript's
 * discriminated unions express the same shapes far more compactly, and `switch (node.kind)`
 * gives exhaustiveness checking that the visitor pattern was emulating.
 *
 * Field names deliberately mirror the Java ones so the port can be diffed against the original.
 */

export type OperatorKind = 'BINARY' | 'PREFIX' | 'BRACKETS' | 'TERNARY';

export type Operator =
  | 'PLUS'
  | 'MINUS'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'UNARY_PLUS'
  | 'UNARY_MINUS'
  | 'BRACKETS'
  | 'BOUND_TO';

interface OperatorInfo {
  kind: OperatorKind;
  arity: number;
  image1: string;
  image2: string;
  image3: string;
  /** What is printed in explanations — note MUL prints as `x`, not `*`. */
  outputImage: string;
}

export const OPERATORS: Record<Operator, OperatorInfo> = {
  PLUS: { kind: 'BINARY', arity: 2, image1: '+', image2: '', image3: '', outputImage: '+' },
  MINUS: { kind: 'BINARY', arity: 2, image1: '-', image2: '', image3: '', outputImage: '-' },
  MUL: { kind: 'BINARY', arity: 2, image1: '*', image2: '', image3: '', outputImage: 'x' },
  DIV: { kind: 'BINARY', arity: 2, image1: '/', image2: '', image3: '', outputImage: '/' },
  MOD: { kind: 'BINARY', arity: 2, image1: '%', image2: '', image3: '', outputImage: '%' },
  UNARY_PLUS: { kind: 'PREFIX', arity: 1, image1: '+', image2: '', image3: '', outputImage: '+' },
  UNARY_MINUS: { kind: 'PREFIX', arity: 1, image1: '-', image2: '', image3: '', outputImage: '-' },
  BRACKETS: { kind: 'BRACKETS', arity: 1, image1: '(', image2: ')', image3: '', outputImage: '(' },
  BOUND_TO: { kind: 'TERNARY', arity: 3, image1: '[', image2: ':', image3: ']', outputImage: '[' },
};

const UNARY_OPERATORS: Record<string, Operator> = { '+': 'UNARY_PLUS', '-': 'UNARY_MINUS' };
const BINARY_OPERATORS: Record<string, Operator> = {
  '+': 'PLUS',
  '-': 'MINUS',
  '*': 'MUL',
  '/': 'DIV',
  '%': 'MOD',
};

export function getUnaryOperator(image: string): Operator | undefined {
  return UNARY_OPERATORS[image];
}

export function getBinaryOperator(image: string): Operator | undefined {
  return BINARY_OPERATORS[image];
}

export type SuffixOperator = 'KEEP' | 'KEEP_LEAST' | 'ADVANTAGE' | 'DISADVANTAGE' | 'SUCCESS_OR_FAIL';

interface SuffixInfo {
  image: string;
  aliases: string[];
  requiredArguments: number;
}

export const SUFFIX_OPERATORS: Record<SuffixOperator, SuffixInfo> = {
  KEEP: { image: 'k', aliases: ['K'], requiredArguments: 1 },
  KEEP_LEAST: { image: 'kl', aliases: ['KL'], requiredArguments: 1 },
  ADVANTAGE: { image: 'adv', aliases: [], requiredArguments: 0 },
  DISADVANTAGE: { image: 'dis', aliases: [], requiredArguments: 0 },
  SUCCESS_OR_FAIL: { image: 'sf', aliases: [], requiredArguments: 0 },
};

export function getSuffixOperator(image: string): SuffixOperator | undefined {
  for (const [name, info] of Object.entries(SUFFIX_OPERATORS)) {
    if (info.image === image || info.aliases.includes(image)) {
      return name as SuffixOperator;
    }
  }
  return undefined;
}

export type TargetNumberMode =
  | 'GENERIC_ROLL_ABOVE'
  | 'GENERIC_ROLL_UNDER'
  | 'SAVAGE_WORLDS_SUCCESS'
  | 'SAVAGE_WORLDS_DAMAGE'
  | 'FATE_LADDER';

/** Every node carries the source text it was parsed from; explanations echo it back. */
interface NodeBase {
  text: string;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export interface IntExpression extends NodeBase {
  kind: 'Int';
  value: number;
}

export interface VariableExpression extends NodeBase {
  kind: 'Variable';
  variable: string;
}

export interface AssignVariableExpression extends NodeBase {
  kind: 'AssignVariable';
  variable: string;
  argument: Expression;
}

export interface CommentedExpression extends NodeBase {
  kind: 'Commented';
  comment: string;
  expression: Expression;
}

export interface OperatorExpression extends NodeBase {
  kind: 'Operator';
  operator: Operator;
  arguments: Expression[];
}

export interface GenericRollExpression extends NodeBase {
  kind: 'GenericRoll';
  diceCountArg: Expression | undefined;
  facetsCountArg: Expression | undefined;
  isOpenEnded: boolean;
  suffixOperator: SuffixOperator | undefined;
  suffixArg1: Expression | undefined;
  suffixArg2: Expression | undefined;
}

export interface SavageWorldsRollExpression extends NodeBase {
  kind: 'SavageWorldsRoll';
  diceCountArg: Expression | undefined;
  abilityDieArg: Expression | undefined;
  wildDieArg: Expression | undefined;
}

export interface SavageWorldsExtrasRollExpression extends NodeBase {
  kind: 'SavageWorldsExtrasRoll';
  facetsArg: Expression | undefined;
  modifierOperator: Operator | undefined;
  modifierArg: Expression | undefined;
}

export interface FudgeRollExpression extends NodeBase {
  kind: 'FudgeRoll';
  diceCountArg: Expression | undefined;
}

export interface CarcosaRollExpression extends NodeBase {
  kind: 'CarcosaRoll';
  diceCountArg: Expression | undefined;
}

export interface WegD6RollExpression extends NodeBase {
  kind: 'WegD6Roll';
  diceCountArg: Expression | undefined;
}

export interface D66RollExpression extends NodeBase {
  kind: 'D66Roll';
  digitsCount: number;
}

export interface GygaxRangeRollExpression extends NodeBase {
  kind: 'GygaxRangeRoll';
  min: number;
  max: number;
}

export interface SwordWorldPowerRollExpression extends NodeBase {
  kind: 'SwordWorldPowerRoll';
  power: Expression;
  critical: Expression | undefined;
  autoFailThreshold: Expression | undefined;
  numDice: Expression | undefined;
  rollModifier: Expression | undefined;
  /** 0 when no modifier operator was given, otherwise +1 or -1. */
  rollModifierSign: number;
  withHumanSwordGrace: boolean;
}

export interface TargetNumberAndRaiseStepExpression extends NodeBase {
  kind: 'TargetNumberAndRaiseStep';
  argument: Expression;
  mode: TargetNumberMode;
  targetNumber: Expression | undefined;
  raiseStep: Expression | undefined;
  /** The `trN` form, where target number and raise step are given as one value. */
  targetNumberAndRaiseStep: Expression | undefined;
}

export type Expression =
  | IntExpression
  | VariableExpression
  | AssignVariableExpression
  | CommentedExpression
  | OperatorExpression
  | GenericRollExpression
  | SavageWorldsRollExpression
  | SavageWorldsExtrasRollExpression
  | FudgeRollExpression
  | CarcosaRollExpression
  | WegD6RollExpression
  | D66RollExpression
  | GygaxRangeRollExpression
  | SwordWorldPowerRollExpression
  | TargetNumberAndRaiseStepExpression;

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export interface RollOnceStatement extends NodeBase {
  kind: 'RollOnce';
  expression: Expression;
}

export interface RollTimesStatement extends NodeBase {
  kind: 'RollTimes';
  times: Expression;
  expression: Expression;
}

export interface RollBatchTimesStatement extends NodeBase {
  kind: 'RollBatchTimes';
  times: Expression;
  expressions: Expression[];
}

export interface IronSwornRollStatement extends NodeBase {
  kind: 'IronSwornRoll';
  modifierOperator: Operator | undefined;
  modifierExpression: Expression | undefined;
}

export interface NonParsedStringStatement extends NodeBase {
  kind: 'NonParsedString';
  parserErrorMessage: string | undefined;
}

export interface ErrorStatement extends NodeBase {
  kind: 'Error';
  errorMessage: string;
}

export interface FlagStatement extends NodeBase {
  kind: 'Flag';
  flag: string;
}

export type Statement =
  | RollOnceStatement
  | RollTimesStatement
  | RollBatchTimesStatement
  | IronSwornRollStatement
  | NonParsedStringStatement
  | ErrorStatement
  | FlagStatement;

export type Node = Expression | Statement;
