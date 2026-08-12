/** Ports of `GygaxRangeRoller` and `SwordWorldPowerRoller`. */

import type { Roller } from './roller.js';
import { EvaluationError, intResult, type IntResult } from './results.js';
import { MAX_POWER, POWER_TABLE } from './powerTable.js';

// ---------------------------------------------------------------------------
// Gygax range roll — `2--12` picks dice that naturally produce that range.
// ---------------------------------------------------------------------------

interface Roll {
  dice: number;
  facets: number;
  multiplier: number;
  additive: number;
}

function fillRollTable(facets: readonly number[]): Map<number, Roll> {
  const rolls = new Map<number, Roll>();
  // Insertion order decides ties, exactly as the Java `containsKey` guard does.
  for (let nDice = 1; nDice < 10; nDice++) {
    for (const nFacets of facets) {
      const delta = nDice * nFacets - nDice;
      if (rolls.has(delta)) continue;
      rolls.set(delta, { dice: nDice, facets: nFacets, multiplier: 1, additive: 0 });
    }
  }
  return rolls;
}

const GYGAXIAN_FACETS = [4, 6, 8, 10, 12, 20, 100] as const;
const NON_GYGAXIAN_FACETS = [3, 5, 7, 14, 16, 24, 30] as const;
const GYGAXIAN_DICE = fillRollTable(GYGAXIAN_FACETS);
const NON_GYGAXIAN_DICE = fillRollTable(NON_GYGAXIAN_FACETS);

function withAdditive(roll: Roll, additive: number): Roll {
  return { ...roll, additive };
}

function tryRollWithMultiplier(min: number, max: number, facets: readonly number[]): Roll | null {
  const numFacets = max / min;
  if (!facets.includes(numFacets)) return null;
  let numDice = min;
  let mult = 1;
  while (numDice % 10 === 0) {
    numDice /= 10;
    mult *= 10;
  }
  // Avoid rolling too many dice; this can fall back to 1dN anyway.
  if (numDice >= 100) return null;
  return { dice: numDice, facets: numFacets, multiplier: mult, additive: 0 };
}

function getGygaxRoll(min: number, max: number): Roll {
  const delta = max - min;

  const gygax = GYGAXIAN_DICE.get(delta);
  if (gygax) return withAdditive(gygax, min - gygax.dice);

  if (max % min === 0) {
    const roll = tryRollWithMultiplier(min, max, GYGAXIAN_FACETS);
    if (roll) return roll;
  }

  const nonGygax = NON_GYGAXIAN_DICE.get(delta);
  if (nonGygax) return withAdditive(nonGygax, min - nonGygax.dice);

  if (max % min === 0) {
    const roll = tryRollWithMultiplier(min, max, NON_GYGAXIAN_FACETS);
    if (roll) return roll;
  }

  return { dice: 1, facets: max - min + 1, multiplier: 1, additive: min - 1 };
}

export function rollGygaxRange(roller: Roller, min: number, max: number): IntResult {
  if (min <= 0) throw new EvaluationError(`Range min should be > 0: ${min}`);
  if (max <= 0) throw new EvaluationError(`Range max should be > 0: ${max}`);

  const roll = getGygaxRoll(min, max);
  const rollResult = roller.rollDice(roll.dice, roll.facets);
  const value = rollResult.value * roll.multiplier + roll.additive;

  let explained = `[${roll.dice}d${roll.facets}`;
  if (roll.multiplier !== 1) explained += `x${roll.multiplier}`;
  if (roll.additive > 0) explained += `+${roll.additive}`;
  else if (roll.additive < 0) explained += String(roll.additive);
  explained += '] ';
  if (roll.multiplier !== 1) explained += '(';
  explained += rollResult.explained;
  if (roll.multiplier !== 1) explained += `) x ${roll.multiplier}`;
  if (roll.additive > 0) explained += ` + ${roll.additive}`;
  else if (roll.additive < 0) explained += ` - ${-roll.additive}`;

  return intResult(value, explained);
}

// ---------------------------------------------------------------------------
// Sword World power roll
// ---------------------------------------------------------------------------

export interface SwordWorldOptions {
  power: number;
  critical: number;
  autoFailThreshold: number;
  numDice: number;
  rollModifier: number;
  withHumanSwordGrace: boolean;
}

export interface SwordWorldResult {
  isAutoFail: boolean;
  value: number;
  explained: string;
}

export function rollSwordWorldPower(roller: Roller, o: SwordWorldOptions): SwordWorldResult {
  if (o.power < 0 || o.power > MAX_POWER) {
    throw new EvaluationError(`Power out of range [0..${MAX_POWER}]: ${o.power}`);
  }
  // Critical <= 0 means no critical; 1..2 would roll forever; 3..5 is impossible under core rules.
  if (o.critical > 0 && o.critical <= 5) {
    throw new EvaluationError(`Critical out of range: ${o.critical}`);
  }
  // 'f0' means automatic failure is impossible on this roll.
  if (o.autoFailThreshold < 0 || o.autoFailThreshold > 12) {
    throw new EvaluationError(`Automatic fail threshold out of range: ${o.autoFailThreshold}`);
  }
  if (o.numDice < 1 || o.numDice > 10) {
    throw new EvaluationError(`Number of dice out of range: ${o.numDice}`);
  }

  const table = POWER_TABLE[o.power]!;

  let total = 0;
  let addends = '';
  let isAutoFail = false;
  let isFirstRoll = true;

  for (;;) {
    const rollResult = roller.rollDice(o.numDice, 6);
    const rollValue = rollResult.value;
    let modifiedRoll = rollValue + o.rollModifier;
    // Snake eyes on 2d6 ignore the modifier.
    if (o.numDice === 2 && rollValue === 2) modifiedRoll = rollValue;

    let tableIndex = modifiedRoll - 2;
    if (tableIndex < 0) tableIndex = 0;
    else if (tableIndex >= table.length) tableIndex = table.length - 1;

    let rollText = rollResult.explained;
    if (o.rollModifier > 0) rollText += ` + ${o.rollModifier}`;
    else if (o.rollModifier < 0) rollText += ` - ${-o.rollModifier}`;

    const value = table[tableIndex]!;

    if (modifiedRoll <= o.autoFailThreshold) {
      if (isFirstRoll) isAutoFail = true;
      addends += '\\*';
      break;
    }

    isFirstRoll = false;
    total += value;
    addends += String(value);
    if (o.withHumanSwordGrace) addends += `[${rollText}]`;
    if (o.critical <= 0 || modifiedRoll < o.critical) break;
    addends += ' + ';
  }

  let explained = '(';
  explained += o.withHumanSwordGrace ? powerTableAsString(o.power) : `power ${o.power}`;
  explained += '; ';
  explained += o.critical <= 0 ? 'no critical' : `critical ${o.critical}`;
  explained += `) ${addends}`;

  return { isAutoFail, value: total, explained };
}

function powerTableAsString(power: number): string {
  const table = POWER_TABLE[power]!;
  return table.slice(1).join('|');
}
