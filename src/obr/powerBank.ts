/**
 * Where a caster's *current* Power Points are kept.
 *
 * The same shape as `BennyBank`, and for the same reasons: one room-metadata key
 * per character rather than a field on the sheet. A field would mean rewriting
 * the whole sheet on every cast — the most frequent write in a caster's turn —
 * and two players spending at once would race for the document.
 *
 * Room rather than scene, also like Bennies. Power Points recover by resting,
 * which happens between scenes as often as within one, so a pool that reset when
 * the Marshal changed maps would be wrong in the direction that costs a player
 * something.
 *
 * Only the current value lives here. The maximum is read off the sheet's Powers
 * block by `maxPowerPoints`, so there is exactly one place it can be wrong.
 */
import { adjustPoints } from '../rules/powers.js';
import type { VerifiedStore } from './store.js';

export const POWER_PREFIX = 'com.savagebot/pp/';

export class PowerBank {
  constructor(private readonly store: VerifiedStore) {}

  private key(sheetId: string): string {
    return `${POWER_PREFIX}${sheetId}`;
  }

  /** Every caster's current pool, by sheet id — one read for the whole roster. */
  async all(): Promise<Map<string, number>> {
    const metadata = await this.store.readAll();
    const pools = new Map<string, number>();
    for (const [key, value] of Object.entries(metadata)) {
      if (!key.startsWith(POWER_PREFIX)) continue;
      if (typeof value === 'number' && Number.isFinite(value)) {
        pools.set(key.slice(POWER_PREFIX.length), Math.max(0, Math.trunc(value)));
      }
    }
    return pools;
  }

  /**
   * What they have now, defaulting to **full**.
   *
   * A character who has never spent a point has no key, and the honest reading of
   * that is "untouched", not "empty". Starting everyone at nought would have every
   * caster open the app unable to cast.
   */
  async get(sheetId: string, max: number): Promise<number> {
    const value = await this.store.read<number>(this.key(sheetId));
    return typeof value === 'number' && Number.isFinite(value)
      ? adjustPoints(0, value, max)
      : max;
  }

  async set(sheetId: string, points: number, max: number): Promise<number> {
    const next = adjustPoints(0, Math.trunc(points), max);
    await this.store.write(this.key(sheetId), next);
    return next;
  }

  /** Spend or recover, clamped to the pool at both ends. */
  async adjust(sheetId: string, delta: number, max: number): Promise<number> {
    return this.set(sheetId, adjustPoints(await this.get(sheetId, max), delta, max), max);
  }
}
