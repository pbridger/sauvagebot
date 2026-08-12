import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JavaRandom } from '../src/dice/javaRandom.js';
import { Roller } from '../src/dice/roller.js';
import type { SuffixOperator } from '../src/dice/ast.js';

const here = dirname(fileURLToPath(import.meta.url));
const reference = readFileSync(join(here, 'roller-reference.tsv'), 'utf8');

/**
 * Roller-level oracle. The end-to-end conformance corpus would also catch these, but only after
 * the whole pipeline exists, and a single misordered RNG call would then be near-impossible to
 * localise. These vectors pin the Roller on its own.
 */
describe('Roller matches the Java implementation', () => {
  const rows = reference
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => l.split('\t'));

  /**
   * Replay a labelled case with a fresh RNG, exactly as RollerRef.java did. Returns a list
   * because the `roll`/`roll!` cases emit five successive rolls from one RNG — comparing only
   * the last would silently accept a wrong sequence.
   */
  function run(label: string, seed: number): { value: number; explained: string }[] {
    const roller = new Roller(new JavaRandom(seed));

    let m: RegExpMatchArray | null;

    if ((m = label.match(/^roll!(\d+)$/))) {
      const out = [];
      for (let i = 0; i < 5; i++) out.push(roller.roll(Number(m[1]), true));
      return out;
    }
    if ((m = label.match(/^roll(\d+)$/))) {
      const out = [];
      for (let i = 0; i < 5; i++) out.push(roller.roll(Number(m[1]), false));
      return out;
    }
    return [single(label, seed, roller)];
  }

  function single(
    label: string,
    _seed: number,
    roller: Roller,
  ): { value: number; explained: string } {
    let m: RegExpMatchArray | null;
    if ((m = label.match(/^keep(\d+)d6$/))) {
      return roller.rollAndKeep(Number(m[1]), 6, false, undefined, 0);
    }
    if ((m = label.match(/^k2!(\d+)d6$/))) {
      return roller.rollAndKeep(Number(m[1]), 6, true, 'KEEP' as SuffixOperator, 2);
    }
    if ((m = label.match(/^kl2:(\d+)d8$/))) {
      return roller.rollAndKeep(Number(m[1]), 8, false, 'KEEP_LEAST' as SuffixOperator, 2);
    }
    if ((m = label.match(/^adv(\d+)d20$/))) {
      return roller.rollAndKeep(Number(m[1]), 20, false, 'ADVANTAGE' as SuffixOperator, 1);
    }
    if ((m = label.match(/^dis(\d+)d20$/))) {
      return roller.rollAndKeep(Number(m[1]), 20, false, 'DISADVANTAGE' as SuffixOperator, 1);
    }
    if ((m = label.match(/^fudge(\d+)$/))) return roller.rollFudge(Number(m[1]));
    if ((m = label.match(/^carcosa(\d+)$/))) return roller.rollCarcosa(Number(m[1]));
    if ((m = label.match(/^weg(\d+)$/))) return roller.rollWegD6(Number(m[1]));
    if ((m = label.match(/^d66_(\d+)$/))) return roller.rollD66(Number(m[1]));
    if ((m = label.match(/^sw(\d+)x(\d+)$/))) {
      const r = roller.rollSavageWorlds(Number(m[1]), Number(m[2]), 6);
      // RollerRef emitted size as the value and "[values] | explained" as the text.
      return { value: r.values.length, explained: `[${r.values.join(', ')}] | ${r.explained}` };
    }
    if ((m = label.match(/^sf(\d+)$/))) {
      return roller.rollSuccessOrFail(Number(m[1]), 6, true, 10, 1);
    }
    if ((m = label.match(/^sfp(\d+)$/))) {
      return roller.rollSuccessOrFail(Number(m[1]), 10, false, 7, 1);
    }
    throw new Error(`unhandled label: ${label}`);
  }

  it('has reference vectors', () => {
    expect(rows.length).toBeGreaterThan(400);
  });

  // Group consecutive rows sharing (label, seed): those are one RNG sequence.
  interface Group {
    key: string;
    label: string;
    seed: number;
    rows: string[][];
  }
  const groups: Group[] = [];
  for (const row of rows) {
    const label = row[0]!;
    const seed = Number(row[1]);
    const last = groups[groups.length - 1];
    if (last && last.label === label && last.seed === seed) {
      last.rows.push(row);
    } else {
      groups.push({ key: label.replace(/\d+/g, 'N'), label, seed, rows: [row] });
    }
  }

  // One test per method so a failure names the exact roller method.
  const byKey = new Map<string, Group[]>();
  for (const g of groups) {
    if (!byKey.has(g.key)) byKey.set(g.key, []);
    byKey.get(g.key)!.push(g);
  }

  for (const [key, group] of byKey) {
    it(`${key} (${group.reduce((n, g) => n + g.rows.length, 0)} vectors)`, () => {
      for (const g of group) {
        const actual = run(g.label, g.seed);
        expect(actual.length, `row count for ${g.label} seed=${g.seed}`).toBe(g.rows.length);
        g.rows.forEach((row, i) => {
          const a = actual[i]!;
          expect(
            `${a.value}\t${a.explained}`,
            `label=${g.label} seed=${g.seed} #${i}`,
          ).toBe(`${row[2]}\t${row[3]}`);
        });
      }
    });
  }
});
