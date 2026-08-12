/** Result types mirroring the Java `IntResult` / `IntListResult`. */

export interface IntResult {
  value: number;
  /** Human-readable breakdown, e.g. `6+6+4` for an exploding d6. */
  explained: string;
}

export interface IntListResult {
  values: number[];
  explained: string;
}

export function intResult(value: number, explained: string): IntResult {
  return { value, explained };
}

/**
 * Java's `Comparator.comparingInt(IntResult::getValue)`. Both Java's TimSort and JS's
 * `Array.prototype.sort` are stable (ES2019+), so ordering of equal values matches.
 */
export function byValue(a: IntResult, b: IntResult): number {
  return a.value - b.value;
}

export function byValueDescending(a: IntResult, b: IntResult): number {
  return b.value - a.value;
}

export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationError';
  }
}

export const Limits = {
  MAX_DICE: 100,
  MAX_TIMES: 100,
} as const;
