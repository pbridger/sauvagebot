import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArchetypeCards } from '../src/rules/importArchetypeCard.js';
import { emptySheet, sheetToJson, type Sheet } from '../src/rules/sheet.js';
import { Roster, TEXT_KEY, joinSheet, splitSheet } from '../src/obr/roster.js';
import { ROOM_CAPACITY, VerifiedStore, usedBytes, type Backend } from '../src/obr/store.js';

const reggie = parseArchetypeCards(
  readFileSync(fileURLToPath(new URL('./fixtures/reggie-kane.html', import.meta.url)), 'utf8'),
)[0]!;

class FakeBackend implements Backend {
  data: Record<string, unknown> = {};
  constructor(private readonly capacity = Infinity) {}
  async get(): Promise<Record<string, unknown>> {
    return structuredClone(this.data);
  }
  async set(update: Record<string, unknown>): Promise<void> {
    const merged = { ...this.data };
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    if (usedBytes(merged) > this.capacity) return; // silent drop, as OBR does
    this.data = merged;
  }
}

const newRoster = (capacity = ROOM_CAPACITY) => {
  const backend = new FakeBackend(capacity);
  return {
    backend,
    roster: new Roster(new VerifiedStore(backend, { capacity, onWarning: () => {} })),
  };
};

describe('splitting a sheet', () => {
  it('takes the rules text out and puts it back unchanged', () => {
    const { lean, text } = splitSheet(reggie);
    expect(joinSheet(lean, text)).toEqual(reggie);
  });

  it('round-trips two entries that share a name', () => {
    // Keying prose by name inside each sheet lost one of these. The shared
    // dictionary is name-keyed by design, so identical names share one entry --
    // which is correct: the same edge has the same rules text.
    const twins = {
      ...reggie,
      edges: [
        { name: 'GUTS', text: 'Free reroll to resist Fear.' },
        { name: 'GUTS', text: 'Free reroll to resist Fear.' },
      ],
    };
    const { lean, text } = splitSheet(twins);
    expect(joinSheet(lean, text)).toEqual(twins);
  });

  it('cuts a third off the sheet, and pays for the text once per room', () => {
    // Reggie: 1,877 full -> 1,253 lean, with 677 chars of text moving to the
    // shared dictionary. The saving compounds: a second character with the same
    // edges adds 1,253, not 1,930.
    const { lean, text } = splitSheet(reggie);
    expect(sheetToJson(lean).length).toBeLessThan(sheetToJson(reggie).length * 0.7);
    expect(JSON.stringify(text).length).toBeGreaterThan(500);
    expect(lean.edges.every((e) => e.text === undefined)).toBe(true);
  });

  it('keeps gear and quote on the sheet, where they belong', () => {
    const { lean } = splitSheet(reggie);
    expect(lean.gear).toBe(reggie.gear);
    expect(lean.quote).toBe(reggie.quote);
  });

  it('keeps the names, so the lean sheet is still readable on its own', () => {
    const { lean } = splitSheet(reggie);
    expect(lean.edges.map((e) => e.name)).toEqual(reggie.edges.map((e) => e.name));
  });

  it('survives a sheet with no rules text at all', () => {
    const bare = { ...reggie, edges: [{ name: 'LUCK' }], hindrances: [] };
    const { lean, text } = splitSheet(bare);
    expect(text).toEqual({});
    expect(joinSheet(lean, text)).toEqual(bare);
  });
});

describe('the shared rules-text dictionary', () => {
  it('pays for a shared edge once, not once per character', async () => {
    const { backend, roster } = newRoster();
    for (let i = 0; i < 6; i++) await roster.save({ ...reggie, id: `pc-${i}`, name: `PC ${i}` });
    const dictionary = JSON.stringify(backend.data[TEXT_KEY]);
    // Seven entries stored once, though six characters reference them.
    expect(Object.keys(backend.data[TEXT_KEY] as object)).toHaveLength(7);
    expect(dictionary.length).toBeLessThan(sheetToJson(reggie).length * 1.5);
  });

  it('reattaches text on read', async () => {
    const { roster } = newRoster();
    await roster.save(reggie);
    expect(await roster.get(reggie.id)).toEqual(reggie);
  });

  it('saves the sheet anyway when the dictionary will not fit', async () => {
    const warnings: string[] = [];
    const backend = new FakeBackend(1_400);
    const roster = new Roster(
      new VerifiedStore(backend, { capacity: 1_400, onWarning: () => {} }),
      (m) => warnings.push(m),
    );
    await roster.save(reggie);

    // The sheet is there; only the descriptions are missing.
    const stored = await roster.get(reggie.id);
    expect(stored?.name).toBe(reggie.name);
    expect(stored?.edges[0]?.text).toBeUndefined();
    expect(warnings.join()).toMatch(/without their descriptions/);
  });

  it('can be dropped to reclaim space, leaving sheets intact', async () => {
    const { roster } = newRoster();
    await roster.save(reggie);
    await roster.dropRulesText();
    const stored = await roster.get(reggie.id);
    expect(stored?.edges.map((e) => e.name)).toEqual(reggie.edges.map((e) => e.name));
    expect(stored?.edges[0]?.text).toBeUndefined();
  });
});

