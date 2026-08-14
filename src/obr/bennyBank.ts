/**
 * Where Bennies are kept.
 *
 * One room-metadata key per character (`com.savagebot/bennies/<sheetId>`), not
 * one shared object. Writes are last-write-wins per key, so two players spending
 * at the same moment must not share one — and they are a handful of bytes each,
 * so the budget does not care.
 *
 * Keyed by **sheet**, not by player or token: a Benny belongs to a Wild Card.
 * Player metadata would have been the obvious home and is the wrong one twice
 * over — it does not survive a tab close (measured, milestone 0), and a GM
 * running three Wild Card villains needs three separate counts.
 */
import { award, spend, startOfSession, type BennyUse } from '../rules/bennies.js';
import type { Sheet } from '../rules/sheet.js';
import type { VerifiedStore } from './store.js';

export const BENNY_PREFIX = 'com.savagebot/bennies/';

/**
 * What a hand-out to the whole party actually managed.
 *
 * Partial success is a real state here: room metadata has a hard budget, and a
 * write that does not fit throws for that one character while everyone else is
 * fine. Reporting it beats a party where one player quietly has nothing.
 */
export interface BennyOutcome {
  /** Wild Cards whose count was written. */
  done: string[];
  failed: { name: string; error: Error }[];
}

export class BennyBank {
  constructor(private readonly store: VerifiedStore) {}

  private key(sheetId: string): string {
    return `${BENNY_PREFIX}${sheetId}`;
  }

  async all(): Promise<Map<string, number>> {
    const metadata = await this.store.readAll();
    const counts = new Map<string, number>();
    for (const [key, value] of Object.entries(metadata)) {
      if (!key.startsWith(BENNY_PREFIX)) continue;
      if (typeof value === 'number' && Number.isFinite(value)) {
        counts.set(key.slice(BENNY_PREFIX.length), Math.max(0, Math.trunc(value)));
      }
    }
    return counts;
  }

  async get(sheetId: string): Promise<number> {
    const value = await this.store.read<number>(this.key(sheetId));
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  async set(sheetId: string, count: number): Promise<void> {
    await this.store.write(this.key(sheetId), Math.max(0, Math.trunc(count)));
  }

  /** @throws NoBenniesError when there is nothing to spend. */
  async spend(sheetId: string, use: BennyUse | string): Promise<number> {
    const next = spend(await this.get(sheetId));
    await this.set(sheetId, next);
    void use;
    return next;
  }

  async award(sheetId: string, count = 1): Promise<number> {
    const next = award(await this.get(sheetId), count);
    await this.set(sheetId, next);
    return next;
  }

  /**
   * Start a session: every Wild Card back to three, Extras to none.
   *
   * Replaces rather than adds — unused Bennies are lost at session end — and
   * only Wild Cards get any, since Extras do not have them.
   *
   * One character's write failing must not cost everyone after them theirs. The
   * loop used to throw on the first failure, which meant a full room stopped the
   * hand-out part way through and — since the caller had nothing to catch it —
   * looked exactly like "that character just didn't get any". Failures are
   * collected and handed back so somebody can say so.
   */
  async newSession(sheets: readonly Sheet[]): Promise<BennyOutcome> {
    return this.applyAll(sheets, (sheet) => (sheet.wildCard ? startOfSession() : 0), {
      includeExtras: true,
    });
  }

  /** A Benny each to every Wild Card, for a Joker or for the Marshal's own reasons. */
  async awardAll(sheets: readonly Sheet[], count = 1): Promise<BennyOutcome> {
    return this.applyAll(sheets, async (sheet) => award(await this.get(sheet.id), count));
  }

  /**
   * Write a count for the whole party, then **re-read the store and check**.
   *
   * The re-read is not belt and braces. `VerifiedStore` reads each key back after
   * writing it, and a hand-out was once reported as complete for a character who
   * then showed zero — so that per-key check can pass while the value does not
   * survive. Whatever the cause (a host-side drop the SDK's own read does not
   * see, another client's write landing on top), the honest thing is to look at
   * the store afterwards rather than to trust the report.
   */
  private async applyAll(
    sheets: readonly Sheet[],
    target: (sheet: Sheet) => number | Promise<number>,
    options: { includeExtras?: boolean } = {},
  ): Promise<BennyOutcome> {
    const outcome: BennyOutcome = { done: [], failed: [] };
    const expected = new Map<string, { name: string; count: number }>();

    for (const sheet of sheets) {
      if (!sheet.wildCard && !options.includeExtras) continue;
      const count = await target(sheet);
      // An Extra with no entry needs no write to stay at nothing.
      if (!sheet.wildCard && (await this.get(sheet.id)) === count) continue;
      try {
        await this.set(sheet.id, count);
        if (sheet.wildCard) expected.set(sheet.id, { name: sheet.name, count });
      } catch (error) {
        outcome.failed.push({ name: sheet.name, error: error as Error });
      }
    }

    const after = await this.all();
    for (const [id, { name, count }] of expected) {
      const got = after.get(id) ?? 0;
      if (got === count) outcome.done.push(name);
      else {
        outcome.failed.push({
          name,
          error: new Error(
            `wrote ${count} to ${this.key(id)} and read back ${got} — the write did not survive`,
          ),
        });
      }
    }
    return outcome;
  }

  /**
   * Joker's Wild: one Benny to every player character, once, however many
   * Jokers were dealt.
   */
  async jokersWild(sheets: readonly Sheet[]): Promise<string[]> {
    return (await this.awardAll(sheets)).done;
  }

  async clear(sheetId: string): Promise<void> {
    await this.store.remove(this.key(sheetId));
  }
}
