/**
 * Port of `r2/parse/{Parser,Desugarer,StatementDesugarer,ExpressionDesugarer}.java`.
 *
 * Splits input into statements (respecting brackets, quotes and backslash escapes), runs each
 * through the ANTLR-generated parser, then lowers the parse tree into the AST in `ast.ts`.
 */

import {
  CharStream,
  CommonTokenStream,
  BaseErrorListener,
  type ATNSimulator,
  type Recognizer,
  type Token,
} from 'antlr4ng';
import { R2Lexer } from './generated/R2Lexer.js';
import * as P from './generated/R2Parser.js';
import { R2Parser } from './generated/R2Parser.js';
import {
  getBinaryOperator,
  getSuffixOperator,
  getUnaryOperator,
  SUFFIX_OPERATORS,
  type Expression,
  type Statement,
  type TargetNumberMode,
} from './ast.js';

export class DesugaringError extends Error {}

class SyntaxErrorException extends Error {}

class ThrowingErrorListener extends BaseErrorListener {
  override syntaxError<S extends Token, T extends ATNSimulator>(
    _recognizer: Recognizer<T>,
    _offendingSymbol: S | null,
    _line: number,
    charPositionInLine: number,
    msg: string,
  ): void {
    throw new SyntaxErrorException(`[${charPositionInLine}]: ${msg}`);
  }
}

/** Splits on whitespace and `;` at bracket depth zero, honouring `\` escapes and `"` literals. */
export function splitStatements(input: string): string[] {
  const out: string[] = [];
  let next = '';
  let brackets = 0;
  let square = 0;
  let curly = 0;
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '\\' && i + 1 < input.length) {
      next += input[++i];
      continue;
    }
    const isSeparator = (/\s/.test(ch) || ch === ';') && brackets === 0 && square === 0 && curly === 0 && !inString;
    if (isSeparator) {
      out.push(next);
      next = '';
      continue;
    }
    next += ch;
    switch (ch) {
      case '(':
        if (!inString) brackets++;
        break;
      case ')':
        if (!inString && brackets > 0) brackets--;
        break;
      case '[':
        if (!inString) square++;
        break;
      case ']':
        if (!inString && square > 0) square--;
        break;
      case '{':
        if (!inString) curly++;
        break;
      case '}':
        if (!inString && curly > 0) curly--;
        break;
      case '"':
        inString = !inString;
        break;
    }
  }
  if (next.length > 0) out.push(next);
  return out;
}

export function parse(args: string[]): Statement[] {
  const input = args.join(' ');
  const statements: Statement[] = [];
  for (const chunk of splitStatements(input)) {
    statements.push(...parseCommandElement(chunk));
  }
  return statements;
}

export function parseCommandElement(input: string): Statement[] {
  const stmtString = input.trim();
  if (stmtString.length === 0) return [];

  const lexer = new R2Lexer(CharStream.fromString(stmtString));
  lexer.removeErrorListeners();
  lexer.addErrorListener(new ThrowingErrorListener());

  const parser = new R2Parser(new CommonTokenStream(lexer));
  parser.removeErrorListeners();
  parser.addErrorListener(new ThrowingErrorListener());

  try {
    const element = parser.commandElement();
    const d = new Desugarer(stmtString);
    return element.statement().map((ctx) => {
      try {
        return d.statement(ctx);
      } catch (e) {
        if (e instanceof DesugaringError) {
          return { kind: 'Error', text: stmtString, errorMessage: e.message } as Statement;
        }
        throw e;
      }
    });
  } catch (e) {
    if (e instanceof SyntaxErrorException) {
      return [{ kind: 'NonParsedString', text: stmtString, parserErrorMessage: e.message }];
    }
    throw e;
  }
}

function desugarComment(text: string): string {
  return text.substring(1, text.length - 1);
}

class Desugarer {
  constructor(private readonly inputString: string) {}

  private originalText(ctx: { start: { start: number } | null; stop: { stop: number } | null }): string {
    const start = ctx.start?.start ?? 0;
    const end = ctx.stop?.stop ?? -1;
    return this.inputString.substring(start, end + 1);
  }

  // -------------------------------------------------------------------------
  // Statements
  // -------------------------------------------------------------------------

