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

/**
 * The dictionary mostly stops existing once the roster knows where the book is.
 *
 * Measured motivation, not tidiness: in the party's real room the dictionary was
 * 4,447 chars — 38% of everything in use — and every one of its 27 entries was
 * text the shipped catalogue already had, in a worse version. See MECHANICS-
 * INVENTORY.md §12.
 */
describe('preferring the book to the stored copy', () => {
  /** Stands in for `catalogue.findEntry`. Knows QUICK, has never heard of HEXBLOOD. */
  const book = (name: string): string | undefined =>
    name === 'QUICK' ? 'The full printed wording, which is longer and says more.' : undefined;

  const sheet = (): Sheet => ({
    ...emptySheet('reggie', 'Reggie'),
    edges: [{ name: 'QUICK', text: 'A short summary off the card.' }],
    hindrances: [{ name: 'HEXBLOOD', text: 'Homebrew: the family curse.' }],
  });

  const booked = (capacity = ROOM_CAPACITY) => {
    const backend = new FakeBackend(capacity);
    return {
      backend,
      roster: new Roster(
        new VerifiedStore(backend, { capacity, onWarning: () => {} }),
        () => {},
        book,
      ),
    };
  };

  it('stores nothing the book can supply, and everything it cannot', () => {
    const { text } = splitSheet(sheet(), book);
    expect(Object.keys(text)).toEqual(['HEXBLOOD']);
  });

  it('fills the gap from the book on the way out', () => {
    const { lean, text } = splitSheet(sheet(), book);
    const out = joinSheet(lean, text, book);
    expect(out.edges[0]?.text).toBe('The full printed wording, which is longer and says more.');
    expect(out.hindrances[0]?.text).toBe('Homebrew: the family curse.');
  });

  /** A room written by an earlier version must not change under the table. */
  it('prefers a stored entry over the book, so an old room renders as it did', () => {
    const stale = { QUICK: 'The old summary, still in the dictionary.' };
    const { lean } = splitSheet(sheet(), book);
    expect(joinSheet(lean, stale, book).edges[0]?.text).toBe(
      'The old summary, still in the dictionary.',
    );
  });

  it('leaves an entry bare when neither has it', () => {
    const lean = { ...emptySheet('x', 'X'), edges: [{ name: 'UNKNOWN' }] };
    expect(joinSheet(lean, {}, book).edges[0]?.text).toBeUndefined();
  });

  it('saves a whole sheet with only the homebrew stored', async () => {
    const { roster, backend } = booked();
    await roster.save(sheet());
    expect(backend.data[TEXT_KEY]).toEqual({ HEXBLOOD: 'Homebrew: the family curse.' });
    const back = await roster.get('reggie');
    expect(back?.edges[0]?.text).toContain('full printed wording');
  });

  describe('pruning a room saved by an earlier version', () => {
    /** Save without a book, as the old code did, then prune with one. */
    const legacy = async () => {
      const backend = new FakeBackend(ROOM_CAPACITY);
      const store = new VerifiedStore(backend, {
        capacity: ROOM_CAPACITY,
        onWarning: () => {},
      });
      await new Roster(store).save(sheet());
      return { backend, roster: new Roster(store, () => {}, book) };
    };

    it('removes what the book covers and keeps what it does not', async () => {
      const { roster, backend } = await legacy();
      expect(Object.keys(backend.data[TEXT_KEY] as object).sort()).toEqual(['HEXBLOOD', 'QUICK']);

      expect(await roster.pruneRulesText()).toBe(1);
      expect(backend.data[TEXT_KEY]).toEqual({ HEXBLOOD: 'Homebrew: the family curse.' });
    });

    it('still shows every entry its text afterwards', async () => {
      const { roster } = await legacy();
      await roster.pruneRulesText();
      const back = await roster.get('reggie');
      expect(back?.edges[0]?.text).toContain('full printed wording');
      expect(back?.hindrances[0]?.text).toBe('Homebrew: the family curse.');
    });

    it('removes the key entirely when nothing is left to keep', async () => {
      const backend = new FakeBackend(ROOM_CAPACITY);
      const store = new VerifiedStore(backend, { capacity: ROOM_CAPACITY, onWarning: () => {} });
      await new Roster(store).save({
        ...emptySheet('a', 'A'),
        edges: [{ name: 'QUICK', text: 'A short summary off the card.' }],
      });
      expect(await new Roster(store, () => {}, book).pruneRulesText()).toBe(1);
      expect(backend.data[TEXT_KEY]).toBeUndefined();
    });

    it('does nothing without a book, rather than emptying the dictionary', async () => {
      const backend = new FakeBackend(ROOM_CAPACITY);
      const store = new VerifiedStore(backend, { capacity: ROOM_CAPACITY, onWarning: () => {} });
      const plain = new Roster(store);
      await plain.save(sheet());
      expect(await plain.pruneRulesText()).toBe(0);
      expect(Object.keys(backend.data[TEXT_KEY] as object)).toHaveLength(2);
    });
  });

  /**
   * `RosterExport` promises full sheets — "an export must stand alone". Now that
   * most text is fetched rather than stored, that promise runs through the book.
   */
  it('exports full text even though almost none of it is stored', async () => {
    const { roster } = booked();
    await roster.save(sheet());
    const [only] = (await roster.export()).sheets;
    expect(only?.edges[0]?.text).toBe('The full printed wording, which is longer and says more.');
    expect(only?.hindrances[0]?.text).toBe('Homebrew: the family curse.');
  });

  it('reimports that export into a room with no book at all', async () => {
    const { roster } = booked();
    await roster.save(sheet());
    const file = await roster.export();

    const { roster: bookless } = newRoster();
    await bookless.import(file);
    // Nothing to fetch from, so the text must have travelled in the file.
    expect((await bookless.get('reggie'))?.edges[0]?.text).toContain('full printed wording');
  });
});

