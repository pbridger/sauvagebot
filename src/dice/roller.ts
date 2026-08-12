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

export class Roller {
  constructor(private readonly random: JavaRandom) {}

  /** `public int roll(int facetsCount)` */
  rollDie(facetsCount: number): number {
    if (facetsCount <= 0) {
      throw new EvaluationError(`Facets count should be >0: ${facetsCount}`);
    }
    return this.random.nextInt(facetsCount) + 1;
  }

  /**
   * `public IntResult roll(int facetsCount, boolean isOpenEnded)`
   *
   * The explanation is the full chain of dice (`6+6+4`), not just the total. The Java original
   * built this string and then discarded it — a bug fixed upstream in this fork.
   */
  roll(facetsCount: number, isOpenEnded: boolean): IntResult {
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
      abilityDice.push(this.roll(abilityDieFacets, true));
    }
    abilityDice.sort(byValue);

    const wildDie = this.roll(wildDieFacets, true);

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

    const wildDieValue = this.roll(6, true).value;

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
