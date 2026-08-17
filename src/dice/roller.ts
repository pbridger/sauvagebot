/**
 * Port of `org.alessio29.savagebot.r2.eval.Roller`.
 *
 * Kept deliberately close to the Java original — same method names, same ordering of RNG calls —
 * because the conformance corpus compares output byte for byte. Any reordering of `roll()` calls
 * changes the dice sequence even though the logic looks equivalent.
 */

import { JavaRandom } from './javaRandom.js';
import type { SuffixOperator } from './ast.js';
import {
  EvaluationError,
  byValue,
  byValueDescending,
  intResult,
  type IntListResult,
  type IntResult,
} from './results.js';

/** Discord strikeout, as produced by the Java `ReplyBuilder.strikeout`. */
function strikeout(text: string): string {
  return `~~${text}~~`;
}

/**
 * What part a die played, for anything that wants to draw it differently.
 *
 * `'wild'` is the Savage Worlds Wild Die and the WEG d6 wild die — the one die in
 * a roll that is not the character's own trait.
 */
export type DieRole = 'trait' | 'wild' | 'plain';

/**
 * One die, as it was actually rolled.
 *
 * This exists for the animated tray, which needs `(sides, value)` pairs rather
 * than the explanation string, and needs to know which die bought which — the
 * whole point of animating an ace is that the extra die arrives *after* the one
 * that earned it.
 */
export interface DieEvent {
  sides: number;
  value: number;
  /** Dice of one exploding chain share this. Numbered from 1 within a roller. */
  chain: number;
  /** 0 for the first die of a chain, 1 for the die its ace bought, and so on. */
  step: number;
  role: DieRole;
}

/**
 * Told about every die as it is rolled.
 *
 * **Must be passive.** It may not touch the RNG, reorder anything, or throw: the
 * conformance corpus compares this engine's output byte for byte against the Java
 * original, and an observer with side effects would be a way to break that from
 * the outside. Emission happens after the die is rolled, so a throwing observer
 * could not change a value — only lose the roll, which is why the emit site
 * swallows nothing and callers are expected to keep this trivial.
 */
export type DieObserver = (die: DieEvent) => void;

export class Roller {
  /**
   * Chain bookkeeping for the observer. Nothing here is read by the roll logic,
   * so it cannot affect a result — see the corpus test.
   */
  private chains = 0;
  private step = 0;
  private inChain = false;
  private role: DieRole = 'plain';

  constructor(
    private readonly random: JavaRandom,
    private readonly observer?: DieObserver,
  ) {}

  /** `public int roll(int facetsCount)` */
  rollDie(facetsCount: number): number {
    if (facetsCount <= 0) {
      throw new EvaluationError(`Facets count should be >0: ${facetsCount}`);
    }
    const value = this.random.nextInt(facetsCount) + 1;
    if (this.observer) {
      // A bare `rollDie` — d66 digits, the Carcosa d20, WEG's regular dice — is a
      // chain of one. Only `roll()` can open a longer one.
      if (!this.inChain) {
        this.chains++;
        this.step = 0;
      }
      this.observer({
        sides: facetsCount,
        value,
        chain: this.chains,
        step: this.step,
        role: this.role,
      });
      this.step++;
    }
    return value;
  }

  /**
   * Tag the dice rolled inside `body`, so the Wild Die can be told from the
   * trait die on screen. Restores the previous role even if `body` throws.
   */
  private as<T>(role: DieRole, body: () => T): T {
    const previous = this.role;
    this.role = role;
    try {
      return body();
    } finally {
      this.role = previous;
    }
  }

  /**
   * `public IntResult roll(int facetsCount, boolean isOpenEnded)`
   *
   * The explanation is the full chain of dice (`6+6+4`), not just the total. The Java original
   * built this string and then discarded it — a bug fixed upstream in this fork.
   */
  roll(facetsCount: number, isOpenEnded: boolean): IntResult {
    // The loop below *is* the exploding chain, which is why the observer is tapped
    // here rather than at the RNG: everything downstream would otherwise have to
    // re-derive "that die showed its maximum, so the next one is its ace".
    this.chains++;
    this.step = 0;
    this.inChain = true;
    try {
      return this.rollChain(facetsCount, isOpenEnded);
    } finally {
      this.inChain = false;
    }
  }

