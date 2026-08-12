// Generated from grammar/R2.g4 by ANTLR 4.13.1

import { AbstractParseTreeVisitor } from "antlr4ng";


import { CommandElementContext } from "./R2Parser.js";
import { RollOnceStmtContext } from "./R2Parser.js";
import { RollTimesStmtContext } from "./R2Parser.js";
import { RollBatchTimesStmtContext } from "./R2Parser.js";
import { RollSavageWorldsExtraStmtContext } from "./R2Parser.js";
import { IronSwornRollStmtContext } from "./R2Parser.js";
import { FlagStmtContext } from "./R2Parser.js";
import { BatchElementContext } from "./R2Parser.js";
import { TermExprContext } from "./R2Parser.js";
import { SavageWorldsRollExprContext } from "./R2Parser.js";
import { SwordWorldPowerRollExprContext } from "./R2Parser.js";
import { InfixExpr2Context } from "./R2Parser.js";
import { InfixExpr1Context } from "./R2Parser.js";
import { TargetNumberAndRaiseStepExprContext } from "./R2Parser.js";
import { CarcosaRollExprContext } from "./R2Parser.js";
import { SavageWorldsExtrasRollExprContext } from "./R2Parser.js";
import { AssignExprContext } from "./R2Parser.js";
import { PrefixExprContext } from "./R2Parser.js";
import { BoundedExprContext } from "./R2Parser.js";
import { GygaxRangeRollExprContext } from "./R2Parser.js";
import { GenericRollExprContext } from "./R2Parser.js";
import { WegD6RollExprContext } from "./R2Parser.js";
import { FudgeRollExprContext } from "./R2Parser.js";
import { GenericRollContext } from "./R2Parser.js";
import { DieFacetsTermContext } from "./R2Parser.js";
import { RollAndKeepSuffixContext } from "./R2Parser.js";
import { SuccessOrFailSuffix1Context } from "./R2Parser.js";
import { SuccessOrFailSuffix2Context } from "./R2Parser.js";
import { TargetNumberAndRaiseStepSuffixContext } from "./R2Parser.js";
import { SavageWorldsRollContext } from "./R2Parser.js";
import { SavageWorldsExtrasRollContext } from "./R2Parser.js";
import { SwordWorldPowerRollContext } from "./R2Parser.js";
import { SwordWorldCriticalModifierContext } from "./R2Parser.js";
import { SwordWorldAutoFailModifierContext } from "./R2Parser.js";
import { SwordWorldHumanSwordGraceModifierContext } from "./R2Parser.js";
import { SwordWorldRollModifierContext } from "./R2Parser.js";
import { TargetNumberAndRaiseStepContext } from "./R2Parser.js";
import { AdditiveModifierContext } from "./R2Parser.js";
import { FudgeRollContext } from "./R2Parser.js";
import { CarcosaRollContext } from "./R2Parser.js";
import { WegD6RollContext } from "./R2Parser.js";
import { IntTermContext } from "./R2Parser.js";
import { VarTermContext } from "./R2Parser.js";
import { ExprTermContext } from "./R2Parser.js";