describe('Roster', () => {
  it('saves and reads back a character unchanged', async () => {
    const { roster } = newRoster();
    await roster.save(reggie);
    expect(await roster.get(reggie.id)).toEqual(reggie);
  });

  it('uses one key per character, so two players never share a write', async () => {
    const { backend, roster } = newRoster();
    await roster.save(reggie);
    await roster.save({ ...reggie, id: 'lucky', name: 'LUCKY' });
    expect(Object.keys(backend.data).sort()).toEqual([
      'com.savagebot/pc/lucky',
      'com.savagebot/pc/reginald-reggie-kane',
      TEXT_KEY,
    ]);
  });

  it('lists alphabetically and ignores unrelated room keys', async () => {
    const { backend, roster } = newRoster();
    backend.data['com.savagebot/chips/paul'] = { WHITE: 2 };
    backend.data['some.other.extension/state'] = { x: 1 };
    await roster.save({ ...reggie, id: 'zed', name: 'ZED' });
    await roster.save({ ...reggie, id: 'abe', name: 'ABE' });
    expect((await roster.list()).map((s) => s.name)).toEqual(['ABE', 'ZED']);
  });

  it('removes a character and reclaims the space', async () => {
    const { backend, roster } = newRoster();
    await roster.save(reggie);
    await roster.remove(reggie.id);
    expect(await roster.get(reggie.id)).toBeUndefined();
    // The dictionary is deliberately left behind; other characters share it.
    expect(Object.keys(backend.data)).toEqual([TEXT_KEY]);
  });

  it('holds the whole party with headroom to spare', async () => {
    // Measured, not aspirational: six full Reggie-scale sheets plus the shared
    // dictionary come to ~8.2 kB of the 15 kB budget. That is 55%, not the 28%
    // an earlier design claimed -- that figure stripped gear, quote and advances
    // as well, and those belong on the sheet.
    const { backend, roster } = newRoster();
    for (let i = 0; i < 6; i++) await roster.save({ ...reggie, id: `pc-${i}`, name: `PC ${i}` });
    expect(await roster.list()).toHaveLength(6);
    expect(usedBytes(backend.data)).toBeLessThan(ROOM_CAPACITY * 0.6);
  });
});

describe('export and import', () => {
  it('round-trips the roster', async () => {
    const { roster } = newRoster();
    await roster.save({ ...reggie, id: 'a', name: 'A' });
    await roster.save({ ...reggie, id: 'b', name: 'B' });

    const exported = await roster.export();
    const { roster: fresh } = newRoster();
    await fresh.import(JSON.stringify(exported));

    expect((await fresh.list()).map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('carries nothing room-specific, so it moves between rooms', async () => {
    const { roster } = newRoster();
    await roster.save(reggie);
    const text = JSON.stringify(await roster.export());
    // No OBR item ids, scene ids, player ids or room ids anywhere in the payload.
    expect(text).not.toMatch(/connectionId|playerId|itemId|sceneId|roomId/i);
  });

  it('refuses an import that would not fit, rather than importing half of it', async () => {
    const { backend, roster } = newRoster(2_000);
    const big = Array.from({ length: 6 }, (_, i) => ({ ...reggie, id: `pc-${i}` }));
    await expect(
      roster.import({ version: 1, exportedAt: '', sheets: big }),
    ).rejects.toThrow(/nothing was imported/);
    expect(backend.data).toEqual({});
  });

  it('refuses a roster written by a newer version', async () => {
    const { roster } = newRoster();
    await expect(
      roster.import({ version: 99, exportedAt: '', sheets: [] }),
    ).rejects.toThrow(/newer version/);
  });

  it('rejects a file that is not a roster export', async () => {
    const { roster } = newRoster();
    await expect(roster.import('{"hello":true}')).rejects.toThrow(/not a roster export/);
  });
});

describe('dropping and restoring the rules text', () => {
  const withText = (): Sheet => ({
    ...emptySheet('reggie', 'Reggie'),
    edges: [{ name: 'QUICK', text: 'Draw again on a five or lower.' }],
    hindrances: [{ name: 'LOYAL', text: 'Never abandons a friend.' }],
  });

  it('reports what the dictionary costs, and nothing when there is none', async () => {
    const { roster } = newRoster();
    expect(await roster.rulesTextSize()).toBe(0);
    await roster.save(withText());
    expect(await roster.rulesTextSize()).toBeGreaterThan(50);
    await roster.dropRulesText();
    expect(await roster.rulesTextSize()).toBe(0);
  });

  it('rebuilds from a book, leaving sheets untouched', async () => {
    const { roster } = newRoster();
    await roster.save(withText());
    await roster.dropRulesText();
    expect((await roster.get('reggie'))?.edges[0]?.text).toBeUndefined();

    const restored = await roster.rebuildRulesText((name) =>
      name === 'QUICK' ? 'Draw again on a five or lower.' : undefined,
    );
    expect(restored).toBe(1);
    expect((await roster.get('reggie'))?.edges[0]?.text).toBe('Draw again on a five or lower.');
    // Not in the book we handed it, so it stays bare — which is what the warning
    // in the UI is about.
    expect((await roster.get('reggie'))?.hindrances[0]?.text).toBeUndefined();
  });

  it('writes nothing when the book knows none of it', async () => {
    const { roster, backend } = newRoster();
    await roster.save(withText());
    await roster.dropRulesText();
    expect(await roster.rebuildRulesText(() => undefined)).toBe(0);
    expect(Object.keys(backend.data).some((k) => k.includes('rules-text'))).toBe(false);
  });
});
