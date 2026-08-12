import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArchetypeCards } from '../src/rules/importArchetypeCard.js';
import { sheetToJson } from '../src/rules/sheet.js';
import { Roster, joinSheet, splitSheet } from '../src/obr/roster.js';
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
  it('takes the prose out and puts it back unchanged', () => {
    const { lean, prose } = splitSheet(reggie);
    expect(joinSheet(lean, prose)).toEqual(reggie);
  });

  it('leaves the lean half well inside the per-sheet share of the budget', () => {
    const { lean } = splitSheet(reggie);
    expect(sheetToJson(lean).length).toBeLessThan(sheetToJson(reggie).length * 0.45);
    expect(lean.edges.every((e) => e.text === undefined)).toBe(true);
    expect(lean.gear).toBeUndefined();
  });

  it('keeps the names, so the lean sheet is still readable on its own', () => {
    const { lean } = splitSheet(reggie);
    expect(lean.edges.map((e) => e.name)).toEqual(reggie.edges.map((e) => e.name));
  });

  it('survives a sheet that has no prose at all', () => {
    const bare = { ...reggie, quote: undefined, gear: undefined, advances: undefined };
    const { lean, prose } = splitSheet(bare);
    expect(joinSheet(lean, prose)).toEqual(bare);
  });
});

describe('Roster', () => {
  it('saves and reads back a character', async () => {
    const { roster } = newRoster();
    const prose = await roster.save(reggie);
    const stored = await roster.get(reggie.id);
    expect(stored?.name).toBe(reggie.name);
    expect(joinSheet(stored!, prose)).toEqual(reggie);
  });

  it('uses one key per character, so two players never share a write', async () => {
    const { backend, roster } = newRoster();
    await roster.save(reggie);
    await roster.save({ ...reggie, id: 'lucky', name: 'LUCKY' });
    expect(Object.keys(backend.data).sort()).toEqual([
      'com.savagebot/pc/lucky',
      'com.savagebot/pc/reginald-reggie-kane',
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
    expect(usedBytes(backend.data)).toBe(2);
  });

  it('holds the whole party comfortably', async () => {
    const { backend, roster } = newRoster();
    for (let i = 0; i < 6; i++) await roster.save({ ...reggie, id: `pc-${i}`, name: `PC ${i}` });
    expect(await roster.list()).toHaveLength(6);
    expect(usedBytes(backend.data)).toBeLessThan(ROOM_CAPACITY * 0.35);
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