/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `R2Parser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export class R2Visitor<Result> extends AbstractParseTreeVisitor<Result> {
    /**
     * Visit a parse tree produced by `R2Parser.commandElement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitCommandElement?: (ctx: CommandElementContext) => Result;
    /**
     * Visit a parse tree produced by the `RollOnceStmt`
     * labeled alternative in `R2Parser.statement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitRollOnceStmt?: (ctx: RollOnceStmtContext) => Result;
    /**
     * Visit a parse tree produced by the `RollTimesStmt`
     * labeled alternative in `R2Parser.statement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitRollTimesStmt?: (ctx: RollTimesStmtContext) => Result;
    /**
     * Visit a parse tree produced by the `RollBatchTimesStmt`
     * labeled alternative in `R2Parser.statement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitRollBatchTimesStmt?: (ctx: RollBatchTimesStmtContext) => Result;
    /**
     * Visit a parse tree produced by the `RollSavageWorldsExtraStmt`
     * labeled alternative in `R2Parser.statement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitRollSavageWorldsExtraStmt?: (ctx: RollSavageWorldsExtraStmtContext) => Result;
    /**
     * Visit a parse tree produced by the `IronSwornRollStmt`
     * labeled alternative in `R2Parser.statement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitIronSwornRollStmt?: (ctx: IronSwornRollStmtContext) => Result;
    /**
     * Visit a parse tree produced by the `FlagStmt`
     * labeled alternative in `R2Parser.statement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitFlagStmt?: (ctx: FlagStmtContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.batchElement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitBatchElement?: (ctx: BatchElementContext) => Result;
    /**
     * Visit a parse tree produced by the `TermExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitTermExpr?: (ctx: TermExprContext) => Result;
    /**
     * Visit a parse tree produced by the `SavageWorldsRollExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSavageWorldsRollExpr?: (ctx: SavageWorldsRollExprContext) => Result;
    /**
     * Visit a parse tree produced by the `SwordWorldPowerRollExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSwordWorldPowerRollExpr?: (ctx: SwordWorldPowerRollExprContext) => Result;
    /**
     * Visit a parse tree produced by the `InfixExpr2`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitInfixExpr2?: (ctx: InfixExpr2Context) => Result;
    /**
     * Visit a parse tree produced by the `InfixExpr1`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitInfixExpr1?: (ctx: InfixExpr1Context) => Result;
    /**
     * Visit a parse tree produced by the `TargetNumberAndRaiseStepExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitTargetNumberAndRaiseStepExpr?: (ctx: TargetNumberAndRaiseStepExprContext) => Result;
    /**
     * Visit a parse tree produced by the `CarcosaRollExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitCarcosaRollExpr?: (ctx: CarcosaRollExprContext) => Result;
    /**
     * Visit a parse tree produced by the `SavageWorldsExtrasRollExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSavageWorldsExtrasRollExpr?: (ctx: SavageWorldsExtrasRollExprContext) => Result;
    /**
     * Visit a parse tree produced by the `AssignExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitAssignExpr?: (ctx: AssignExprContext) => Result;
    /**
     * Visit a parse tree produced by the `PrefixExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitPrefixExpr?: (ctx: PrefixExprContext) => Result;
    /**
     * Visit a parse tree produced by the `BoundedExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitBoundedExpr?: (ctx: BoundedExprContext) => Result;
    /**
     * Visit a parse tree produced by the `GygaxRangeRollExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitGygaxRangeRollExpr?: (ctx: GygaxRangeRollExprContext) => Result;
    /**
     * Visit a parse tree produced by the `GenericRollExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitGenericRollExpr?: (ctx: GenericRollExprContext) => Result;
    /**
     * Visit a parse tree produced by the `WegD6RollExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitWegD6RollExpr?: (ctx: WegD6RollExprContext) => Result;
    /**
     * Visit a parse tree produced by the `FudgeRollExpr`
     * labeled alternative in `R2Parser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitFudgeRollExpr?: (ctx: FudgeRollExprContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.genericRoll`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitGenericRoll?: (ctx: GenericRollContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.dieFacetsTerm`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitDieFacetsTerm?: (ctx: DieFacetsTermContext) => Result;
    /**
     * Visit a parse tree produced by the `RollAndKeepSuffix`
     * labeled alternative in `R2Parser.genericRollSuffix`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitRollAndKeepSuffix?: (ctx: RollAndKeepSuffixContext) => Result;
    /**
     * Visit a parse tree produced by the `SuccessOrFailSuffix1`
     * labeled alternative in `R2Parser.genericRollSuffix`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSuccessOrFailSuffix1?: (ctx: SuccessOrFailSuffix1Context) => Result;
    /**
     * Visit a parse tree produced by the `SuccessOrFailSuffix2`
     * labeled alternative in `R2Parser.genericRollSuffix`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSuccessOrFailSuffix2?: (ctx: SuccessOrFailSuffix2Context) => Result;
    /**
     * Visit a parse tree produced by the `TargetNumberAndRaiseStepSuffix`
     * labeled alternative in `R2Parser.genericRollSuffix`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitTargetNumberAndRaiseStepSuffix?: (ctx: TargetNumberAndRaiseStepSuffixContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.savageWorldsRoll`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSavageWorldsRoll?: (ctx: SavageWorldsRollContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.savageWorldsExtrasRoll`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSavageWorldsExtrasRoll?: (ctx: SavageWorldsExtrasRollContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.swordWorldPowerRoll`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSwordWorldPowerRoll?: (ctx: SwordWorldPowerRollContext) => Result;
    /**
     * Visit a parse tree produced by the `SwordWorldCriticalModifier`
     * labeled alternative in `R2Parser.swordWorldPowerRollModifier`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSwordWorldCriticalModifier?: (ctx: SwordWorldCriticalModifierContext) => Result;
    /**
     * Visit a parse tree produced by the `SwordWorldAutoFailModifier`
     * labeled alternative in `R2Parser.swordWorldPowerRollModifier`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSwordWorldAutoFailModifier?: (ctx: SwordWorldAutoFailModifierContext) => Result;
    /**
     * Visit a parse tree produced by the `SwordWorldHumanSwordGraceModifier`
     * labeled alternative in `R2Parser.swordWorldPowerRollModifier`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSwordWorldHumanSwordGraceModifier?: (ctx: SwordWorldHumanSwordGraceModifierContext) => Result;
    /**
     * Visit a parse tree produced by the `SwordWorldRollModifier`
     * labeled alternative in `R2Parser.swordWorldPowerRollModifier`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSwordWorldRollModifier?: (ctx: SwordWorldRollModifierContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.targetNumberAndRaiseStep`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitTargetNumberAndRaiseStep?: (ctx: TargetNumberAndRaiseStepContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.additiveModifier`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitAdditiveModifier?: (ctx: AdditiveModifierContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.fudgeRoll`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitFudgeRoll?: (ctx: FudgeRollContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.carcosaRoll`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitCarcosaRoll?: (ctx: CarcosaRollContext) => Result;
    /**
     * Visit a parse tree produced by `R2Parser.wegD6Roll`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitWegD6Roll?: (ctx: WegD6RollContext) => Result;
    /**
     * Visit a parse tree produced by the `IntTerm`
     * labeled alternative in `R2Parser.term`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitIntTerm?: (ctx: IntTermContext) => Result;
    /**
     * Visit a parse tree produced by the `VarTerm`
     * labeled alternative in `R2Parser.term`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitVarTerm?: (ctx: VarTermContext) => Result;
    /**
     * Visit a parse tree produced by the `ExprTerm`
     * labeled alternative in `R2Parser.term`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitExprTerm?: (ctx: ExprTermContext) => Result;
}

