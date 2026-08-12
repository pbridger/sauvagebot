/**
 * Verified metadata storage.
 *
 * Milestone 0 measured the thing that shapes this file: **room metadata silently
 * drops a write that overflows its ~16 kB budget**. No exception, no rejected
 * promise — the write simply does not happen. A character sheet edit that
 * vanishes without a trace is the worst failure this extension could have, so
 * every write here is read back and compared, and the budget is checked before
 * the write rather than discovered after it.
 *
 * The OBR SDK is deliberately not imported. This layer talks to a `Backend`, so
 * it can be tested in node against a fake that reproduces the silent-drop
 * behaviour — which is the whole point.
 */

/** The two-method shape both room metadata and item metadata reduce to. */
export interface Backend {
  get(): Promise<Record<string, unknown>>;
  /** Merges `update` into the existing metadata. `undefined` deletes a key. */
  set(update: Record<string, unknown>): Promise<void>;
}

export interface StoreOptions {
  /**
   * Byte budget for the whole document. Room metadata measured at ~16 kB; items
   * at ~512 kB. Left a little under the measured figure so a write fails our
   * check before it reaches the host's silent drop.
   */
  capacity: number;
  /** Warn once usage crosses this fraction of capacity. */
  warnAt?: number;
  onWarning?: (message: string) => void;
}

export const ROOM_CAPACITY = 15_000;
export const ITEM_CAPACITY = 500_000;

export class WriteDroppedError extends Error {
  constructor(readonly key: string) {
    super(
      `write to "${key}" did not take effect — it was silently dropped, ` +
        `most likely because the store is full`,
    );
    this.name = 'WriteDroppedError';
  }
}

export class CapacityError extends Error {
  constructor(
    readonly needed: number,
    readonly capacity: number,
  ) {
    super(`write needs ${needed} chars but the budget is ${capacity}`);
    this.name = 'CapacityError';
  }
}

export function usedBytes(metadata: Record<string, unknown>): number {
  return JSON.stringify(metadata).length;
}

/**
 * Deep structural equality over JSON-shaped values. Read-back verification cannot
 * use `===` — the value that comes back has been through a structured clone — and
 * comparing serialisations would make key order significant, which it is not.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  const aKeys = Object.keys(a as object).filter((k) => (a as never)[k] !== undefined);
  const bKeys = Object.keys(b as object).filter((k) => (b as never)[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => jsonEqual((a as never)[k], (b as never)[k]));
}

export class VerifiedStore {
  private readonly capacity: number;
  private readonly warnAt: number;
  private readonly onWarning: (message: string) => void;

  constructor(
    private readonly backend: Backend,
    options: StoreOptions,
  ) {
    this.capacity = options.capacity;
    this.warnAt = options.warnAt ?? 0.8;
    this.onWarning = options.onWarning ?? ((m) => console.warn(m));
  }

  async read<T>(key: string): Promise<T | undefined> {
    return (await this.backend.get())[key] as T | undefined;
  }

  async readAll(): Promise<Record<string, unknown>> {
    return this.backend.get();
  }

  /**
   * Write one key, then prove it landed.
   *
   * Only the written key is compared, never the whole document — another client
   * may legitimately have changed a different key in between, and treating that
   * as our failure would produce false alarms in exactly the multiplayer case
   * this extension lives in.
   */
  async write(key: string, value: unknown): Promise<void> {
    const before = await this.backend.get();
    const projected = usedBytes({ ...before, [key]: value });
    if (projected > this.capacity) throw new CapacityError(projected, this.capacity);

    await this.backend.set({ [key]: value });

    const after = await this.backend.get();
    if (!jsonEqual(after[key], value)) throw new WriteDroppedError(key);

    const used = usedBytes(after);
    if (used > this.capacity * this.warnAt) {
      this.onWarning(
        `storage ${Math.round((used / this.capacity) * 100)}% full ` +
          `(${used}/${this.capacity} chars) — move bulky fields onto item metadata`,
      );
    }
  }

  /** Delete a key. Measured: assigning `undefined` removes it and reclaims the budget. */
  async remove(key: string): Promise<void> {
    await this.backend.set({ [key]: undefined });
    const after = await this.backend.get();
    if (after[key] !== undefined) throw new WriteDroppedError(key);
  }

  /**
   * Read, transform, write — with the read-back check. Note this is *not* atomic:
   * OBR offers no compare-and-swap, so a concurrent write to the same key between
   * the read and the write is lost. That is why the schema uses one key per owner
   * (one PC, one player's chips) rather than shared mutable structures.
   */
  async update<T>(key: string, transform: (current: T | undefined) => T): Promise<T> {
    const next = transform((await this.backend.get())[key] as T | undefined);
    await this.write(key, next);
    return next;
  }

  async usage(): Promise<{ used: number; capacity: number; fraction: number }> {
    const used = usedBytes(await this.backend.get());
    return { used, capacity: this.capacity, fraction: used / this.capacity };
  }
}