/**
 * PCs in the room, villains with the map — Paul's design of 2026-08-27.
 *
 * The room is the only campaign-wide store (~16 kB); a scene is measured at ≥1 MB
 * and 4 ms a write, and it goes when the scene does. Which document holds the key
 * *is* the scope, so there is no field to disagree with it.
 */
describe('a roster split across the room and the scene', () => {
  const split = (roomCap = ROOM_CAPACITY, sceneCap = 1_000_000) => {
    const room = new FakeBackend(roomCap);
    const scene = new FakeBackend(sceneCap);
    const warnings: string[] = [];
    return {
      room,
      scene,
      warnings,
      roster: new Roster(
        {
          room: new VerifiedStore(room, { capacity: roomCap, onWarning: () => {} }),
          scene: new VerifiedStore(scene, { capacity: sceneCap, onWarning: () => {} }),
        },
        (m) => warnings.push(m),
      ),
    };
  };

  const pc = (id: string): Sheet => ({ ...emptySheet(id, id), pc: true });
  const npc = (id: string): Sheet => emptySheet(id, id);

  it('files a new PC in the room and a new villain with the scene', async () => {
    const { roster } = split();
    await roster.save(pc('reggie'));
    await roster.save(npc('bandit'));
    expect(await roster.scopeOf('reggie')).toBe('room');
    expect(await roster.scopeOf('bandit')).toBe('scene');
  });

  it('lists both as one roster', async () => {
    const { roster } = split();
    await roster.save(pc('reggie'));
    await roster.save(npc('bandit'));
    expect((await roster.list()).map((s) => s.id)).toEqual(['bandit', 'reggie']);
  });

  it('saves an existing character back where they already are', async () => {
    const { roster, room } = split();
    await roster.save(npc('ike'));
    await roster.move('ike', 'room');
    // Still an NPC, so the kind default would send them to the scene — but they
    // have a home now, and editing a villain must not quietly demote them.
    await roster.save({ ...npc('ike'), wounds: 1 } as Sheet);
    expect(await roster.scopeOf('ike')).toBe('room');
    expect(Object.keys(room.data).some((k) => k.endsWith('ike'))).toBe(true);
  });

  it('finds a scene character by id like any other', async () => {
    const { roster } = split();
    await roster.save({ ...npc('bandit'), name: 'Bandit' });
    expect((await roster.get('bandit'))?.name).toBe('Bandit');
  });

  describe('moving between the two', () => {
    it('promotes a villain to the campaign and takes them out of the scene', async () => {
      const { roster, room, scene } = split();
      await roster.save(npc('ike'));
      await roster.move('ike', 'room');
      expect(await roster.scopeOf('ike')).toBe('room');
      expect(Object.keys(scene.data)).toHaveLength(0);
      expect(Object.keys(room.data).length).toBeGreaterThan(0);
    });

    it('demotes the other way just as happily', async () => {
      const { roster } = split();
      await roster.save(pc('reggie'));
      await roster.move('reggie', 'scene');
      expect(await roster.scopeOf('reggie')).toBe('scene');
    });

    it('does nothing when they are already there', async () => {
      const { roster } = split();
      await roster.save(pc('reggie'));
      await roster.move('reggie', 'room');
      expect(await roster.scopeOf('reggie')).toBe('room');
    });

    it('refuses to move a character who does not exist', async () => {
      const { roster } = split();
      await expect(roster.move('nobody', 'room')).rejects.toThrow(/no character/);
    });

    /**
     * Write first, then remove. The promotion is refused by the *write*, so the
     * villain is still in the scene afterwards rather than nowhere at all.
     */
    it('leaves the character where they were when the room is full', async () => {
      const { roster, scene } = split(400);
      await roster.save({ ...npc('ike'), description: 'x'.repeat(500) });
      await expect(roster.move('ike', 'room')).rejects.toThrow();
      expect(await roster.scopeOf('ike')).toBe('scene');
      expect(Object.keys(scene.data)).toHaveLength(1);
    });
  });

  /**
   * What a crash between the write and the remove leaves behind. Room wins, so
   * the campaign copy — the one that outlives the scene — is the one in play.
   */
  describe('a character left in both documents', () => {
    const both = async () => {
      const s = split();
      await s.roster.save(pc('ike'));
      await s.scene.set({ 'com.savagebot/pc/ike': { ...pc('ike'), name: 'stale' } });
      return s;
    };

    it('is listed once, from the room', async () => {
      const { roster } = await both();
      const found = (await roster.list()).filter((sheet) => sheet.id === 'ike');
      expect(found).toHaveLength(1);
      expect(found[0]!.name).toBe('ike');
    });

    it('is reported so it can be cleared', async () => {
      const { roster } = await both();
      expect(await roster.duplicates()).toEqual(['ike']);
    });

    it('is deleted from both, so it cannot come back', async () => {
      const { roster, room, scene } = await both();
      await roster.remove('ike');
      expect(await roster.get('ike')).toBeUndefined();
      expect(Object.keys(room.data)).toHaveLength(0);
      expect(Object.keys(scene.data)).toHaveLength(0);
    });
  });

  it('clears a deleted character’s bennies, which nothing used to', async () => {
    const { roster, room } = split();
    await roster.save(pc('reggie'));
    await room.set({ 'com.savagebot/bennies/reggie': 3 });
    await roster.remove('reggie');
    expect(Object.keys(room.data)).not.toContain('com.savagebot/bennies/reggie');
  });

  describe('with no scene open', () => {
    const roomOnly = () => {
      const backend = new FakeBackend(ROOM_CAPACITY);
      const warnings: string[] = [];
      return {
        warnings,
        roster: new Roster(
          { room: new VerifiedStore(backend, { capacity: ROOM_CAPACITY, onWarning: () => {} }) },
          (m) => warnings.push(m),
        ),
      };
    };

    it('saves a villain to the room and says so out loud', async () => {
      const { roster, warnings } = roomOnly();
      await roster.save(npc('bandit'));
      expect(await roster.scopeOf('bandit')).toBe('room');
      expect(warnings.join(' ')).toMatch(/no scene open/);
    });

    it('refuses to move anyone into a scene that is not there', async () => {
      const { roster } = roomOnly();
      await roster.save(pc('reggie'));
      await expect(roster.move('reggie', 'scene')).rejects.toThrow(/no scene open/);
    });

    it('reports no duplicates rather than guessing', async () => {
      const { roster } = roomOnly();
      expect(await roster.duplicates()).toEqual([]);
    });
  });

  /**
   * The old check costed every sheet against the room. A party's worth of
   * villains bound for a 1 MB scene would be refused by a 16 kB budget they were
   * never going to touch.
   */
  it('costs an import against the document each sheet is going to', async () => {
    const { roster } = split(600);
    const villains = Array.from({ length: 20 }, (_, i) => ({
      ...npc(`v${i}`),
      description: 'x'.repeat(400),
    }));
    const imported = await roster.import({
      version: 1,
      exportedAt: new Date().toISOString(),
      sheets: villains,
    });
    expect(imported).toHaveLength(20);
    expect(await roster.scopeOf('v0')).toBe('scene');
  });

  it('still refuses outright when the PCs will not fit the room', async () => {
    const { roster } = split(600);
    await expect(
      roster.import({
        version: 1,
        exportedAt: new Date().toISOString(),
        sheets: [{ ...pc('a'), description: 'x'.repeat(400) }, { ...pc('b'), description: 'x'.repeat(400) }],
      }),
    ).rejects.toThrow(/the room/);
  });
});