  statement(ctx: P.StatementContext): Statement {
    const text = this.originalText(ctx);

    if (ctx instanceof P.RollOnceStmtContext) {
      return { kind: 'RollOnce', text, expression: this.expr(ctx._e!) };
    }
    if (ctx instanceof P.RollTimesStmtContext) {
      return {
        kind: 'RollTimes',
        text,
        times: this.expr(ctx._n!),
        expression: this.expr(ctx._e!),
      };
    }
    if (ctx instanceof P.RollBatchTimesStmtContext) {
      return {
        kind: 'RollBatchTimes',
        text,
        times: this.expr(ctx._n!),
        expressions: ctx.batchElement().map((be) => {
          const expression = this.expr(be._e!);
          if (be._comment) {
            return {
              kind: 'Commented' as const,
              text: be.getText(),
              comment: desugarComment(be._comment.text ?? ''),
              expression,
            };
          }
          return expression;
        }),
      };
    }
    if (ctx instanceof P.FlagStmtContext) {
      return { kind: 'Flag', text, flag: (ctx._flag?.text ?? '').substring(2) };
    }
    if (ctx instanceof P.RollSavageWorldsExtraStmtContext) {
      const n = this.expr(ctx._n!);
      const facets = this.expr(ctx._t1!);
      const admc = ctx.additiveModifier();

      // The inner expression's text starts after the repetition count.
      const start = ctx._n ? ctx._n.stop!.stop + 1 : ctx.start!.start;
      const stop = ctx.stop!.stop;
      const innerText = this.inputString.substring(start, stop + 1);

      const inner: Expression = {
        kind: 'SavageWorldsExtrasRoll',
        text: innerText,
        facetsArg: facets,
        modifierOperator: admc ? getBinaryOperator(admc._op?.text ?? '') : undefined,
        modifierArg: admc ? this.expr(admc._em!) : undefined,
      };

      return {
        kind: 'RollTimes',
        text,
        times: n,
        expression: this.targetNumberAndRaiseStep(innerText, ctx.targetNumberAndRaiseStep(), inner),
      };
    }
    if (ctx instanceof P.IronSwornRollStmtContext) {
      const admc = ctx.additiveModifier();
      return {
        kind: 'IronSwornRoll',
        text,
        modifierOperator: admc ? getBinaryOperator(admc._op?.text ?? '') : undefined,
        modifierExpression: admc ? this.expr(admc._em!) : undefined,
      };
    }
    throw new DesugaringError(`Unexpected statement: ${ctx.getText()}`);
  }

  // -------------------------------------------------------------------------
  // Expressions
  // -------------------------------------------------------------------------

  private exprOrUndefined(ctx: unknown): Expression | undefined {
    return ctx == null ? undefined : this.expr(ctx as P.ExpressionContext);
  }

