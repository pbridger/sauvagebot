import { describe, expect, it, vi } from 'vitest';
import {
  CapacityError,
  ROOM_CAPACITY,
  VerifiedStore,
  WriteDroppedError,
  jsonEqual,
  usedBytes,
  type Backend,
} from '../src/obr/store.js';

/**
 * A backend that reproduces the behaviour milestone 0 actually measured in OBR:
 * merging updates, `undefined` deleting a key, and — the important one — an
 * overflowing write being **silently dropped** with no error at all.
 */
class FakeBackend implements Backend {
  data: Record<string, unknown> = {};
  drops = 0;

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
    if (usedBytes(merged) > this.capacity) {
      this.drops++;
      return; // silently, exactly as OBR does
    }
    this.data = merged;
  }
}

const store = (backend: Backend, capacity = ROOM_CAPACITY, onWarning = () => {}) =>
  new VerifiedStore(backend, { capacity, onWarning });

describe('jsonEqual', () => {
  it('compares structurally, not by reference or serialisation', () => {
    expect(jsonEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: undefined }, {})).toBe(true);
    expect(jsonEqual(null, undefined)).toBe(false);
    expect(jsonEqual({ a: { b: null } }, { a: { b: null } })).toBe(true);
  });
});

describe('VerifiedStore', () => {
  it('round-trips a value', async () => {
    const s = store(new FakeBackend());
    await s.write('sheet/1', { name: 'Jed', traits: { vigor: 8 } });
    expect(await s.read('sheet/1')).toEqual({ name: 'Jed', traits: { vigor: 8 } });
  });

  it('catches a silently dropped write instead of reporting success', async () => {
    // The backend accepts nothing at all, exactly like an overfull room.
    const backend = new FakeBackend(0);
    const s = store(backend, 1_000_000);
    await expect(s.write('sheet/1', { name: 'Jed' })).rejects.toThrow(WriteDroppedError);
    expect(backend.drops).toBe(1);
  });

  it('refuses a write that would overflow, before attempting it', async () => {
    const backend = new FakeBackend();
    const s = store(backend, 200);
    await expect(s.write('big', 'x'.repeat(500))).rejects.toThrow(CapacityError);
    // Nothing was sent — the guard fires ahead of the write, not after.
    expect(backend.data).toEqual({});
  });

  it('does not mistake another client’s concurrent write for its own failure', async () => {
    const backend = new FakeBackend();
    const s = store(backend);
    await s.write('sheet/1', { name: 'Jed' });

    // Someone else edits a *different* key in the window between our write and
    // our read-back. Verifying the whole document would call that our failure.
    backend.set = async (update) => {
      Object.assign(backend.data, update, { 'sheet/2': { name: 'Rosa' } });
    };

    await expect(s.write('sheet/1', { name: 'Jed Cooper' })).resolves.toBeUndefined();
    expect(await s.read('sheet/1')).toEqual({ name: 'Jed Cooper' });
    expect(await s.read('sheet/2')).toEqual({ name: 'Rosa' });
  });

  it('warns as the budget fills, without failing', async () => {
    const onWarning = vi.fn();
    const s = new VerifiedStore(new FakeBackend(), {
      capacity: 1000,
      warnAt: 0.5,
      onWarning,
    });
    await s.write('notes', 'x'.repeat(600));
    expect(onWarning).toHaveBeenCalledOnce();
    expect(onWarning.mock.calls[0]![0]).toMatch(/full/);
  });

  it('deletes a key and reclaims the budget', async () => {
    const backend = new FakeBackend();
    const s = store(backend);
    await s.write('sheet/1', { name: 'Jed' });
    await s.remove('sheet/1');
    expect(await s.read('sheet/1')).toBeUndefined();
    expect(usedBytes(backend.data)).toBe(2); // "{}"
  });

  it('reports usage against the capacity', async () => {
    const s = store(new FakeBackend(), 1000);
    await s.write('a', 'x'.repeat(100));
    const usage = await s.usage();
    expect(usage.capacity).toBe(1000);
    expect(usage.used).toBeGreaterThan(100);
    expect(usage.fraction).toBeCloseTo(usage.used / 1000);
  });

  it('updates through a transform', async () => {
    const s = store(new FakeBackend());
    await s.write('chips/paul', { WHITE: 1 });
    const next = await s.update<{ WHITE: number }>('chips/paul', (c) => ({
      WHITE: (c?.WHITE ?? 0) + 1,
    }));
    expect(next).toEqual({ WHITE: 2 });
    expect(await s.read('chips/paul')).toEqual({ WHITE: 2 });
  });

  it('loses one of two concurrent updates to the SAME key — the reason for per-owner keys', async () => {
    const s = store(new FakeBackend());
    await s.write('shared', { count: 0 });
    // Both read 0, both write 1. This is not a bug to fix here; it is why the
    // schema never puts two writers on one key.
    const bump = (c: { count: number } | undefined) => ({ count: (c?.count ?? 0) + 1 });
    await Promise.all([s.update('shared', bump), s.update('shared', bump)]);
    expect(await s.read('shared')).toEqual({ count: 1 });
  });

  it('survives a realistic six-PC roster inside the room budget', async () => {
    const backend = new FakeBackend(ROOM_CAPACITY);
    const s = store(backend, ROOM_CAPACITY);
    for (let i = 1; i <= 6; i++) {
      await s.write(`com.savagebot/pc/${i}`, {
        id: `pc-${i}`,
        name: `Character ${i}`,
        wildCard: true,
        traits: { agility: 8, smarts: 6, spirit: 6, strength: 6, vigor: 8, fighting: 8 },
        derived: { parry: 6, toughness: 7, armor: 2, pace: 6, grit: 1 },
        edges: ['Quick', 'Level Headed', 'Marksman'],
        hindrances: ['Loyal', 'Stubborn'],
        gear: ['Colt Peacemaker', 'Winchester 76', 'Bowie knife'],
      });
    }
    const usage = await s.usage();
    expect(backend.drops).toBe(0);
    // Comfortable, not marginal — the measured headroom the design relies on.
    expect(usage.fraction).toBeLessThan(0.25);
  });
});
