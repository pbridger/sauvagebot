import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JavaRandom } from '../src/dice/javaRandom.js';
import { CommandContext } from '../src/dice/evaluator.js';
import { RollInterpreter } from '../src/dice/interpreter.js';
import { parse } from '../src/dice/parser.js';

/**
 * A copy of `src/test/resources/conformance-corpus.tsv` from the Java project,
 * checked in here on purpose.
 *
 * It used to be read from that repo by absolute path, which meant the one test
 * that proves the port is faithful ran only on the machine that happened to have
 * both checkouts — and did not run in CI at all. It is 27 kB of the most valuable
 * test data in the project; carrying a copy is cheaper than not running it.
 *
 * Regenerate by re-running the Java generator and copying the file over.
 */
const CORPUS = fileURLToPath(new URL('./fixtures/conformance-corpus.tsv', import.meta.url));

function evaluate(expression: string, seed: number): string {
  const statements = parse([expression]);
  const context = new CommandContext(new JavaRandom(seed));
  return new RollInterpreter(context).run(statements);
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

/**
 * The oracle test for the whole port. Every record was produced by the Java engine; because
 * JavaRandom is bit-identical the TypeScript engine must reproduce each one byte for byte.
 */
describe('conformance corpus (Java oracle)', () => {
  const records = readFileSync(CORPUS, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => l.split('\t'))
    .filter((p) => p.length === 3);

  it('corpus loaded', () => {
    expect(records.length).toBeGreaterThan(400);
  });

  // Group by expression so failures point at a feature rather than a single seed.
  const byExpression = new Map<string, string[][]>();
  for (const r of records) {
    const key = r[1]!;
    if (!byExpression.has(key)) byExpression.set(key, []);
    byExpression.get(key)!.push(r);
  }

  for (const [expression, group] of byExpression) {
    it(`${expression}`, () => {
      for (const [seedText, , expected] of group) {
        let actual: string;
        try {
          actual = escape(evaluate(expression, Number(seedText)));
        } catch (e) {
          actual = `<<THREW>> ${e instanceof Error ? e.message : String(e)}`;
        }
        expect(actual, `expr=${expression} seed=${seedText}`).toBe(expected);
      }
    });
  }
});
