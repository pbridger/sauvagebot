// Generated from grammar/R2.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { R2Visitor } from "./R2Visitor.js";

// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class R2Parser extends antlr.Parser {
    public static readonly T__0 = 1;
    public static readonly T__1 = 2;
    public static readonly T__2 = 3;
    public static readonly T__3 = 4;
    public static readonly T__4 = 5;
    public static readonly T__5 = 6;
    public static readonly T__6 = 7;
    public static readonly T__7 = 8;
    public static readonly T__8 = 9;
    public static readonly T__9 = 10;
    public static readonly T__10 = 11;
    public static readonly T__11 = 12;
    public static readonly T__12 = 13;
    public static readonly T__13 = 14;
    public static readonly T__14 = 15;
    public static readonly T__15 = 16;
    public static readonly T__16 = 17;
    public static readonly T__17 = 18;
    public static readonly T__18 = 19;
    public static readonly T__19 = 20;
    public static readonly T__20 = 21;
    public static readonly T__21 = 22;
    public static readonly T__22 = 23;
    public static readonly T__23 = 24;
    public static readonly T__24 = 25;
    public static readonly T__25 = 26;
    public static readonly T__26 = 27;
    public static readonly T__27 = 28;
    public static readonly T__28 = 29;
    public static readonly T__29 = 30;
    public static readonly T__30 = 31;
    public static readonly T__31 = 32;
    public static readonly T__32 = 33;
    public static readonly T__33 = 34;
    public static readonly T__34 = 35;
    public static readonly T__35 = 36;
    public static readonly T__36 = 37;
    public static readonly T__37 = 38;
    public static readonly T__38 = 39;
    public static readonly T__39 = 40;
    public static readonly T__40 = 41;
    public static readonly T__41 = 42;
    public static readonly T__42 = 43;
    public static readonly T__43 = 44;
    public static readonly T__44 = 45;
    public static readonly T__45 = 46;
    public static readonly T__46 = 47;
    public static readonly T__47 = 48;
    public static readonly T__48 = 49;
    public static readonly T__49 = 50;
    public static readonly T__50 = 51;
    public static readonly T__51 = 52;
    public static readonly T__52 = 53;
    public static readonly T__53 = 54;
    public static readonly INT = 55;
    public static readonly STRING = 56;
    public static readonly WS = 57;
    public static readonly FLAG = 58;
    public static readonly VAR = 59;
    public static readonly RULE_commandElement = 0;
    public static readonly RULE_statement = 1;
    public static readonly RULE_batchElement = 2;
    public static readonly RULE_expression = 3;
    public static readonly RULE_genericRoll = 4;
    public static readonly RULE_dieFacetsTerm = 5;
    public static readonly RULE_genericRollSuffix = 6;
    public static readonly RULE_savageWorldsRoll = 7;
    public static readonly RULE_savageWorldsExtrasRoll = 8;
    public static readonly RULE_swordWorldPowerRoll = 9;
    public static readonly RULE_swordWorldPowerRollModifier = 10;
    public static readonly RULE_targetNumberAndRaiseStep = 11;
    public static readonly RULE_additiveModifier = 12;
    public static readonly RULE_fudgeRoll = 13;
    public static readonly RULE_carcosaRoll = 14;
    public static readonly RULE_wegD6Roll = 15;
    public static readonly RULE_term = 16;

    public static readonly literalNames = [
        null, "';'", "'x'", "'X'", "'['", "']'", "'e'", "'E'", "'i'", "'I'", 
        "':'", "':='", "'*'", "'/'", "'%'", "'--'", "'+'", "'-'", "'d'", 
        "'D'", "'!'", "'k'", "'K'", "'kl'", "'KL'", "'adv'", "'dis'", "'s'", 
        "'S'", "'f'", "'F'", "'w'", "'W'", "'p'", "'P'", "'c'", "'C'", "'h'", 
        "'H'", "'tr'", "'TR'", "'t'", "'T'", "'r'", "'R'", "'tn'", "'TN'", 
        "'dF'", "'df'", "'DF'", "'dC'", "'dc'", "'DC'", "'('", "')'"
    ];

    public static readonly symbolicNames = [
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        null, null, null, null, null, null, null, null, null, null, null, 
        "INT", "STRING", "WS", "FLAG", "VAR"
    ];
    public static readonly ruleNames = [
        "commandElement", "statement", "batchElement", "expression", "genericRoll", 
        "dieFacetsTerm", "genericRollSuffix", "savageWorldsRoll", "savageWorldsExtrasRoll", 
        "swordWorldPowerRoll", "swordWorldPowerRollModifier", "targetNumberAndRaiseStep", 
        "additiveModifier", "fudgeRoll", "carcosaRoll", "wegD6Roll", "term",
    ];

    public get grammarFileName(): string { return "R2.g4"; }
    public get literalNames(): (string | null)[] { return R2Parser.literalNames; }
    public get symbolicNames(): (string | null)[] { return R2Parser.symbolicNames; }
    public get ruleNames(): string[] { return R2Parser.ruleNames; }
    public get serializedATN(): number[] { return R2Parser._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, R2Parser._ATN, R2Parser.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public commandElement(): CommandElementContext {
        let localContext = new CommandElementContext(this.context, this.state);
        this.enterRule(localContext, 0, R2Parser.RULE_commandElement);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 34;
            this.statement();
            this.state = 39;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 0, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 35;
                    this.match(R2Parser.T__0);
                    this.state = 36;
                    this.statement();
                    }
                    }
                }
                this.state = 41;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 0, this.context);
            }
            this.state = 43;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 1) {
                {
                this.state = 42;
                this.match(R2Parser.T__0);
                }
            }

            this.state = 45;
            this.match(R2Parser.EOF);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public statement(): StatementContext {
        let localContext = new StatementContext(this.context, this.state);
        this.enterRule(localContext, 2, R2Parser.RULE_statement);
        let _la: number;
        try {
            this.state = 77;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 6, this.context) ) {
            case 1:
                localContext = new RollOnceStmtContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 47;
                (localContext as RollOnceStmtContext)._e = this.expression(0);
                }
                break;
            case 2:
                localContext = new RollTimesStmtContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 48;
                (localContext as RollTimesStmtContext)._n = this.term();
                this.state = 49;
                _la = this.tokenStream.LA(1);
                if(!(_la === 2 || _la === 3)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 50;
                (localContext as RollTimesStmtContext)._e = this.expression(0);
                }
                break;
            case 3:
                localContext = new RollBatchTimesStmtContext(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 52;
                (localContext as RollBatchTimesStmtContext)._n = this.term();
                this.state = 53;
                _la = this.tokenStream.LA(1);
                if(!(_la === 2 || _la === 3)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 54;
                this.match(R2Parser.T__3);
                this.state = 58;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 403636416) !== 0) || ((((_la - 33)) & ~0x1F) === 0 && ((1 << (_la - 33)) & 81788867) !== 0)) {
                    {
                    {
                    this.state = 55;
                    this.batchElement();
                    }
                    }
                    this.state = 60;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 61;
                this.match(R2Parser.T__4);
                }
                break;
            case 4:
                localContext = new RollSavageWorldsExtraStmtContext(localContext);
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 63;
                (localContext as RollSavageWorldsExtraStmtContext)._n = this.term();
                this.state = 64;
                _la = this.tokenStream.LA(1);
                if(!(_la === 6 || _la === 7)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 65;
                (localContext as RollSavageWorldsExtraStmtContext)._t1 = this.term();
                this.state = 67;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 39)) & ~0x1F) === 0 && ((1 << (_la - 39)) & 255) !== 0)) {
                    {
                    this.state = 66;
                    this.targetNumberAndRaiseStep();
                    }
                }

                this.state = 70;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 16 || _la === 17) {
                    {
                    this.state = 69;
                    this.additiveModifier();
                    }
                }

                }
                break;
            case 5:
                localContext = new IronSwornRollStmtContext(localContext);
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 72;
                _la = this.tokenStream.LA(1);
                if(!(_la === 8 || _la === 9)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 74;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 16 || _la === 17) {
                    {
                    this.state = 73;
                    this.additiveModifier();
                    }
                }

                }
                break;
            case 6:
                localContext = new FlagStmtContext(localContext);
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 76;
                (localContext as FlagStmtContext)._flag = this.match(R2Parser.FLAG);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public batchElement(): BatchElementContext {
        let localContext = new BatchElementContext(this.context, this.state);
        this.enterRule(localContext, 4, R2Parser.RULE_batchElement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 80;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 56) {
                {
                this.state = 79;
                localContext._comment = this.match(R2Parser.STRING);
                }
            }

            this.state = 82;
            localContext._e = this.expression(0);
            this.state = 84;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 1) {
                {
                this.state = 83;
                this.match(R2Parser.T__0);
                }
            }

            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public expression(): ExpressionContext;
    public expression(_p: number): ExpressionContext;
    public expression(_p?: number): ExpressionContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new ExpressionContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 6;
        this.enterRecursionRule(localContext, 6, R2Parser.RULE_expression, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 107;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 9, this.context) ) {
            case 1:
                {
                localContext = new GenericRollExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;

                this.state = 87;
                this.genericRoll();
                }
                break;
            case 2:
                {
                localContext = new SavageWorldsRollExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 88;
                this.savageWorldsRoll();
                }
                break;
            case 3:
                {
                localContext = new SavageWorldsExtrasRollExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 89;
                this.savageWorldsExtrasRoll();
                }
                break;
            case 4:
                {
                localContext = new FudgeRollExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 90;
                this.fudgeRoll();
                }
                break;
            case 5:
                {
                localContext = new CarcosaRollExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 91;
                this.carcosaRoll();
                }
                break;
            case 6:
                {
                localContext = new WegD6RollExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 92;
                this.wegD6Roll();
                }
                break;
            case 7:
                {
                localContext = new SwordWorldPowerRollExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 93;
                this.swordWorldPowerRoll();
                }
                break;
            case 8:
                {
                localContext = new TargetNumberAndRaiseStepExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 94;
                this.targetNumberAndRaiseStep();
                this.state = 95;
                this.match(R2Parser.T__9);
                this.state = 96;
                (localContext as TargetNumberAndRaiseStepExprContext)._e1 = this.expression(7);
                }
                break;
            case 9:
                {
                localContext = new AssignExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 98;
                (localContext as AssignExprContext)._v = this.match(R2Parser.VAR);
                this.state = 99;
                this.match(R2Parser.T__10);
                this.state = 100;
                (localContext as AssignExprContext)._e1 = this.expression(6);
                }
                break;
            case 10:
                {
                localContext = new GygaxRangeRollExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 101;
                (localContext as GygaxRangeRollExprContext)._g0 = this.match(R2Parser.INT);
                this.state = 102;
                this.match(R2Parser.T__14);
                this.state = 103;
                (localContext as GygaxRangeRollExprContext)._g1 = this.match(R2Parser.INT);
                }
                break;
            case 11:
                {
                localContext = new PrefixExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 104;
                (localContext as PrefixExprContext)._op = this.tokenStream.LT(1);
                _la = this.tokenStream.LA(1);
                if(!(_la === 16 || _la === 17)) {
                    (localContext as PrefixExprContext)._op = this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 105;
                (localContext as PrefixExprContext)._e1 = this.expression(2);
                }
                break;
            case 12:
                {
                localContext = new TermExprContext(localContext);
                this.context = localContext;
                previousContext = localContext;
                this.state = 106;
                (localContext as TermExprContext)._t = this.term();
                }
                break;
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 127;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 13, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 125;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 12, this.context) ) {
                    case 1:
                        {
                        localContext = new InfixExpr1Context(new ExpressionContext(parentContext, parentState));
                        (localContext as InfixExpr1Context)._e1 = previousContext;
                        this.pushNewRecursionContext(localContext, _startState, R2Parser.RULE_expression);
                        this.state = 109;
                        if (!(this.precpred(this.context, 5))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 5)");
                        }
                        this.state = 110;
                        (localContext as InfixExpr1Context)._op = this.tokenStream.LT(1);
                        _la = this.tokenStream.LA(1);
                        if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 28672) !== 0))) {
                            (localContext as InfixExpr1Context)._op = this.errorHandler.recoverInline(this);
                        }
                        else {
                            this.errorHandler.reportMatch(this);
                            this.consume();
                        }
                        this.state = 111;
                        (localContext as InfixExpr1Context)._e2 = this.expression(6);
                        }
                        break;
                    case 2:
                        {
                        localContext = new InfixExpr2Context(new ExpressionContext(parentContext, parentState));
                        (localContext as InfixExpr2Context)._e1 = previousContext;
                        this.pushNewRecursionContext(localContext, _startState, R2Parser.RULE_expression);
                        this.state = 112;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 113;
                        (localContext as InfixExpr2Context)._op = this.tokenStream.LT(1);
                        _la = this.tokenStream.LA(1);
                        if(!(_la === 16 || _la === 17)) {
                            (localContext as InfixExpr2Context)._op = this.errorHandler.recoverInline(this);
                        }
                        else {
                            this.errorHandler.reportMatch(this);
                            this.consume();
                        }
                        this.state = 114;
                        (localContext as InfixExpr2Context)._e2 = this.expression(4);
                        }
                        break;
                    case 3:
                        {
                        localContext = new BoundedExprContext(new ExpressionContext(parentContext, parentState));
                        (localContext as BoundedExprContext)._e1 = previousContext;
                        this.pushNewRecursionContext(localContext, _startState, R2Parser.RULE_expression);
                        this.state = 115;
                        if (!(this.precpred(this.context, 8))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 8)");
                        }
                        this.state = 116;
                        this.match(R2Parser.T__3);
                        this.state = 118;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 403636416) !== 0) || ((((_la - 33)) & ~0x1F) === 0 && ((1 << (_la - 33)) & 73400259) !== 0)) {
                            {
                            this.state = 117;
                            (localContext as BoundedExprContext)._e2 = this.expression(0);
                            }
                        }

                        this.state = 120;
                        this.match(R2Parser.T__9);
                        this.state = 122;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 403636416) !== 0) || ((((_la - 33)) & ~0x1F) === 0 && ((1 << (_la - 33)) & 73400259) !== 0)) {
                            {
                            this.state = 121;
                            (localContext as BoundedExprContext)._e3 = this.expression(0);
                            }
                        }

                        this.state = 124;
                        this.match(R2Parser.T__4);
                        }
                        break;
                    }
                    }
                }
                this.state = 129;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 13, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }
    public genericRoll(): GenericRollContext {
        let localContext = new GenericRollContext(this.context, this.state);
        this.enterRule(localContext, 8, R2Parser.RULE_genericRoll);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 131;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 69) !== 0)) {
                {
                this.state = 130;
                localContext._t1 = this.term();
                }
            }

            this.state = 133;
            _la = this.tokenStream.LA(1);
            if(!(_la === 18 || _la === 19)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            {
            this.state = 134;
            localContext._t2 = this.dieFacetsTerm();
            }
            this.state = 136;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 15, this.context) ) {
            case 1:
                {
                this.state = 135;
                localContext._excl = this.match(R2Parser.T__19);
                }
                break;
            }
            this.state = 139;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 16, this.context) ) {
            case 1:
                {
                this.state = 138;
                this.genericRollSuffix();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public dieFacetsTerm(): DieFacetsTermContext {
        let localContext = new DieFacetsTermContext(this.context, this.state);
        this.enterRule(localContext, 10, R2Parser.RULE_dieFacetsTerm);
        try {
            this.state = 143;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case R2Parser.T__52:
            case R2Parser.INT:
            case R2Parser.VAR:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 141;
                this.term();
                }
                break;
            case R2Parser.T__13:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 142;
                this.match(R2Parser.T__13);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public genericRollSuffix(): GenericRollSuffixContext {
        let localContext = new GenericRollSuffixContext(this.context, this.state);
        this.enterRule(localContext, 12, R2Parser.RULE_genericRollSuffix);
        let _la: number;
        try {
            this.state = 161;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case R2Parser.T__20:
            case R2Parser.T__21:
            case R2Parser.T__22:
            case R2Parser.T__23:
            case R2Parser.T__24:
            case R2Parser.T__25:
                localContext = new RollAndKeepSuffixContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 145;
                (localContext as RollAndKeepSuffixContext)._op = this.tokenStream.LT(1);
                _la = this.tokenStream.LA(1);
                if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 132120576) !== 0))) {
                    (localContext as RollAndKeepSuffixContext)._op = this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 147;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 18, this.context) ) {
                case 1:
                    {
                    this.state = 146;
                    (localContext as RollAndKeepSuffixContext)._n = this.term();
                    }
                    break;
                }
                }
                break;
            case R2Parser.T__26:
            case R2Parser.T__27:
                localContext = new SuccessOrFailSuffix1Context(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 149;
                (localContext as SuccessOrFailSuffix1Context)._sop = this.tokenStream.LT(1);
                _la = this.tokenStream.LA(1);
                if(!(_la === 27 || _la === 28)) {
                    (localContext as SuccessOrFailSuffix1Context)._sop = this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 150;
                (localContext as SuccessOrFailSuffix1Context)._sn = this.term();
                this.state = 153;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 19, this.context) ) {
                case 1:
                    {
                    this.state = 151;
                    (localContext as SuccessOrFailSuffix1Context)._fop = this.tokenStream.LT(1);
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 29 || _la === 30)) {
                        (localContext as SuccessOrFailSuffix1Context)._fop = this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    this.state = 152;
                    (localContext as SuccessOrFailSuffix1Context)._fn = this.term();
                    }
                    break;
                }
                }
                break;
            case R2Parser.T__28:
            case R2Parser.T__29:
                localContext = new SuccessOrFailSuffix2Context(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 155;
                (localContext as SuccessOrFailSuffix2Context)._fop = this.tokenStream.LT(1);
                _la = this.tokenStream.LA(1);
                if(!(_la === 29 || _la === 30)) {
                    (localContext as SuccessOrFailSuffix2Context)._fop = this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 156;
                (localContext as SuccessOrFailSuffix2Context)._fn = this.term();
                this.state = 157;
                (localContext as SuccessOrFailSuffix2Context)._sop = this.tokenStream.LT(1);
                _la = this.tokenStream.LA(1);
                if(!(_la === 27 || _la === 28)) {
                    (localContext as SuccessOrFailSuffix2Context)._sop = this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 158;
                (localContext as SuccessOrFailSuffix2Context)._sn = this.term();
                }
                break;
            case R2Parser.T__38:
            case R2Parser.T__39:
            case R2Parser.T__40:
            case R2Parser.T__41:
            case R2Parser.T__42:
            case R2Parser.T__43:
            case R2Parser.T__44:
            case R2Parser.T__45:
                localContext = new TargetNumberAndRaiseStepSuffixContext(localContext);
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 160;
                this.targetNumberAndRaiseStep();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public savageWorldsRoll(): SavageWorldsRollContext {
        let localContext = new SavageWorldsRollContext(this.context, this.state);
        this.enterRule(localContext, 14, R2Parser.RULE_savageWorldsRoll);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 164;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 69) !== 0)) {
                {
                this.state = 163;
                localContext._t1 = this.term();
                }
            }

            this.state = 166;
            _la = this.tokenStream.LA(1);
            if(!(_la === 27 || _la === 28)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 167;
            localContext._t2 = this.term();
            this.state = 170;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 22, this.context) ) {
            case 1:
                {
                this.state = 168;
                _la = this.tokenStream.LA(1);
                if(!(_la === 31 || _la === 32)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 169;
                localContext._t3 = this.term();
                }
                break;
            }
            this.state = 173;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 23, this.context) ) {
            case 1:
                {
                this.state = 172;
                this.targetNumberAndRaiseStep();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public savageWorldsExtrasRoll(): SavageWorldsExtrasRollContext {
        let localContext = new SavageWorldsExtrasRollContext(this.context, this.state);
        this.enterRule(localContext, 16, R2Parser.RULE_savageWorldsExtrasRoll);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 175;
            _la = this.tokenStream.LA(1);
            if(!(_la === 6 || _la === 7)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 176;
            localContext._t1 = this.term();
            this.state = 178;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 24, this.context) ) {
            case 1:
                {
                this.state = 177;
                this.targetNumberAndRaiseStep();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public swordWorldPowerRoll(): SwordWorldPowerRollContext {
        let localContext = new SwordWorldPowerRollContext(this.context, this.state);
        this.enterRule(localContext, 18, R2Parser.RULE_swordWorldPowerRoll);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 180;
            _la = this.tokenStream.LA(1);
            if(!(_la === 33 || _la === 34)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 181;
            localContext._tp = this.term();
            this.state = 185;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 25, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 182;
                    this.swordWorldPowerRollModifier();
                    }
                    }
                }
                this.state = 187;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 25, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public swordWorldPowerRollModifier(): SwordWorldPowerRollModifierContext {
        let localContext = new SwordWorldPowerRollModifierContext(this.context, this.state);
        this.enterRule(localContext, 20, R2Parser.RULE_swordWorldPowerRollModifier);
        let _la: number;
        try {
            this.state = 205;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case R2Parser.T__34:
            case R2Parser.T__35:
                localContext = new SwordWorldCriticalModifierContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 188;
                _la = this.tokenStream.LA(1);
                if(!(_la === 35 || _la === 36)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 189;
                (localContext as SwordWorldCriticalModifierContext)._tc = this.term();
                }
                break;
            case R2Parser.T__28:
            case R2Parser.T__29:
                localContext = new SwordWorldAutoFailModifierContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 190;
                _la = this.tokenStream.LA(1);
                if(!(_la === 29 || _la === 30)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 191;
                (localContext as SwordWorldAutoFailModifierContext)._tf = this.term();
                }
                break;
            case R2Parser.T__36:
            case R2Parser.T__37:
                localContext = new SwordWorldHumanSwordGraceModifierContext(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 192;
                (localContext as SwordWorldHumanSwordGraceModifierContext)._dop = this.tokenStream.LT(1);
                _la = this.tokenStream.LA(1);
                if(!(_la === 37 || _la === 38)) {
                    (localContext as SwordWorldHumanSwordGraceModifierContext)._dop = this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                }
                break;
            case R2Parser.T__3:
                localContext = new SwordWorldRollModifierContext(localContext);
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 193;
                this.match(R2Parser.T__3);
                this.state = 198;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 18 || _la === 19 || ((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 69) !== 0)) {
                    {
                    this.state = 195;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 69) !== 0)) {
                        {
                        this.state = 194;
                        (localContext as SwordWorldRollModifierContext)._td = this.term();
                        }
                    }

                    this.state = 197;
                    (localContext as SwordWorldRollModifierContext)._dop = this.tokenStream.LT(1);
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 18 || _la === 19)) {
                        (localContext as SwordWorldRollModifierContext)._dop = this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    }
                }

                this.state = 202;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 16 || _la === 17) {
                    {
                    this.state = 200;
                    (localContext as SwordWorldRollModifierContext)._mop = this.tokenStream.LT(1);
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 16 || _la === 17)) {
                        (localContext as SwordWorldRollModifierContext)._mop = this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    this.state = 201;
                    (localContext as SwordWorldRollModifierContext)._tm = this.term();
                    }
                }

                this.state = 204;
                this.match(R2Parser.T__4);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public targetNumberAndRaiseStep(): TargetNumberAndRaiseStepContext {
        let localContext = new TargetNumberAndRaiseStepContext(this.context, this.state);
        this.enterRule(localContext, 22, R2Parser.RULE_targetNumberAndRaiseStep);
        let _la: number;
        try {
            this.state = 226;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case R2Parser.T__38:
            case R2Parser.T__39:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 207;
                _la = this.tokenStream.LA(1);
                if(!(_la === 39 || _la === 40)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 208;
                localContext._tnr = this.term();
                }
                break;
            case R2Parser.T__40:
            case R2Parser.T__41:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 209;
                _la = this.tokenStream.LA(1);
                if(!(_la === 41 || _la === 42)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 210;
                localContext._tt = this.term();
                this.state = 213;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 30, this.context) ) {
                case 1:
                    {
                    this.state = 211;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 43 || _la === 44)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    this.state = 212;
                    localContext._tr = this.term();
                    }
                    break;
                }
                }
                break;
            case R2Parser.T__42:
            case R2Parser.T__43:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 215;
                _la = this.tokenStream.LA(1);
                if(!(_la === 43 || _la === 44)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 216;
                localContext._tr = this.term();
                this.state = 219;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 31, this.context) ) {
                case 1:
                    {
                    this.state = 217;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 41 || _la === 42)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    this.state = 218;
                    localContext._tt = this.term();
                    }
                    break;
                }
                }
                break;
            case R2Parser.T__44:
            case R2Parser.T__45:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 221;
                _la = this.tokenStream.LA(1);
                if(!(_la === 45 || _la === 46)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 222;
                localContext._tgtn = this.term();
                this.state = 224;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 32, this.context) ) {
                case 1:
                    {
                    this.state = 223;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 16 || _la === 17)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    }
                    break;
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public additiveModifier(): AdditiveModifierContext {
        let localContext = new AdditiveModifierContext(this.context, this.state);
        this.enterRule(localContext, 24, R2Parser.RULE_additiveModifier);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 228;
            localContext._op = this.tokenStream.LT(1);
            _la = this.tokenStream.LA(1);
            if(!(_la === 16 || _la === 17)) {
                localContext._op = this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 229;
            localContext._em = this.expression(0);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public fudgeRoll(): FudgeRollContext {
        let localContext = new FudgeRollContext(this.context, this.state);
        this.enterRule(localContext, 26, R2Parser.RULE_fudgeRoll);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 232;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 69) !== 0)) {
                {
                this.state = 231;
                localContext._t = this.term();
                }
            }

            this.state = 234;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 47)) & ~0x1F) === 0 && ((1 << (_la - 47)) & 7) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public carcosaRoll(): CarcosaRollContext {
        let localContext = new CarcosaRollContext(this.context, this.state);
        this.enterRule(localContext, 28, R2Parser.RULE_carcosaRoll);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 237;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 53)) & ~0x1F) === 0 && ((1 << (_la - 53)) & 69) !== 0)) {
                {
                this.state = 236;
                localContext._t = this.term();
                }
            }

            this.state = 239;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 50)) & ~0x1F) === 0 && ((1 << (_la - 50)) & 7) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public wegD6Roll(): WegD6RollContext {
        let localContext = new WegD6RollContext(this.context, this.state);
        this.enterRule(localContext, 30, R2Parser.RULE_wegD6Roll);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            {
            this.state = 241;
            localContext._t = this.term();
            }
            this.state = 242;
            _la = this.tokenStream.LA(1);
            if(!(_la === 31 || _la === 32)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public term(): TermContext {
        let localContext = new TermContext(this.context, this.state);
        this.enterRule(localContext, 32, R2Parser.RULE_term);
        let _la: number;
        try {
            this.state = 253;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case R2Parser.INT:
                localContext = new IntTermContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 244;
                (localContext as IntTermContext)._i = this.match(R2Parser.INT);
                }
                break;
            case R2Parser.VAR:
                localContext = new VarTermContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 245;
                (localContext as VarTermContext)._v = this.match(R2Parser.VAR);
                }
                break;
            case R2Parser.T__52:
                localContext = new ExprTermContext(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 246;
                this.match(R2Parser.T__52);
                this.state = 248;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 56) {
                    {
                    this.state = 247;
                    (localContext as ExprTermContext)._comment = this.match(R2Parser.STRING);
                    }
                }

                this.state = 250;
                (localContext as ExprTermContext)._e = this.expression(0);
                this.state = 251;
                this.match(R2Parser.T__53);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public override sempred(localContext: antlr.ParserRuleContext | null, ruleIndex: number, predIndex: number): boolean {
        switch (ruleIndex) {
        case 3:
            return this.expression_sempred(localContext as ExpressionContext, predIndex);
        }
        return true;
    }
    private expression_sempred(localContext: ExpressionContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 0:
            return this.precpred(this.context, 5);
        case 1:
            return this.precpred(this.context, 3);
        case 2:
            return this.precpred(this.context, 8);
        }
        return true;
    }

    public static readonly _serializedATN: number[] = [
        4,1,59,256,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,
        6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,13,
        2,14,7,14,2,15,7,15,2,16,7,16,1,0,1,0,1,0,5,0,38,8,0,10,0,12,0,41,
        9,0,1,0,3,0,44,8,0,1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,
        1,57,8,1,10,1,12,1,60,9,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,68,8,1,1,1,
        3,1,71,8,1,1,1,1,1,3,1,75,8,1,1,1,3,1,78,8,1,1,2,3,2,81,8,2,1,2,
        1,2,3,2,85,8,2,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,
        3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,3,3,108,8,3,1,3,1,3,1,3,1,3,1,
        3,1,3,1,3,1,3,1,3,3,3,119,8,3,1,3,1,3,3,3,123,8,3,1,3,5,3,126,8,
        3,10,3,12,3,129,9,3,1,4,3,4,132,8,4,1,4,1,4,1,4,3,4,137,8,4,1,4,
        3,4,140,8,4,1,5,1,5,3,5,144,8,5,1,6,1,6,3,6,148,8,6,1,6,1,6,1,6,
        1,6,3,6,154,8,6,1,6,1,6,1,6,1,6,1,6,1,6,3,6,162,8,6,1,7,3,7,165,
        8,7,1,7,1,7,1,7,1,7,3,7,171,8,7,1,7,3,7,174,8,7,1,8,1,8,1,8,3,8,
        179,8,8,1,9,1,9,1,9,5,9,184,8,9,10,9,12,9,187,9,9,1,10,1,10,1,10,
        1,10,1,10,1,10,1,10,3,10,196,8,10,1,10,3,10,199,8,10,1,10,1,10,3,
        10,203,8,10,1,10,3,10,206,8,10,1,11,1,11,1,11,1,11,1,11,1,11,3,11,
        214,8,11,1,11,1,11,1,11,1,11,3,11,220,8,11,1,11,1,11,1,11,3,11,225,
        8,11,3,11,227,8,11,1,12,1,12,1,12,1,13,3,13,233,8,13,1,13,1,13,1,
        14,3,14,238,8,14,1,14,1,14,1,15,1,15,1,15,1,16,1,16,1,16,1,16,3,
        16,249,8,16,1,16,1,16,1,16,3,16,254,8,16,1,16,0,1,6,17,0,2,4,6,8,
        10,12,14,16,18,20,22,24,26,28,30,32,0,19,1,0,2,3,1,0,6,7,1,0,8,9,
        1,0,16,17,1,0,12,14,1,0,18,19,1,0,21,26,1,0,27,28,1,0,29,30,1,0,
        31,32,1,0,33,34,1,0,35,36,1,0,37,38,1,0,39,40,1,0,41,42,1,0,43,44,
        1,0,45,46,1,0,47,49,1,0,50,52,298,0,34,1,0,0,0,2,77,1,0,0,0,4,80,
        1,0,0,0,6,107,1,0,0,0,8,131,1,0,0,0,10,143,1,0,0,0,12,161,1,0,0,
        0,14,164,1,0,0,0,16,175,1,0,0,0,18,180,1,0,0,0,20,205,1,0,0,0,22,
        226,1,0,0,0,24,228,1,0,0,0,26,232,1,0,0,0,28,237,1,0,0,0,30,241,
        1,0,0,0,32,253,1,0,0,0,34,39,3,2,1,0,35,36,5,1,0,0,36,38,3,2,1,0,
        37,35,1,0,0,0,38,41,1,0,0,0,39,37,1,0,0,0,39,40,1,0,0,0,40,43,1,
        0,0,0,41,39,1,0,0,0,42,44,5,1,0,0,43,42,1,0,0,0,43,44,1,0,0,0,44,
        45,1,0,0,0,45,46,5,0,0,1,46,1,1,0,0,0,47,78,3,6,3,0,48,49,3,32,16,
        0,49,50,7,0,0,0,50,51,3,6,3,0,51,78,1,0,0,0,52,53,3,32,16,0,53,54,
        7,0,0,0,54,58,5,4,0,0,55,57,3,4,2,0,56,55,1,0,0,0,57,60,1,0,0,0,
        58,56,1,0,0,0,58,59,1,0,0,0,59,61,1,0,0,0,60,58,1,0,0,0,61,62,5,
        5,0,0,62,78,1,0,0,0,63,64,3,32,16,0,64,65,7,1,0,0,65,67,3,32,16,
        0,66,68,3,22,11,0,67,66,1,0,0,0,67,68,1,0,0,0,68,70,1,0,0,0,69,71,
        3,24,12,0,70,69,1,0,0,0,70,71,1,0,0,0,71,78,1,0,0,0,72,74,7,2,0,
        0,73,75,3,24,12,0,74,73,1,0,0,0,74,75,1,0,0,0,75,78,1,0,0,0,76,78,
        5,58,0,0,77,47,1,0,0,0,77,48,1,0,0,0,77,52,1,0,0,0,77,63,1,0,0,0,
        77,72,1,0,0,0,77,76,1,0,0,0,78,3,1,0,0,0,79,81,5,56,0,0,80,79,1,
        0,0,0,80,81,1,0,0,0,81,82,1,0,0,0,82,84,3,6,3,0,83,85,5,1,0,0,84,
        83,1,0,0,0,84,85,1,0,0,0,85,5,1,0,0,0,86,87,6,3,-1,0,87,108,3,8,
        4,0,88,108,3,14,7,0,89,108,3,16,8,0,90,108,3,26,13,0,91,108,3,28,
        14,0,92,108,3,30,15,0,93,108,3,18,9,0,94,95,3,22,11,0,95,96,5,10,
        0,0,96,97,3,6,3,7,97,108,1,0,0,0,98,99,5,59,0,0,99,100,5,11,0,0,
        100,108,3,6,3,6,101,102,5,55,0,0,102,103,5,15,0,0,103,108,5,55,0,
        0,104,105,7,3,0,0,105,108,3,6,3,2,106,108,3,32,16,0,107,86,1,0,0,
        0,107,88,1,0,0,0,107,89,1,0,0,0,107,90,1,0,0,0,107,91,1,0,0,0,107,
        92,1,0,0,0,107,93,1,0,0,0,107,94,1,0,0,0,107,98,1,0,0,0,107,101,
        1,0,0,0,107,104,1,0,0,0,107,106,1,0,0,0,108,127,1,0,0,0,109,110,
        10,5,0,0,110,111,7,4,0,0,111,126,3,6,3,6,112,113,10,3,0,0,113,114,
        7,3,0,0,114,126,3,6,3,4,115,116,10,8,0,0,116,118,5,4,0,0,117,119,
        3,6,3,0,118,117,1,0,0,0,118,119,1,0,0,0,119,120,1,0,0,0,120,122,
        5,10,0,0,121,123,3,6,3,0,122,121,1,0,0,0,122,123,1,0,0,0,123,124,
        1,0,0,0,124,126,5,5,0,0,125,109,1,0,0,0,125,112,1,0,0,0,125,115,
        1,0,0,0,126,129,1,0,0,0,127,125,1,0,0,0,127,128,1,0,0,0,128,7,1,
        0,0,0,129,127,1,0,0,0,130,132,3,32,16,0,131,130,1,0,0,0,131,132,
        1,0,0,0,132,133,1,0,0,0,133,134,7,5,0,0,134,136,3,10,5,0,135,137,
        5,20,0,0,136,135,1,0,0,0,136,137,1,0,0,0,137,139,1,0,0,0,138,140,
        3,12,6,0,139,138,1,0,0,0,139,140,1,0,0,0,140,9,1,0,0,0,141,144,3,
        32,16,0,142,144,5,14,0,0,143,141,1,0,0,0,143,142,1,0,0,0,144,11,
        1,0,0,0,145,147,7,6,0,0,146,148,3,32,16,0,147,146,1,0,0,0,147,148,
        1,0,0,0,148,162,1,0,0,0,149,150,7,7,0,0,150,153,3,32,16,0,151,152,
        7,8,0,0,152,154,3,32,16,0,153,151,1,0,0,0,153,154,1,0,0,0,154,162,
        1,0,0,0,155,156,7,8,0,0,156,157,3,32,16,0,157,158,7,7,0,0,158,159,
        3,32,16,0,159,162,1,0,0,0,160,162,3,22,11,0,161,145,1,0,0,0,161,
        149,1,0,0,0,161,155,1,0,0,0,161,160,1,0,0,0,162,13,1,0,0,0,163,165,
        3,32,16,0,164,163,1,0,0,0,164,165,1,0,0,0,165,166,1,0,0,0,166,167,
        7,7,0,0,167,170,3,32,16,0,168,169,7,9,0,0,169,171,3,32,16,0,170,
        168,1,0,0,0,170,171,1,0,0,0,171,173,1,0,0,0,172,174,3,22,11,0,173,
        172,1,0,0,0,173,174,1,0,0,0,174,15,1,0,0,0,175,176,7,1,0,0,176,178,
        3,32,16,0,177,179,3,22,11,0,178,177,1,0,0,0,178,179,1,0,0,0,179,
        17,1,0,0,0,180,181,7,10,0,0,181,185,3,32,16,0,182,184,3,20,10,0,
        183,182,1,0,0,0,184,187,1,0,0,0,185,183,1,0,0,0,185,186,1,0,0,0,
        186,19,1,0,0,0,187,185,1,0,0,0,188,189,7,11,0,0,189,206,3,32,16,
        0,190,191,7,8,0,0,191,206,3,32,16,0,192,206,7,12,0,0,193,198,5,4,
        0,0,194,196,3,32,16,0,195,194,1,0,0,0,195,196,1,0,0,0,196,197,1,
        0,0,0,197,199,7,5,0,0,198,195,1,0,0,0,198,199,1,0,0,0,199,202,1,
        0,0,0,200,201,7,3,0,0,201,203,3,32,16,0,202,200,1,0,0,0,202,203,
        1,0,0,0,203,204,1,0,0,0,204,206,5,5,0,0,205,188,1,0,0,0,205,190,
        1,0,0,0,205,192,1,0,0,0,205,193,1,0,0,0,206,21,1,0,0,0,207,208,7,
        13,0,0,208,227,3,32,16,0,209,210,7,14,0,0,210,213,3,32,16,0,211,
        212,7,15,0,0,212,214,3,32,16,0,213,211,1,0,0,0,213,214,1,0,0,0,214,
        227,1,0,0,0,215,216,7,15,0,0,216,219,3,32,16,0,217,218,7,14,0,0,
        218,220,3,32,16,0,219,217,1,0,0,0,219,220,1,0,0,0,220,227,1,0,0,
        0,221,222,7,16,0,0,222,224,3,32,16,0,223,225,7,3,0,0,224,223,1,0,
        0,0,224,225,1,0,0,0,225,227,1,0,0,0,226,207,1,0,0,0,226,209,1,0,
        0,0,226,215,1,0,0,0,226,221,1,0,0,0,227,23,1,0,0,0,228,229,7,3,0,
        0,229,230,3,6,3,0,230,25,1,0,0,0,231,233,3,32,16,0,232,231,1,0,0,
        0,232,233,1,0,0,0,233,234,1,0,0,0,234,235,7,17,0,0,235,27,1,0,0,
        0,236,238,3,32,16,0,237,236,1,0,0,0,237,238,1,0,0,0,238,239,1,0,
        0,0,239,240,7,18,0,0,240,29,1,0,0,0,241,242,3,32,16,0,242,243,7,
        9,0,0,243,31,1,0,0,0,244,254,5,55,0,0,245,254,5,59,0,0,246,248,5,
        53,0,0,247,249,5,56,0,0,248,247,1,0,0,0,248,249,1,0,0,0,249,250,
        1,0,0,0,250,251,3,6,3,0,251,252,5,54,0,0,252,254,1,0,0,0,253,244,
        1,0,0,0,253,245,1,0,0,0,253,246,1,0,0,0,254,33,1,0,0,0,38,39,43,
        58,67,70,74,77,80,84,107,118,122,125,127,131,136,139,143,147,153,
        161,164,170,173,178,185,195,198,202,205,213,219,224,226,232,237,
        248,253
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!R2Parser.__ATN) {
            R2Parser.__ATN = new antlr.ATNDeserializer().deserialize(R2Parser._serializedATN);
        }

        return R2Parser.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(R2Parser.literalNames, R2Parser.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return R2Parser.vocabulary;
    }

    private static readonly decisionsToDFA = R2Parser._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class CommandElementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public statement(): StatementContext[];
    public statement(i: number): StatementContext | null;
    public statement(i?: number): StatementContext[] | StatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(StatementContext);
        }

        return this.getRuleContext(i, StatementContext);
    }
    public EOF(): antlr.TerminalNode {
        return this.getToken(R2Parser.EOF, 0)!;
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_commandElement;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitCommandElement) {
            return visitor.visitCommandElement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class StatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_statement;
    }
    public override copyFrom(ctx: StatementContext): void {
        super.copyFrom(ctx);
    }
}
export class RollTimesStmtContext extends StatementContext {
    public _n?: TermContext;
    public _e?: ExpressionContext;
    public constructor(ctx: StatementContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitRollTimesStmt) {
            return visitor.visitRollTimesStmt(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class RollBatchTimesStmtContext extends StatementContext {
    public _n?: TermContext;
    public constructor(ctx: StatementContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public batchElement(): BatchElementContext[];
    public batchElement(i: number): BatchElementContext | null;
    public batchElement(i?: number): BatchElementContext[] | BatchElementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(BatchElementContext);
        }

        return this.getRuleContext(i, BatchElementContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitRollBatchTimesStmt) {
            return visitor.visitRollBatchTimesStmt(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class IronSwornRollStmtContext extends StatementContext {
    public constructor(ctx: StatementContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public additiveModifier(): AdditiveModifierContext | null {
        return this.getRuleContext(0, AdditiveModifierContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitIronSwornRollStmt) {
            return visitor.visitIronSwornRollStmt(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class FlagStmtContext extends StatementContext {
    public _flag?: Token | null;
    public constructor(ctx: StatementContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public FLAG(): antlr.TerminalNode {
        return this.getToken(R2Parser.FLAG, 0)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitFlagStmt) {
            return visitor.visitFlagStmt(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class RollOnceStmtContext extends StatementContext {
    public _e?: ExpressionContext;
    public constructor(ctx: StatementContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitRollOnceStmt) {
            return visitor.visitRollOnceStmt(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class RollSavageWorldsExtraStmtContext extends StatementContext {
    public _n?: TermContext;
    public _t1?: TermContext;
    public constructor(ctx: StatementContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext[];
    public term(i: number): TermContext | null;
    public term(i?: number): TermContext[] | TermContext | null {
        if (i === undefined) {
            return this.getRuleContexts(TermContext);
        }

        return this.getRuleContext(i, TermContext);
    }
    public targetNumberAndRaiseStep(): TargetNumberAndRaiseStepContext | null {
        return this.getRuleContext(0, TargetNumberAndRaiseStepContext);
    }
    public additiveModifier(): AdditiveModifierContext | null {
        return this.getRuleContext(0, AdditiveModifierContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitRollSavageWorldsExtraStmt) {
            return visitor.visitRollSavageWorldsExtraStmt(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class BatchElementContext extends antlr.ParserRuleContext {
    public _comment?: Token | null;
    public _e?: ExpressionContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(R2Parser.STRING, 0);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_batchElement;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitBatchElement) {
            return visitor.visitBatchElement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_expression;
    }
    public override copyFrom(ctx: ExpressionContext): void {
        super.copyFrom(ctx);
    }
}
export class TermExprContext extends ExpressionContext {
    public _t?: TermContext;
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitTermExpr) {
            return visitor.visitTermExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class SavageWorldsRollExprContext extends ExpressionContext {
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public savageWorldsRoll(): SavageWorldsRollContext {
        return this.getRuleContext(0, SavageWorldsRollContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSavageWorldsRollExpr) {
            return visitor.visitSavageWorldsRollExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class SwordWorldPowerRollExprContext extends ExpressionContext {
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public swordWorldPowerRoll(): SwordWorldPowerRollContext {
        return this.getRuleContext(0, SwordWorldPowerRollContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSwordWorldPowerRollExpr) {
            return visitor.visitSwordWorldPowerRollExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class InfixExpr2Context extends ExpressionContext {
    public _e1?: ExpressionContext;
    public _op?: Token | null;
    public _e2?: ExpressionContext;
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitInfixExpr2) {
            return visitor.visitInfixExpr2(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class InfixExpr1Context extends ExpressionContext {
    public _e1?: ExpressionContext;
    public _op?: Token | null;
    public _e2?: ExpressionContext;
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitInfixExpr1) {
            return visitor.visitInfixExpr1(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class TargetNumberAndRaiseStepExprContext extends ExpressionContext {
    public _e1?: ExpressionContext;
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public targetNumberAndRaiseStep(): TargetNumberAndRaiseStepContext {
        return this.getRuleContext(0, TargetNumberAndRaiseStepContext)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitTargetNumberAndRaiseStepExpr) {
            return visitor.visitTargetNumberAndRaiseStepExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class CarcosaRollExprContext extends ExpressionContext {
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public carcosaRoll(): CarcosaRollContext {
        return this.getRuleContext(0, CarcosaRollContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitCarcosaRollExpr) {
            return visitor.visitCarcosaRollExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class SavageWorldsExtrasRollExprContext extends ExpressionContext {
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public savageWorldsExtrasRoll(): SavageWorldsExtrasRollContext {
        return this.getRuleContext(0, SavageWorldsExtrasRollContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSavageWorldsExtrasRollExpr) {
            return visitor.visitSavageWorldsExtrasRollExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class AssignExprContext extends ExpressionContext {
    public _v?: Token | null;
    public _e1?: ExpressionContext;
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public VAR(): antlr.TerminalNode {
        return this.getToken(R2Parser.VAR, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitAssignExpr) {
            return visitor.visitAssignExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class PrefixExprContext extends ExpressionContext {
    public _op?: Token | null;
    public _e1?: ExpressionContext;
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitPrefixExpr) {
            return visitor.visitPrefixExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class BoundedExprContext extends ExpressionContext {
    public _e1?: ExpressionContext;
    public _e2?: ExpressionContext;
    public _e3?: ExpressionContext;
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitBoundedExpr) {
            return visitor.visitBoundedExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class GygaxRangeRollExprContext extends ExpressionContext {
    public _g0?: Token | null;
    public _g1?: Token | null;
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public INT(): antlr.TerminalNode[];
    public INT(i: number): antlr.TerminalNode | null;
    public INT(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(R2Parser.INT);
    	} else {
    		return this.getToken(R2Parser.INT, i);
    	}
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitGygaxRangeRollExpr) {
            return visitor.visitGygaxRangeRollExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class GenericRollExprContext extends ExpressionContext {
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public genericRoll(): GenericRollContext {
        return this.getRuleContext(0, GenericRollContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitGenericRollExpr) {
            return visitor.visitGenericRollExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class WegD6RollExprContext extends ExpressionContext {
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public wegD6Roll(): WegD6RollContext {
        return this.getRuleContext(0, WegD6RollContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitWegD6RollExpr) {
            return visitor.visitWegD6RollExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class FudgeRollExprContext extends ExpressionContext {
    public constructor(ctx: ExpressionContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public fudgeRoll(): FudgeRollContext {
        return this.getRuleContext(0, FudgeRollContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitFudgeRollExpr) {
            return visitor.visitFudgeRollExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class GenericRollContext extends antlr.ParserRuleContext {
    public _t1?: TermContext;
    public _t2?: DieFacetsTermContext;
    public _excl?: Token | null;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public dieFacetsTerm(): DieFacetsTermContext | null {
        return this.getRuleContext(0, DieFacetsTermContext);
    }
    public genericRollSuffix(): GenericRollSuffixContext | null {
        return this.getRuleContext(0, GenericRollSuffixContext);
    }
    public term(): TermContext | null {
        return this.getRuleContext(0, TermContext);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_genericRoll;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitGenericRoll) {
            return visitor.visitGenericRoll(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class DieFacetsTermContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public term(): TermContext | null {
        return this.getRuleContext(0, TermContext);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_dieFacetsTerm;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitDieFacetsTerm) {
            return visitor.visitDieFacetsTerm(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class GenericRollSuffixContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_genericRollSuffix;
    }
    public override copyFrom(ctx: GenericRollSuffixContext): void {
        super.copyFrom(ctx);
    }
}
export class TargetNumberAndRaiseStepSuffixContext extends GenericRollSuffixContext {
    public constructor(ctx: GenericRollSuffixContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public targetNumberAndRaiseStep(): TargetNumberAndRaiseStepContext {
        return this.getRuleContext(0, TargetNumberAndRaiseStepContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitTargetNumberAndRaiseStepSuffix) {
            return visitor.visitTargetNumberAndRaiseStepSuffix(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class RollAndKeepSuffixContext extends GenericRollSuffixContext {
    public _op?: Token | null;
    public _n?: TermContext;
    public constructor(ctx: GenericRollSuffixContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext | null {
        return this.getRuleContext(0, TermContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitRollAndKeepSuffix) {
            return visitor.visitRollAndKeepSuffix(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class SuccessOrFailSuffix1Context extends GenericRollSuffixContext {
    public _sop?: Token | null;
    public _sn?: TermContext;
    public _fop?: Token | null;
    public _fn?: TermContext;
    public constructor(ctx: GenericRollSuffixContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext[];
    public term(i: number): TermContext | null;
    public term(i?: number): TermContext[] | TermContext | null {
        if (i === undefined) {
            return this.getRuleContexts(TermContext);
        }

        return this.getRuleContext(i, TermContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSuccessOrFailSuffix1) {
            return visitor.visitSuccessOrFailSuffix1(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class SuccessOrFailSuffix2Context extends GenericRollSuffixContext {
    public _fop?: Token | null;
    public _fn?: TermContext;
    public _sop?: Token | null;
    public _sn?: TermContext;
    public constructor(ctx: GenericRollSuffixContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext[];
    public term(i: number): TermContext | null;
    public term(i?: number): TermContext[] | TermContext | null {
        if (i === undefined) {
            return this.getRuleContexts(TermContext);
        }

        return this.getRuleContext(i, TermContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSuccessOrFailSuffix2) {
            return visitor.visitSuccessOrFailSuffix2(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class SavageWorldsRollContext extends antlr.ParserRuleContext {
    public _t1?: TermContext;
    public _t2?: TermContext;
    public _t3?: TermContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public term(): TermContext[];
    public term(i: number): TermContext | null;
    public term(i?: number): TermContext[] | TermContext | null {
        if (i === undefined) {
            return this.getRuleContexts(TermContext);
        }

        return this.getRuleContext(i, TermContext);
    }
    public targetNumberAndRaiseStep(): TargetNumberAndRaiseStepContext | null {
        return this.getRuleContext(0, TargetNumberAndRaiseStepContext);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_savageWorldsRoll;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSavageWorldsRoll) {
            return visitor.visitSavageWorldsRoll(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class SavageWorldsExtrasRollContext extends antlr.ParserRuleContext {
    public _t1?: TermContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public targetNumberAndRaiseStep(): TargetNumberAndRaiseStepContext | null {
        return this.getRuleContext(0, TargetNumberAndRaiseStepContext);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_savageWorldsExtrasRoll;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSavageWorldsExtrasRoll) {
            return visitor.visitSavageWorldsExtrasRoll(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class SwordWorldPowerRollContext extends antlr.ParserRuleContext {
    public _tp?: TermContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public swordWorldPowerRollModifier(): SwordWorldPowerRollModifierContext[];
    public swordWorldPowerRollModifier(i: number): SwordWorldPowerRollModifierContext | null;
    public swordWorldPowerRollModifier(i?: number): SwordWorldPowerRollModifierContext[] | SwordWorldPowerRollModifierContext | null {
        if (i === undefined) {
            return this.getRuleContexts(SwordWorldPowerRollModifierContext);
        }

        return this.getRuleContext(i, SwordWorldPowerRollModifierContext);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_swordWorldPowerRoll;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSwordWorldPowerRoll) {
            return visitor.visitSwordWorldPowerRoll(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class SwordWorldPowerRollModifierContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_swordWorldPowerRollModifier;
    }
    public override copyFrom(ctx: SwordWorldPowerRollModifierContext): void {
        super.copyFrom(ctx);
    }
}
export class SwordWorldHumanSwordGraceModifierContext extends SwordWorldPowerRollModifierContext {
    public _dop?: Token | null;
    public constructor(ctx: SwordWorldPowerRollModifierContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSwordWorldHumanSwordGraceModifier) {
            return visitor.visitSwordWorldHumanSwordGraceModifier(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class SwordWorldCriticalModifierContext extends SwordWorldPowerRollModifierContext {
    public _tc?: TermContext;
    public constructor(ctx: SwordWorldPowerRollModifierContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSwordWorldCriticalModifier) {
            return visitor.visitSwordWorldCriticalModifier(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class SwordWorldAutoFailModifierContext extends SwordWorldPowerRollModifierContext {
    public _tf?: TermContext;
    public constructor(ctx: SwordWorldPowerRollModifierContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext {
        return this.getRuleContext(0, TermContext)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSwordWorldAutoFailModifier) {
            return visitor.visitSwordWorldAutoFailModifier(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class SwordWorldRollModifierContext extends SwordWorldPowerRollModifierContext {
    public _td?: TermContext;
    public _dop?: Token | null;
    public _mop?: Token | null;
    public _tm?: TermContext;
    public constructor(ctx: SwordWorldPowerRollModifierContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public term(): TermContext[];
    public term(i: number): TermContext | null;
    public term(i?: number): TermContext[] | TermContext | null {
        if (i === undefined) {
            return this.getRuleContexts(TermContext);
        }

        return this.getRuleContext(i, TermContext);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitSwordWorldRollModifier) {
            return visitor.visitSwordWorldRollModifier(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class TargetNumberAndRaiseStepContext extends antlr.ParserRuleContext {
    public _tnr?: TermContext;
    public _tt?: TermContext;
    public _tr?: TermContext;
    public _tgtn?: TermContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public term(): TermContext[];
    public term(i: number): TermContext | null;
    public term(i?: number): TermContext[] | TermContext | null {
        if (i === undefined) {
            return this.getRuleContexts(TermContext);
        }

        return this.getRuleContext(i, TermContext);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_targetNumberAndRaiseStep;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitTargetNumberAndRaiseStep) {
            return visitor.visitTargetNumberAndRaiseStep(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class AdditiveModifierContext extends antlr.ParserRuleContext {
    public _op?: Token | null;
    public _em?: ExpressionContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_additiveModifier;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitAdditiveModifier) {
            return visitor.visitAdditiveModifier(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class FudgeRollContext extends antlr.ParserRuleContext {
    public _t?: TermContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public term(): TermContext | null {
        return this.getRuleContext(0, TermContext);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_fudgeRoll;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitFudgeRoll) {
            return visitor.visitFudgeRoll(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class CarcosaRollContext extends antlr.ParserRuleContext {
    public _t?: TermContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public term(): TermContext | null {
        return this.getRuleContext(0, TermContext);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_carcosaRoll;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitCarcosaRoll) {
            return visitor.visitCarcosaRoll(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class WegD6RollContext extends antlr.ParserRuleContext {
    public _t?: TermContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public term(): TermContext | null {
        return this.getRuleContext(0, TermContext);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_wegD6Roll;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitWegD6Roll) {
            return visitor.visitWegD6Roll(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class TermContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return R2Parser.RULE_term;
    }
    public override copyFrom(ctx: TermContext): void {
        super.copyFrom(ctx);
    }
}
export class ExprTermContext extends TermContext {
    public _comment?: Token | null;
    public _e?: ExpressionContext;
    public constructor(ctx: TermContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(R2Parser.STRING, 0);
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitExprTerm) {
            return visitor.visitExprTerm(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class IntTermContext extends TermContext {
    public _i?: Token | null;
    public constructor(ctx: TermContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public INT(): antlr.TerminalNode {
        return this.getToken(R2Parser.INT, 0)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitIntTerm) {
            return visitor.visitIntTerm(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class VarTermContext extends TermContext {
    public _v?: Token | null;
    public constructor(ctx: TermContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public VAR(): antlr.TerminalNode {
        return this.getToken(R2Parser.VAR, 0)!;
    }
    public override accept<Result>(visitor: R2Visitor<Result>): Result | null {
        if (visitor.visitVarTerm) {
            return visitor.visitVarTerm(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
