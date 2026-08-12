/**
 * Optional Redis persistence.
 *
 * The Java `RedisClient` wrapped every call in `catch (Exception) -> log.debug`, so an outage
 * silently discarded all table state. Here failures are logged at warn level and surfaced on
 * startup, because "bennies quietly stopped saving" is exactly the kind of thing a table only
 * notices a session later.
 */

import Redis from 'ioredis';
import type { Store } from '../game/state.js';

export interface RedisOptions {
  host: string;
  port: number;
  password?: string | undefined;
  key?: string;
}

export class RedisStore implements Store {
  private readonly client: Redis;
  private readonly key: string;

  constructor(options: RedisOptions) {
    this.key = options.key ?? 'savagebot:tables';
    this.client = new Redis({
      host: options.host,
      port: options.port,
      ...(options.password !== undefined ? { password: options.password } : {}),
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    this.client.on('error', (e) => console.warn('Redis error:', e.message));
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.client.ping();
  }

  async load(): Promise<Record<string, unknown> | undefined> {
    try {
      const raw = await this.client.get(this.key);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    } catch (error) {
      console.warn('Could not load state from Redis:', error);
      return undefined;
    }
  }

  async save(state: Record<string, unknown>): Promise<void> {
    try {
      await this.client.set(this.key, JSON.stringify(state));
    } catch (error) {
      console.warn('Could not save state to Redis:', error);
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