  private rollChain(facetsCount: number, isOpenEnded: boolean): IntResult {
    let total = 0;
    const explained: string[] = [];

    for (;;) {
      const die = this.rollDie(facetsCount);
      total += die;
      explained.push(String(die));
      if (!isOpenEnded || die !== facetsCount || facetsCount === 1) {
        break;
      }
    }

    return intResult(total, explained.join('+'));
  }

  /**
   * Fudge dice, and the one die that reaches the RNG without going through
   * `rollDie` — so it tells the observer nothing, deliberately. A `nextInt(3)`
   * looks exactly like a d3 from the outside, and a d3 is not a die the tray can
   * draw. A Fudge roll therefore animates nothing and its result appears at once,
   * which is the right behaviour for a die this game does not use.
   */
  private rollDF(): number {
    return this.random.nextInt(3) - 1;
  }

  /** `public IntResult roll(int diceCount, int facetsCount)` */
  rollDice(diceCount: number, facetsCount: number): IntResult {
    return this.rollAndKeep(diceCount, facetsCount, false, undefined, 0);
  }

  rollAndKeep(
    dieCount: number,
    facetsCount: number,
    isOpenEnded: boolean,
    suffixOperator: SuffixOperator | undefined,
    suffixArg: number,
  ): IntResult {
    let nDice = dieCount;
    if (suffixOperator === 'ADVANTAGE' || suffixOperator === 'DISADVANTAGE') {
      nDice += suffixArg;
    }

    let keptDice = dieCount;
    if (suffixOperator === 'KEEP' || suffixOperator === 'KEEP_LEAST') {
      keptDice = suffixArg;
    }

    if (facetsCount === 1) {
      return intResult(keptDice, String(keptDice));
    }

    const dice: IntResult[] = [];
    for (let i = 0; i < nDice; i++) {
      dice.push(this.roll(facetsCount, isOpenEnded));
    }

    if (keptDice !== nDice) {
      dice.sort(byValue);
    }

    let keptStart = 0;
    if (suffixOperator === 'ADVANTAGE' || suffixOperator === 'KEEP') {
      keptStart = nDice - keptDice;
    }

    let keptEndExclusive = nDice;
    if (suffixOperator === 'DISADVANTAGE' || suffixOperator === 'KEEP_LEAST') {
      keptEndExclusive = keptDice;
    }

    let total = 0;
    const explained: string[] = [];

    for (let i = 0; i < nDice; i++) {
      const die = dice[i]!;
      if (i >= keptStart && i < keptEndExclusive) {
        total += die.value;
        explained.push(die.explained);
      } else {
        explained.push(strikeout(die.explained));
      }
    }

    return intResult(total, explained.join(' + '));
  }

  rollFudge(diceCount: number): IntResult {
    let total = 0;
    let explained = '[';
    for (let i = 0; i < diceCount; i++) {
      const die = this.rollDF();
      total += die;
      if (die === -1) explained += '-';
      else if (die === 1) explained += '+';
      else if (die === 0) explained += '0';
    }
    explained += ']';
    return intResult(total, explained);
  }

  /**
   * Savage Worlds trait roll: roll the trait die(s) and a Wild Die, all exploding, then drop the
   * single lowest across the whole set. For the common `s8` (diceCount 1) that means "keep the
   * better of trait die and Wild Die".
   */
  rollSavageWorlds(
    diceCount: number,
    abilityDieFacets: number,
    wildDieFacets: number,
  ): IntListResult {
    const abilityDice: IntResult[] = [];
    for (let i = 0; i < diceCount; i++) {
      abilityDice.push(this.as('trait', () => this.roll(abilityDieFacets, true)));
    }
    abilityDice.sort(byValue);

    const wildDie = this.as('wild', () => this.roll(wildDieFacets, true));

    let explained = '[';
    for (const die of abilityDice) {
      explained += `${die.explained}; `;
    }
    explained += `w${wildDie.explained}]`;

    const allDice = [...abilityDice, wildDie];
    allDice.sort(byValue);

    const values = allDice.slice(1).map((d) => d.value);
    return { values, explained };
  }

