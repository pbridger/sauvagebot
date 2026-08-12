/**
 * Entry point.
 *
 * Configuration comes from the environment, not from positional argv. The Java bot took the bot
 * token and Redis password as command-line arguments, which left both visible in `ps` to any
 * local user.
 */

import { readFileSync } from 'node:fs';
import { createClient } from './bot/discord.js';
import { Tables } from './game/state.js';
import { RedisStore } from './store/redisStore.js';

function readToken(): string {
  const fromEnv = process.env.DISCORD_TOKEN;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();

  const path = process.env.DISCORD_TOKEN_FILE ?? '.token';
  try {
    const token = readFileSync(path, 'utf8').trim();
    if (token.length > 0) return token;
  } catch {
    // fall through to the error below
  }
  throw new Error(
    `No bot token. Set DISCORD_TOKEN, or put it in ${path} (DISCORD_TOKEN_FILE to override).`,
  );
}

async function main(): Promise<void> {
  const token = readToken();
  // `debug` keeps a test instance from colliding with another bot on the same server.
  const prefix = process.env.SAVAGEBOT_PREFIX ?? (process.argv.includes('debug') ? '~' : '!');

  let store: RedisStore | undefined;
  const redisHost = process.env.REDIS_HOST;
  if (redisHost) {
    store = new RedisStore({
      host: redisHost,
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
    });
    try {
      await store.connect();
      console.log(`Redis connected at ${redisHost}`);
    } catch (error) {
      console.warn('Redis unavailable — running without persistence:', error);
      store = undefined;
    }
  } else {
    console.log('REDIS_HOST not set — running without persistence.');
  }

  const tables = new Tables(store);
  await tables.restore();

  const client = createClient({ token, prefix, tables });

  const shutdown = async (): Promise<void> => {
    console.log('Shutting down…');
    try {
      await tables.persist();
      await client.destroy();
    } finally {
      if (store) await store.close();
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await client.login(token);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
