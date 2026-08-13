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
   */
  async newSession(sheets: readonly Sheet[]): Promise<number> {
    let touched = 0;
    for (const sheet of sheets) {
      const target = sheet.wildCard ? startOfSession() : 0;
      if ((await this.get(sheet.id)) === target && !sheet.wildCard) continue;
      await this.set(sheet.id, target);
      touched++;
    }
    return touched;
  }

  /**
   * Joker's Wild: one Benny to every player character, once, however many
   * Jokers were dealt.
   */
  async jokersWild(sheets: readonly Sheet[]): Promise<string[]> {
    const lucky = sheets.filter((sheet) => sheet.wildCard);
    for (const sheet of lucky) await this.award(sheet.id);
    return lucky.map((sheet) => sheet.name);
  }

  async clear(sheetId: string): Promise<void> {
    await this.store.remove(this.key(sheetId));
  }
}
