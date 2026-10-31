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
 * The Marshal's own stack, which belongs to no sheet.
 *
 * Damian: *"please give me a place for Marshal bennies! I need my own stack"*.
 * Bennies are keyed by **sheet** — a Benny belongs to a Wild Card, and a Marshal
 * running three villains needs three counts — and the consequence nobody noticed
 * is that the Marshal, who is not a Wild Card and has no sheet, had nowhere to
 * put theirs.
 *
 * A reserved key rather than a real sheet: giving the Marshal a sheet would put
 * them in the roster, the picker, the target list and the turn order, which is
 * four wrong places to fix one. Sheet ids are uuids, so this cannot collide —
 * there is no `m`, `r`, `s` or `l` in hex.
 *
 * Per **room**, not per player. Room metadata has no per-player scoping that
 * survives a reload (measured, §12), and a table has one Marshal.
 */
export const MARSHAL_BENNIES = 'marshal';

/**
 * What a hand-out to the whole party actually managed.
 *
 * Partial success is a real state here: room metadata has a hard budget, and a
 * write that does not fit throws for that one character while everyone else is
 * fine. Reporting it beats a party where one player quietly has nothing.
 */
export interface BennyOutcome {
  /**
   * Wild Cards whose count was written.
   *
   * The id travels with the name because the two answer different questions and
   * only one of them can be reconstructed. A name is what the log prints; an id
   * is what finds the player's chair, so a bulk award can slide a chip to each
   * of them — and after a partial failure, only to the ones who actually got a
   * Benny. Deriving the ids back from the names afterwards would be guessing.
   */
  done: { id: string; name: string }[];
  failed: { name: string; error: Error }[];
}

export class BennyBank {
  constructor(private readonly store: VerifiedStore) {}

  /**
   * Every change this client makes, one after another.
   *
   * A change is read, add one, write — four round trips to Owlbear with the
   * verify — and two of them overlapping both read the same count. Two quick
   * clicks on a chip logged two spends and took off one; a spend racing the
   * Marshal's award lost one or the other (2026-10-31, reproduced in
   * `bennyBank.test.ts`). Queued, a change starts from what the last one wrote.
   *
   * This only orders **this** client's changes. Two people changing the same
   * count at the same moment can still overwrite each other; room metadata has
   * no compare-and-set to stop that.
   */
  private queue: Promise<unknown> = Promise.resolve();

  private serial<T>(change: () => Promise<T>): Promise<T> {
    const run = this.queue.then(change, change);
    // A failed change must not jam the ones queued behind it.
    this.queue = run.catch(() => undefined);
    return run;
  }

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

  set(sheetId: string, count: number): Promise<void> {
    return this.serial(() => this.write(sheetId, count));
  }

  private async write(sheetId: string, count: number): Promise<void> {
    await this.store.write(this.key(sheetId), Math.max(0, Math.trunc(count)));
  }

  /** @throws NoBenniesError when there is nothing to spend. */
  spend(sheetId: string, use: BennyUse | string): Promise<number> {
    void use;
    return this.serial(async () => {
      const next = spend(await this.get(sheetId));
      await this.write(sheetId, next);
      return next;
    });
  }

  award(sheetId: string, count = 1): Promise<number> {
    return this.serial(async () => {
      const next = award(await this.get(sheetId), count);
      await this.write(sheetId, next);
      return next;
    });
  }

  /**
   * Start a session: every player's Wild Card back to three, everyone else to none.
   *
   * Replaces rather than adds — unused Bennies are lost at session end — and only
   * Wild Cards get any, since Extras do not have them.
   *
   * One character's write failing must not cost everyone after them theirs. The
   * loop used to throw on the first failure, which meant a full room stopped the
   * hand-out part way through and — since the caller had nothing to catch it —
   * looked exactly like "that character just didn't get any". Failures are
   * collected and handed back so somebody can say so.
   */
  newSession(sheets: readonly Sheet[]): Promise<BennyOutcome> {
    return this.applyAll(sheets, (sheet) => (sheet.wildCard && sheet.pc ? startOfSession() : 0), {
      includeExtras: true,
    });
  }

  /**
   * Everyone to nothing — the Marshal's reset, for when the count has drifted or
   * a session ended messily.
   *
   * Deliberately not "back to three": handing out the starting three is what the
   * "+1 Benny to all" button does three times, and a button that both wipes and
   * refills is two decisions on one press.
   */
  clearAll(sheets: readonly Sheet[]): Promise<BennyOutcome> {
    return this.serial(async () => {
      const outcome = await this.writeAll(sheets, () => 0, { includeExtras: true });
      // The Marshal's stack too. The button says "every Benny in the room" and
      // leaving one count standing would make that a lie — and it is the Marshal's
      // own button, so there is nobody else to surprise.
      try {
        await this.write(MARSHAL_BENNIES, 0);
      } catch (error) {
        outcome.failed.push({ name: 'the Marshal', error: error as Error });
      }
      return outcome;
    });
  }

  /**
   * A Benny each to every player's Wild Card, for a Joker or for the Marshal's
   * own reasons.
   *
   * Players only. This used to reach every Wild Card in the room, which meant a
   * Joker handed the Marshal's own villains a Benny apiece — reported from the
   * table as "it's giving one to everyone".
   */
  awardAll(sheets: readonly Sheet[], count = 1): Promise<BennyOutcome> {
    return this.applyAll(
      sheets.filter((sheet) => sheet.pc),
      async (sheet) => award(await this.get(sheet.id), count),
    );
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
  private applyAll(
    sheets: readonly Sheet[],
    target: (sheet: Sheet) => number | Promise<number>,
    options: { includeExtras?: boolean } = {},
  ): Promise<BennyOutcome> {
    return this.serial(() => this.writeAll(sheets, target, options));
  }

  private async writeAll(
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
        await this.write(sheet.id, count);
        if (sheet.wildCard) expected.set(sheet.id, { name: sheet.name, count });
      } catch (error) {
        outcome.failed.push({ name: sheet.name, error: error as Error });
      }
    }

    const after = await this.all();
    for (const [id, { name, count }] of expected) {
      const got = after.get(id) ?? 0;
      if (got === count) outcome.done.push({ id, name });
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
   * Jokers were dealt. `awardAll` is what makes that "player" rather than
   * "everyone".
   */
  async jokersWild(sheets: readonly Sheet[]): Promise<{ id: string; name: string }[]> {
    return (await this.awardAll(sheets)).done;
  }

  clear(sheetId: string): Promise<void> {
    return this.serial(() => this.store.remove(this.key(sheetId)));
  }
}