  expr(ctx: P.ExpressionContext | P.TermContext | P.DieFacetsTermContext): Expression {
    const text = this.originalText(ctx);

    if (ctx instanceof P.TermExprContext) return this.expr(ctx._t!);
    if (ctx instanceof P.IntTermContext) {
      return { kind: 'Int', text: ctx.getText(), value: parseIntStrict(ctx.getText()) };
    }
    if (ctx instanceof P.ExprTermContext) {
      const inner: Expression = ctx._comment
        ? {
            kind: 'Commented',
            text,
            comment: desugarComment(ctx._comment.text ?? ''),
            expression: this.expr(ctx._e!),
          }
        : this.expr(ctx._e!);
      return { kind: 'Operator', text, operator: 'BRACKETS', arguments: [inner] };
    }
    if (ctx instanceof P.InfixExpr1Context || ctx instanceof P.InfixExpr2Context) {
      const op = getBinaryOperator(ctx._op?.text ?? '');
      if (!op) throw new DesugaringError(`Unknown operator: ${ctx._op?.text}`);
      return { kind: 'Operator', text, operator: op, arguments: [this.expr(ctx._e1!), this.expr(ctx._e2!)] };
    }
    if (ctx instanceof P.PrefixExprContext) {
      const op = getUnaryOperator(ctx._op?.text ?? '');
      if (!op) throw new DesugaringError(`Unknown operator: ${ctx._op?.text}`);
      return { kind: 'Operator', text, operator: op, arguments: [this.expr(ctx._e1!)] };
    }
    if (ctx instanceof P.AssignExprContext) {
      return {
        kind: 'AssignVariable',
        text,
        variable: ctx._v?.text ?? '',
        argument: this.expr(ctx._e1!),
      };
    }
    if (ctx instanceof P.VarTermContext) {
      return { kind: 'Variable', text, variable: ctx._v?.text ?? '' };
    }
    if (ctx instanceof P.BoundedExprContext) {
      if (ctx._e2 == null && ctx._e3 == null) {
        throw new DesugaringError(`At least one bound should be provided: \`${text}\``);
      }
      const a2 = this.exprOrUndefined(ctx._e2);
      const a3 = this.exprOrUndefined(ctx._e3);
      if (a2?.kind === 'Int' && a3?.kind === 'Int' && a2.value > a3.value) {
        throw new DesugaringError(`Empty range: \`${text}\``);
      }
      // BOUND_TO is ternary; absent bounds stay as holes so the evaluator can skip them.
      return {
        kind: 'Operator',
        text,
        operator: 'BOUND_TO',
        arguments: [this.expr(ctx._e1!), a2 as Expression, a3 as Expression],
      };
    }
    if (ctx instanceof P.GenericRollExprContext) return this.genericRoll(ctx, text);
    if (ctx instanceof P.FudgeRollExprContext) {
      return { kind: 'FudgeRoll', text, diceCountArg: this.exprOrUndefined(ctx.fudgeRoll()._t) };
    }
    if (ctx instanceof P.CarcosaRollExprContext) {
      return { kind: 'CarcosaRoll', text, diceCountArg: this.exprOrUndefined(ctx.carcosaRoll()._t) };
    }
    if (ctx instanceof P.WegD6RollExprContext) {
      return { kind: 'WegD6Roll', text, diceCountArg: this.exprOrUndefined(ctx.wegD6Roll()._t) };
    }
    if (ctx instanceof P.SavageWorldsRollExprContext) {
      const swrc = ctx.savageWorldsRoll();
      const inner: Expression = {
        kind: 'SavageWorldsRoll',
        text,
        diceCountArg: this.exprOrUndefined(swrc._t1),
        abilityDieArg: this.expr(swrc._t2!),
        wildDieArg: this.exprOrUndefined(swrc._t3),
      };
      return this.targetNumberAndRaiseStep(text, swrc.targetNumberAndRaiseStep(), inner);
    }
    if (ctx instanceof P.SavageWorldsExtrasRollExprContext) {
      const swerc = ctx.savageWorldsExtrasRoll();
      const inner: Expression = {
        kind: 'SavageWorldsExtrasRoll',
        text,
        facetsArg: this.exprOrUndefined(swerc._t1),
        modifierOperator: undefined,
        modifierArg: undefined,
      };
      return this.targetNumberAndRaiseStep(text, swerc.targetNumberAndRaiseStep(), inner);
    }
    if (ctx instanceof P.SwordWorldPowerRollExprContext) return this.swordWorld(ctx, text);
    if (ctx instanceof P.TargetNumberAndRaiseStepExprContext) {
      return this.targetNumberAndRaiseStep(text, ctx.targetNumberAndRaiseStep(), this.expr(ctx._e1!));
    }
    if (ctx instanceof P.GygaxRangeRollExprContext) {
      return {
        kind: 'GygaxRangeRoll',
        text: ctx.getText(),
        min: parseIntStrict(ctx._g0?.text ?? ''),
        max: parseIntStrict(ctx._g1?.text ?? ''),
      };
    }
    throw new DesugaringError(`Unexpected expression: ${ctx.getText()}`);
  }

  private dieFacets(ctx: P.DieFacetsTermContext): Expression {
    if (ctx.getText() === '%') {
      return { kind: 'Int', text: this.originalText(ctx), value: 100 };
    }
    return this.expr(ctx.term()!);
  }

  private genericRoll(ctx: P.GenericRollExprContext, text: string): Expression {
    const gr = ctx.genericRoll();
    const arg1 = this.exprOrUndefined(gr._t1);
    const arg2 = this.dieFacets(gr._t2!);
    const isOpenEnded = gr._excl != null;

    const grs = gr.genericRollSuffix();

    if (grs == null) {
      // Bare `d66`, `d666`, ... are D66-style digit rolls, not 66-sided dice.
      if (arg1 == null && arg2.kind === 'Int') {
        const digits = D66_FACETS[arg2.value];
        if (digits !== undefined) {
          return { kind: 'D66Roll', text, digitsCount: digits };
        }
      }
      return {
        kind: 'GenericRoll',
        text,
        diceCountArg: arg1,
        facetsCountArg: arg2,
        isOpenEnded,
        suffixOperator: undefined,
        suffixArg1: undefined,
        suffixArg2: undefined,
      };
    }

    if (grs instanceof P.RollAndKeepSuffixContext) {
      const image = grs._op?.text ?? '';
      const suffixOperator = getSuffixOperator(image);
      if (!suffixOperator) throw new DesugaringError(`Unknown suffix: '${image}'`);
      if (SUFFIX_OPERATORS[suffixOperator].requiredArguments > 0 && grs._n == null) {
        throw new DesugaringError(`Argument required for '${image}'`);
      }
      return {
        kind: 'GenericRoll',
        text,
        diceCountArg: arg1,
        facetsCountArg: arg2,
        isOpenEnded,
        suffixOperator,
        suffixArg1: this.exprOrUndefined(grs._n),
        suffixArg2: undefined,
      };
    }

    if (grs instanceof P.SuccessOrFailSuffix1Context || grs instanceof P.SuccessOrFailSuffix2Context) {
      return {
        kind: 'GenericRoll',
        text,
        diceCountArg: arg1,
        facetsCountArg: arg2,
        isOpenEnded,
        suffixOperator: 'SUCCESS_OR_FAIL',
        suffixArg1: this.exprOrUndefined(grs._sn),
        suffixArg2: this.exprOrUndefined(grs._fn),
      };
    }

    if (grs instanceof P.TargetNumberAndRaiseStepSuffixContext) {
      const inner: Expression = {
        kind: 'GenericRoll',
        text,
        diceCountArg: arg1,
        facetsCountArg: arg2,
        isOpenEnded,
        suffixOperator: undefined,
        suffixArg1: undefined,
        suffixArg2: undefined,
      };
      return this.targetNumberAndRaiseStep(text, grs.targetNumberAndRaiseStep(), inner);
    }

    throw new DesugaringError(`Unexpected generic roll suffix: '${grs.getText()}'`);
  }

