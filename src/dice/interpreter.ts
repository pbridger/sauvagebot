/** Ports of `RollInterpreter` and `StatementInterpreter`. */

import { CommandContext, evalUnsafe, isNonTrivialExpression, type IntListResult } from './evaluator.js';
import { Roller } from './roller.js';
import { EvaluationError, Limits } from './results.js';
import type { Expression, Statement } from './ast.js';

const bold = (s: string | number): string => `**${s}**`;
const italic = (s: string): string => `*${s}*`;

export class RollInterpreter {
  private debugEnabled = false;

  constructor(readonly context: CommandContext) {}

  run(statements: Statement[]): string {
    if (statements.every((s) => s.kind === 'NonParsedString')) {
      return 'No commands';
    }

    let result = '';
    for (const statement of statements) {
      // NB: the Java version also dumps the parse tree when `--debug` is set. That output is a
      // debugging aid only; it is intentionally not reproduced here.
      try {
        result += this.statement(statement);
      } catch (e) {
        if (e instanceof EvaluationError) {
          result += `{${statement.text}: ${e.message}}`;
        } else {
          throw e;
        }
      }
    }
    return result;
  }

  private statement(statement: Statement): string {
    switch (statement.kind) {
      case 'NonParsedString':
        return `${statement.text} `;

      case 'Error':
        return `Error: \`${statement.text}\`: ${statement.errorMessage}\n`;

      case 'RollOnce':
        return `${this.eval(statement.expression).explained}\n`;

      case 'RollTimes': {
        let result = `${statement.text}: `;
        const times = this.evalAndExplainTimes(statement.times, (s) => {
          result += s;
        });
        checkTimes(times);
        result += '\n';
        for (let i = 0; i < times; i++) {
          result += `${i + 1}: ${this.eval(statement.expression).explained}\n`;
        }
        return result;
      }

      case 'RollBatchTimes': {
        let result = `${statement.text}: `;
        const times = this.evalAndExplainTimes(statement.times, (s) => {
          result += s;
        });
        checkTimes(times);
        result += '\n';
        for (let i = 0; i < times; i++) {
          result += `${i + 1}: `;
          for (const expression of statement.expressions) {
            result += `${this.eval(expression).explained}; `;
          }
          result += '\n';
        }
        return result;
      }

      case 'Flag': {
        if (statement.flag.toLowerCase() === 'debug') {
          this.debugEnabled = true;
          return `${italic('Debug mode enabled.')}\n`;
        }
        throw new EvaluationError(`Unknown flag: '${statement.flag}'`);
      }

      case 'IronSwornRoll':
        return this.ironSworn(statement);
    }
  }

  private ironSworn(statement: Extract<Statement, { kind: 'IronSwornRoll' }>): string {
    const roller = new Roller(this.context.random);
    const d6 = roller.rollDie(6);
    const modifier = this.modifierValue(statement.modifierExpression, statement.modifierOperator);
    // A modified roll can't exceed 10.
    const modifiedD6 = Math.min(d6 + modifier.value, 10);
    const d10a = roller.rollDie(10);
    const d10b = roller.rollDie(10);

    let moveResult: string;
    if (modifiedD6 > d10a && modifiedD6 > d10b) moveResult = 'Strong hit';
    else if (modifiedD6 > d10a || modifiedD6 > d10b) moveResult = 'Weak hit';
    else moveResult = 'Miss';
    if (d10a === d10b) moveResult += ' with match';

    let result = `${bold(moveResult)}: ${d6}`;
    if (statement.modifierOperator !== undefined) {
      const image = statement.modifierOperator === 'PLUS' ? '+' : '-';
      result += ` ${image} ${modifier.explained} = ${modifiedD6}`;
    }
    result += ` VS ${d10a}, ${d10b}`;
    return result;
  }

  private modifierValue(
    modifierExpression: Expression | undefined,
    modifierOperator: string | undefined,
  ): { value: number; explained: string } {
    if (modifierExpression === undefined) return { value: 0, explained: '' };

    const modifierResult = evalUnsafe(modifierExpression, this.context);
    const values = modifierResult.values;
    if (values.length !== 1) {
      throw new EvaluationError(
        `Scalar result expected in \`${modifierExpression.text}\`: [${values.join(', ')}] = ${modifierResult.explained}`,
      );
    }
    const value = values[0]!;
    if (modifierOperator === 'PLUS') return { value, explained: modifierResult.explained };
    if (modifierOperator === 'MINUS') return { value: -value, explained: modifierResult.explained };
    throw new EvaluationError(`Unexpected modifier operator: ${modifierOperator}`);
  }

  private evalAndExplainTimes(timesExpression: Expression, append: (s: string) => void): number {
    const timesResult = this.eval(timesExpression);
    if (isNonTrivialExpression(timesExpression)) {
      append(timesResult.explained);
    }
    return timesResult.values[0]!;
  }

  /** Evaluation failures are reported inline rather than aborting the whole statement. */
  private eval(expression: Expression): IntListResult {
    try {
      return evalUnsafe(expression, this.context);
    } catch (e) {
      if (e instanceof EvaluationError) {
        return { values: [], explained: `${expression.text}: ${e.message}` };
      }
      const name = e instanceof Error ? e.constructor.name : 'Error';
      const message = e instanceof Error ? e.message : String(e);
      return {
        values: [],
        explained: `${expression.text}: Internal error (${name}): ${message}`,
      };
    }
  }

  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }
}

function checkTimes(times: number): void {
  if (times > Limits.MAX_TIMES) {
    throw new EvaluationError(
      `Too many repetitions: ${times}, should be <= ${Limits.MAX_TIMES}`,
    );
  }
}