  rollD66(digitsCount: number): IntResult {
    let total = 0;
    for (let i = 0; i < digitsCount; i++) {
      total = total * 10 + this.rollDie(6);
    }
    return intResult(total, String(total));
  }

  rollSuccessOrFail(
    diceCount: number,
    facetsCount: number,
    isOpenEnded: boolean,
    successThreshold: number,
    failThreshold: number,
  ): IntResult {
    const dice: IntResult[] = [];
    for (let i = 0; i < diceCount; i++) {
      dice.push(this.roll(facetsCount, isOpenEnded));
    }
    dice.sort(byValueDescending);

    const successes: IntResult[] = [];
    const failures: IntResult[] = [];
    const neutral: IntResult[] = [];
    for (const die of dice) {
      if (die.value >= successThreshold) successes.push(die);
      else if (die.value <= failThreshold) failures.push(die);
      else neutral.push(die);
    }

    const parts: string[] = [];
    if (successes.length > 0) {
      parts.push(`successes(${successes.length}): ${commaSeparated(successes)}`);
    }
    if (failures.length > 0) {
      parts.push(`failures(${failures.length}): ${commaSeparated(failures)}`);
    }
    if (neutral.length > 0) {
      parts.push(`rest: ${commaSeparated(neutral)}`);
    }

    return intResult(successes.length - failures.length, `[${parts.join('; ')}]`);
  }

  rollCarcosa(diceCount: number): IntResult {
    const d20 = this.rollDie(20);
    let die: number;
    if (d20 <= 4) die = 4;
    else if (d20 <= 8) die = 6;
    else if (d20 <= 12) die = 8;
    else if (d20 <= 16) die = 10;
    else die = 12;

    const rollResult = this.rollAndKeep(diceCount, die, false, undefined, 0);
    return intResult(rollResult.value, `[${diceCount}d${die}] ${rollResult.explained}`);
  }

  /** WEG D6: one Wild Die; on a 1 it and the highest regular die are struck out. */
  rollWegD6(diceCount: number): IntResult {
    if (diceCount < 1) {
      throw new EvaluationError(`Dice count should be at least 1: ${diceCount}`);
    }

    const wildDieValue = this.as('wild', () => this.roll(6, true)).value;

    const regularDiceValues: number[] = [];
    for (let i = 0; i < diceCount - 1; i++) {
      regularDiceValues.push(this.rollDie(6));
    }

    let crossedOutValue: number;
    let total: number;
    if (wildDieValue === 1) {
      if (diceCount === 1) {
        return intResult(0, strikeout('1'));
      }
      crossedOutValue = Math.max(...regularDiceValues);
      total = 0;
    } else {
      crossedOutValue = -1;
      total = wildDieValue;
    }

    const parts: string[] = [];
    if (wildDieValue !== 1) {
      parts.push(`w${wildDieValue}`);
    }

    let crossedOut = false;
    for (const regularDieValue of regularDiceValues) {
      if (!crossedOut && regularDieValue === crossedOutValue) {
        crossedOut = true;
        parts.push(strikeout(String(regularDieValue)));
      } else {
        total += regularDieValue;
        parts.push(String(regularDieValue));
      }
    }

    const joined = parts.join(' + ');
    return wildDieValue === 1 ? intResult(total, `w1; ${joined}`) : intResult(total, joined);
  }
}

function commaSeparated(results: IntResult[]): string {
  return results.map((r) => r.explained).join(', ');
}