  private swordWorld(ctx: P.SwordWorldPowerRollExprContext, text: string): Expression {
    const swprc = ctx.swordWorldPowerRoll();
    const power = this.expr(swprc._tp!);

    let critical: Expression | undefined;
    let autoFailThreshold: Expression | undefined;
    let numDice: Expression | undefined;
    let rollModifier: Expression | undefined;
    let rollModifierSign = 1;
    let withHumanSwordGrace = false;

    for (const modCtx of swprc.swordWorldPowerRollModifier()) {
      if (modCtx instanceof P.SwordWorldCriticalModifierContext) {
        critical = this.exprOrUndefined(modCtx._tc);
      } else if (modCtx instanceof P.SwordWorldAutoFailModifierContext) {
        autoFailThreshold = this.exprOrUndefined(modCtx._tf);
      } else if (modCtx instanceof P.SwordWorldRollModifierContext) {
        numDice = this.exprOrUndefined(modCtx._td);
        // `[+2]` is {numDice: null, rollModifier: 2}; `[d+2]` is {numDice: 1, rollModifier: 2}.
        if (numDice == null && modCtx._dop != null) {
          numDice = { kind: 'Int', text: '', value: 1 };
        }
        rollModifier = this.exprOrUndefined(modCtx._tm);
        if (modCtx._mop == null) rollModifierSign = 0;
        else if (modCtx._mop.text === '-') rollModifierSign = -1;
        else rollModifierSign = 1;
      } else if (modCtx instanceof P.SwordWorldHumanSwordGraceModifierContext) {
        withHumanSwordGrace = true;
      }
    }

    return {
      kind: 'SwordWorldPowerRoll',
      text,
      power,
      critical,
      autoFailThreshold,
      numDice,
      rollModifier,
      rollModifierSign,
      withHumanSwordGrace,
    };
  }

  targetNumberAndRaiseStep(
    text: string,
    tnrc: P.TargetNumberAndRaiseStepContext | null,
    inner: Expression,
  ): Expression {
    if (tnrc == null) return inner;

    let targetNumber: Expression | undefined;
    let raiseStep: Expression | undefined;
    let combined: Expression | undefined;
    let mode: TargetNumberMode;

    if (tnrc._tgtn != null) {
      targetNumber = this.exprOrUndefined(tnrc._tgtn);
      mode = tnrc.getText().endsWith('-') ? 'GENERIC_ROLL_UNDER' : 'GENERIC_ROLL_ABOVE';
    } else if (tnrc._tnr != null) {
      combined = this.exprOrUndefined(tnrc._tnr);
      mode = savageWorldsMode(inner);
    } else {
      targetNumber = this.exprOrUndefined(tnrc._tt);
      raiseStep = this.exprOrUndefined(tnrc._tr);
      mode = savageWorldsMode(inner);
    }

    return {
      kind: 'TargetNumberAndRaiseStep',
      text,
      argument: inner,
      mode,
      targetNumber,
      raiseStep,
      targetNumberAndRaiseStep: combined,
    };
  }
}

const D66_FACETS: Record<number, number> = {
  66: 2,
  666: 3,
  6666: 4,
  66666: 5,
  666666: 6,
  6666666: 7,
  66666666: 8,
  666666666: 9,
};

function savageWorldsMode(inner: Expression): TargetNumberMode {
  return inner.kind === 'SavageWorldsRoll' || inner.kind === 'SavageWorldsExtrasRoll'
    ? 'SAVAGE_WORLDS_SUCCESS'
    : 'SAVAGE_WORLDS_DAMAGE';
}

function parseIntStrict(text: string): number {
  const value = Number(text);
  if (!Number.isInteger(value)) {
    throw new DesugaringError(`Unrecognized integer: '${text}'`);
  }
  return value;
}
