/**
 * Scratch harness for checking OBR behaviour in a live room.
 *
 * Built for milestone 0, which it answered; kept for the next surprise.
 *
 * Round 1 established (in Paul's room, as GM):
 *   - room metadata holds ~12.6 kB and silently drops the write that overflows;
 *   - player metadata does NOT survive closing the tab, though `player.id` does;
 *   - "clear" reported that keys set to `undefined` survived.
 *
 * Round 2 exists to answer what those leave open:
 *   1. Is the room budget really ~16 kB, and is it per-document? (pin it)
 *   2. Did delete actually fail, or did round 1 only see a key whose value is now
 *      `undefined`? `Object.keys` cannot tell those apart, and the difference is
 *      between "append-only store, 16 kB and no way back" and "fine".
 *   3. How much fits in ITEM metadata? If that is roomy, sheets live on tokens.
 *   4. How much fits in SCENE metadata?
 *   5. Can a non-GM write item metadata?
 *
 * Round 3 (2026-08-19) answered the capacity questions and can now be left alone:
 *   - **room ≈ 16,384 chars**, whole-document. The blob was written on top of the
 *     room's existing 11,720, and 4,096 fit where 8,192 did not, so the ceiling is
 *     15,816–19,912 and 16,384 is the only round number in it.
 *   - **item 512 kB each**, rejected at 1 MB. Unchanged.
 *   - **scene ≥ 8 MB** — no limit found. But the store is *chunked*: clearing an
 *     8 MB value threw `4014 Max chunk exceeded`, which is why `deepClean` shrinks
 *     before it deletes.
 *   - writes are rate limited; a tight sweep trips `RateLimitHit`.
 *
 * Round 4 is therefore not about how much fits. The room sits at 11,720 chars at
 * rest and the design's own accounting explains only ~8,800 of them, so the open
 * question is **where the bytes go** — which is `storageReport`, the one button
 * worth pressing. See MECHANICS-INVENTORY.md §12.
 *
 * Everything written lives under `com.savagebot/probe*`.
 *
 * KEEP THIS around after milestone 0 rather than deleting it: it is the only
 * harness for checking real OBR behaviour in a live room, and the next surprise
 * will want it.
 */
import OBR, { buildShape } from '@owlbear-rodeo/sdk';
import { ROOM_CAPACITY } from '../../src/obr/store.js';
import { findEntry } from '../../src/rules/catalogue.js';

const PREFIX = 'com.savagebot/probe';
const STAMP_KEY = `${PREFIX}-stamp`;
const BLOB_KEY = `${PREFIX}-blob`;
const SCENE_STAMP_KEY = `${PREFIX}-scene-stamp`;

/** Written into scene metadata to find out whether duplicating a scene copies it. */
interface SceneStamp {
  nonce: string;
  at: string;
  /** How many items the scene held when it was stamped — the tell for a copy. */
  items: number;
}

const logEl = document.getElementById('log')!;

function log(message: string, cls?: 'ok' | 'bad'): void {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  // OBR rejects with plain objects, which stringify to a useless "[object Object]".
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function fill(id: string, rows: [string, string][]): void {
  const el = document.getElementById(id)!;
  el.replaceChildren(
    ...rows.flatMap(([term, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    }),
  );
}

function button(id: string, handler: () => Promise<void>): void {
  const el = document.getElementById(id) as HTMLButtonElement | null;
  el?.addEventListener('click', async () => {
    el.disabled = true;
    try {
      await handler();
    } catch (error) {
      log(`unhandled: ${describe(error)}`, 'bad');
    } finally {
      el.disabled = false;
    }
  });
}

const isProbeKey = (key: string): boolean => key.startsWith(PREFIX);

/** Incompressible, so it measures a byte budget rather than a compression ratio. */
function noise(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,.';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// ---------------------------------------------------------------- identity

interface Stamp {
  at: string;
  playerId: string;
  connectionId: string;
}

function formatStamp(value: unknown): string {
  if (!value || typeof value !== 'object') return '— none —';
  const stamp = value as Partial<Stamp>;
  return `${stamp.at} (player ${stamp.playerId}, conn ${stamp.connectionId})`;
}

async function showIdentity(): Promise<void> {
  const [name, role, connectionId] = await Promise.all([
    OBR.player.getName(),
    OBR.player.getRole(),
    OBR.player.getConnectionId(),
  ]);
  fill('identity', [
    ['room', OBR.room.id],
    ['player id', OBR.player.id],
    ['connection', connectionId],
    ['name', name],
    ['role', role],
  ]);
}

async function showStamps(): Promise<void> {
  const [room, player] = await Promise.all([OBR.room.getMetadata(), OBR.player.getMetadata()]);
  const used = JSON.stringify(room).length;
  fill('stamps', [
    ['room stamp', formatStamp(room[STAMP_KEY])],
    ['player stamp', formatStamp(player[STAMP_KEY])],
    ['room metadata in use', `${used} chars of JSON across ${Object.keys(room).length} keys`],
  ]);
}

async function stamp(): Promise<void> {
  const value: Stamp = {
    at: new Date().toISOString(),
    playerId: OBR.player.id,
    connectionId: await OBR.player.getConnectionId(),
  };
  await OBR.room.setMetadata({ [STAMP_KEY]: value });
  await OBR.player.setMetadata({ [STAMP_KEY]: value });
  log(`stamped room + player at ${value.at}`, 'ok');
  await showStamps();
}

// ---------------------------------------------------------------- deletion

/**
 * THE IMPORTANT ONE. Round 1 said keys "survived" deletion, but it tested with
 * `Object.keys`, which lists a key whose value is `undefined` exactly as it lists
 * a key with real data. If deletion truly does not work, room metadata is an
 * append-only 16 kB store and every schema change leaks budget permanently.
 *
 * So: report the value, not just the key, and try three strategies in order.
 */
async function clearProbeKeys(): Promise<void> {
  const before = await OBR.room.getMetadata();
  const keys = Object.keys(before).filter(isProbeKey);
  if (!keys.length) {
    log('no probe keys in room metadata', 'ok');
  } else {
    log(`--- deleting ${keys.length} probe key(s) ---`);
    for (const key of keys) {
      log(`  before: ${key} = ${JSON.stringify(before[key])?.slice(0, 40) ?? 'undefined'}…`);
    }
  }

  const strategies: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
  ];

  const holdsData = (md: Record<string, unknown>, key: string): boolean => {
    const v = md[key];
    return v !== undefined && v !== null && v !== '';
  };

  for (const [label, value] of strategies) {
    const current = await OBR.room.getMetadata();
    const remaining = Object.keys(current).filter((k) => isProbeKey(k) && holdsData(current, k));
    if (!remaining.length) break;

    const update: Record<string, unknown> = {};
    for (const key of remaining) update[key] = value;
    await OBR.room.setMetadata(update);

    const after = await OBR.room.getMetadata();
    const listed = Object.keys(after).filter(isProbeKey);
    const withData = listed.filter((k) => holdsData(after, k));
    log(
      `  set to ${label}: ${listed.length} key(s) still listed, ${withData.length} still holding data` +
        ` — room metadata now ${JSON.stringify(after).length} chars`,
      withData.length ? 'bad' : 'ok',
    );
    if (!withData.length) break;
  }

  await OBR.player.setMetadata({ [STAMP_KEY]: undefined });

  // The item capacity probe can leave ~512 kB of filler on whatever was selected.
  await cleanSelectedItems();

  await showStamps();
}

// ---------------------------------------------------------------- capacity

type Writer = (payload: string) => Promise<void>;
type Reader = () => Promise<unknown>;

/** A write counts only if it reads back at full length — silent drops are the norm here. */
async function fits(size: number, write: Writer, read: Reader): Promise<boolean> {
  const payload = noise(size);
  try {
    await write(payload);
  } catch {
    return false;
  }
  const back = await read();
  return typeof back === 'string' && back.length === size;
}

/** Doubling search then bisection, to ~256 chars. */
async function findCap(label: string, write: Writer, read: Reader): Promise<number> {
  let lo = 0;
  let hi = 0;
  for (let size = 1024; size <= 8 * 1024 * 1024; size *= 2) {
    if (await fits(size, write, read)) {
      lo = size;
      log(`  ${label} ${size}: ok`);
    } else {
      hi = size;
      log(`  ${label} ${size}: rejected or dropped`);
      break;
    }
  }
  if (!hi) {
    log(`${label}: no limit found below 8 MB`, 'ok');
    return lo;
  }
  while (hi - lo > 256) {
    const mid = Math.floor((lo + hi) / 2);
    if (await fits(mid, write, read)) lo = mid;
    else hi = mid;
  }
  log(`${label} CAP ≈ ${lo} chars (${(lo / 1024).toFixed(1)} kB)`, 'ok');
  return lo;
}

async function roomCap(): Promise<void> {
  log('--- room metadata capacity (single key, incompressible) ---');
  const cap = await findCap(
    'room',
    (p) => OBR.room.setMetadata({ [BLOB_KEY]: p }),
    async () => (await OBR.room.getMetadata())[BLOB_KEY],
  );
  log(`that is the whole-document budget: round 1 saw 4 keys x 3.2 kB fill it`, cap ? 'ok' : 'bad');
  await clearProbeKeys();
}

async function sceneCap(): Promise<void> {
  if (!(await OBR.scene.isReady())) {
    log('no scene open — open one first', 'bad');
    return;
  }
  log('--- scene metadata capacity ---');
  await findCap(
    'scene',
    (p) => OBR.scene.setMetadata({ [BLOB_KEY]: p }),
    async () => (await OBR.scene.getMetadata())[BLOB_KEY],
  );
  await OBR.scene.setMetadata({ [BLOB_KEY]: undefined });
  log('cleared scene blob');
}

/**
 * Write a nonce into scene metadata. Read it back later with `sceneStampCheck`.
 *
 * Two questions, one marker:
 *
 *  1. **Does it survive coming back?** Stamp, close the tab, return tomorrow,
 *     check. This is the one the whole scene-storage design rests on — Paul's own
 *     caveat, *"assuming the session storage survives refresh/reboot/come-back-
 *     later"* — and nothing measured so far touches it. Safe-cap and the timing
 *     run both wrote and cleared inside one session.
 *  2. **Does duplicating a scene copy it?** Stamp, *then* duplicate, then open the
 *     copy and check. Order matters and the first run got it backwards.
 *
 * Deliberately split from the check so that pressing the wrong one cannot destroy
 * the evidence: this always overwrites, the checker never writes. The earlier
 * single button silently stamped a scene that had none, which makes "fresh scene"
 * and "copy that lost its metadata" produce identical logs.
 */
async function sceneStamp(): Promise<void> {
  if (!(await OBR.scene.isReady())) {
    log('no scene open — open one first', 'bad');
    return;
  }
  const previous = (await OBR.scene.getMetadata())[SCENE_STAMP_KEY] as SceneStamp | undefined;
  if (previous) log(`overwriting the stamp already here (${previous.nonce}, ${previous.at})`);

  const stamp: SceneStamp = {
    nonce: Math.random().toString(36).slice(2, 10),
    at: new Date().toISOString(),
    items: (await OBR.scene.items.getItems()).length,
  };
  await OBR.scene.setMetadata({ [SCENE_STAMP_KEY]: stamp });
  const back = (await OBR.scene.getMetadata())[SCENE_STAMP_KEY] as SceneStamp | undefined;
  if (back?.nonce !== stamp.nonce) {
    log('the stamp did not read back — silently dropped', 'bad');
    return;
  }
  log(`stamped: nonce ${stamp.nonce}, ${stamp.items} item(s), ${stamp.at}`, 'ok');
  log('SURVIVAL: close the tab, come back later, reopen this panel and press "Check stamp".');
  log('COPYING:  duplicate this scene NOW, open the copy, and press "Check stamp" there.');
}

/**
 * Read the stamp back. Writes nothing, so it can be pressed as often as you like
 * and in any scene without disturbing the answer.
 */
async function sceneStampCheck(): Promise<void> {
  if (!(await OBR.scene.isReady())) {
    log('no scene open — open one first', 'bad');
    return;
  }
  const stamp = (await OBR.scene.getMetadata())[SCENE_STAMP_KEY] as SceneStamp | undefined;
  const items = (await OBR.scene.items.getItems()).length;
  log('--- scene stamp check ---');
  if (!stamp) {
    log(`  NO STAMP in this scene (it holds ${items} item(s))`, 'bad');
    log('  If this is the scene you stamped, scene metadata did NOT survive.');
    log('  If this is a copy of a stamped scene, metadata does NOT travel with a duplicate.');
    log('  If this is neither, that is the expected answer and it means nothing.');
    return;
  }
  log(`  FOUND: nonce ${stamp.nonce}, written ${stamp.at}`, 'ok');
  log(`  stamped when the scene held ${stamp.items} item(s); it now holds ${items}`);
  log('  In the scene you stamped, this means scene metadata SURVIVED.', 'ok');
  log('  In a duplicate of it, this means metadata TRAVELS with the copy.', 'ok');
}

/**
 * A scene capacity number that can be **used**, unlike `sceneCap`.
 *
 * Round 3 doubled to 8 MB, found no ceiling, and then could not clear the blob:
 * `4014 Max chunk exceeded`. So "no limit below 8 MB" is not "safe at 8 MB", and
 * the figure that matters is not the ceiling but the largest write that still
 * behaves — round-trips, and can be deleted again afterwards.
 *
 * Hence: bounded at 1 MB, and every step is proven *clearable* before the next
 * one is tried. Slower than a bisection and it leaves nothing behind.
 */
async function sceneSafeCap(): Promise<void> {
  if (!(await OBR.scene.isReady())) {
    log('no scene open — open one first', 'bad');
    return;
  }
  log('--- largest scene write that also clears cleanly (bounded at 1 MB) ---');
  let best = 0;
  for (const size of [16_384, 65_536, 131_072, 262_144, 524_288, 1_048_576]) {
    const started = performance.now();
    try {
      await OBR.scene.setMetadata({ [BLOB_KEY]: noise(size) });
    } catch (error) {
      log(`  ${size}: write REJECTED — ${describe(error)}`, 'bad');
      break;
    }
    const wrote = performance.now() - started;
    const back = (await OBR.scene.getMetadata())[BLOB_KEY];
    if (typeof back !== 'string' || back.length !== size) {
      log(`  ${size}: silently dropped after ${Math.round(wrote)} ms`, 'bad');
      break;
    }
    // Shrink first, then delete — the order `deepClean` had to learn.
    try {
      await OBR.scene.setMetadata({ [BLOB_KEY]: 'x' });
      await OBR.scene.setMetadata({ [BLOB_KEY]: undefined });
    } catch (error) {
      log(`  ${size}: WROTE FINE BUT WOULD NOT CLEAR — ${describe(error)}`, 'bad');
      log('  that is the chunk boundary. Anything at or above this is a trap.', 'bad');
      break;
    }
    if ((await OBR.scene.getMetadata())[BLOB_KEY] !== undefined) {
      log(`  ${size}: cleared but the key is still holding data`, 'bad');
      break;
    }
    best = size;
    log(`  ${size}: wrote in ${Math.round(wrote)} ms, read back, cleared`, 'ok');
  }
  log(
    best
      ? `SCENE_CAPACITY should sit under ${best} chars (${(best / 1024).toFixed(0)} kB)`
      : 'nothing was safely writable — that is worth knowing on its own',
    best ? 'ok' : 'bad',
  );
}

/**
 * What a realistic roster write actually costs in wall-clock time, repeated.
 *
 * Round 3 tripped `RateLimitHit` during the item sweep, and a store the panel
 * writes on every sheet edit cannot be discovered to be rate-limited at the
 * table. 40 kB is roughly thirty villain sheets.
 */
async function sceneWriteTiming(): Promise<void> {
  if (!(await OBR.scene.isReady())) {
    log('no scene open — open one first', 'bad');
    return;
  }
  log('--- ten consecutive 40 kB scene writes ---');
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const started = performance.now();
    try {
      await OBR.scene.setMetadata({ [BLOB_KEY]: noise(40_960) });
    } catch (error) {
      log(`  write ${i + 1}: REJECTED — ${describe(error)}`, 'bad');
      break;
    }
    times.push(performance.now() - started);
  }
  await OBR.scene.setMetadata({ [BLOB_KEY]: 'x' });
  await OBR.scene.setMetadata({ [BLOB_KEY]: undefined });
  if (!times.length) return;
  const rounded = times.map((t) => Math.round(t));
  log(`  ms: ${rounded.join(', ')}`);
  log(
    `  median ${Math.round([...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!)} ms, ` +
      `worst ${Math.round(Math.max(...times))} ms`,
    Math.max(...times) > 2000 ? 'bad' : 'ok',
  );
  log('  a rising tail is the rate limiter; a flat line means writes are cheap enough to do often');
}

async function itemCap(): Promise<void> {
  const selection = await OBR.player.getSelection();
  const id = selection?.[0];
  if (!id) {
    log('nothing selected — select a token first', 'bad');
    return;
  }
  log('--- item metadata capacity (the candidate home for sheets) ---');
  await findCap(
    'item',
    (p) =>
      OBR.scene.items.updateItems([id], (items) => {
        for (const item of items) item.metadata[BLOB_KEY] = p;
      }),
    async () => (await OBR.scene.items.getItems([id]))[0]?.metadata[BLOB_KEY],
  );
  await cleanItem(id);
}

/**
 * Reports what it can see before acting. A silent "nothing to do" is exactly what
 * we got last run, and it is ambiguous between "selection was empty" and "the item
 * was already clean" — which matters when half a megabyte may be sitting on a token.
 */
async function cleanSelectedItems(): Promise<void> {
  const selection = await OBR.player.getSelection();
  if (!selection?.length) {
    log('no item selected — select the token and click again to clean it', 'bad');
    return;
  }
  const items = await OBR.scene.items.getItems(selection);
  log(`${items.length} item(s) selected:`);
  for (const item of items) {
    const size = JSON.stringify(item.metadata ?? {}).length;
    const keys = Object.keys(item.metadata ?? {});
    log(`  "${item.name}" (${item.layer}) — metadata ${size} chars, keys: ${keys.join(', ') || '(none)'}`);
  }
  for (const id of selection) await cleanItem(id);
}

/**
 * Round 2 tried `delete item.metadata[key]` on the Immer draft and OBR rejected it,
 * leaving half a megabyte of filler on the token. Assigning `undefined` is the
 * pattern that works for room metadata, so use it here too — and verify.
 */
async function cleanItem(id: string): Promise<void> {
  await OBR.scene.items.updateItems([id], (items) => {
    for (const item of items) {
      for (const key of Object.keys(item.metadata)) {
        if (isProbeKey(key)) item.metadata[key] = undefined;
      }
    }
  });
  const metadata = (await OBR.scene.items.getItems([id]))[0]?.metadata ?? {};
  const left = Object.keys(metadata).filter((k) => isProbeKey(k) && metadata[k] !== undefined);
  const size = JSON.stringify(metadata).length;
  log(
    left.length
      ? `  probe keys SURVIVED: ${left.join(', ')} (metadata still ${size} chars)`
      : `  probe keys cleared — metadata now ${size} chars`,
    left.length ? 'bad' : 'ok',
  );
}

async function writeToSelectedItem(): Promise<void> {
  const selection = await OBR.player.getSelection();
  if (!selection?.length) {
    log('nothing selected — select a token first', 'bad');
    return;
  }
  const role = await OBR.player.getRole();
  const value = { at: new Date().toISOString(), by: role };
  try {
    await OBR.scene.items.updateItems(selection, (items) => {
      for (const item of items) item.metadata[STAMP_KEY] = value;
    });
  } catch (error) {
    log(`item write REJECTED as ${role}: ${describe(error)}`, 'bad');
    return;
  }
  const [item] = await OBR.scene.items.getItems(selection);
  const stored = item?.metadata[STAMP_KEY] as { at?: string } | undefined;
  if (stored?.at === value.at) {
    log(`item write OK as ${role} on "${item?.name}" (${item?.layer})`, 'ok');
  } else {
    log(`item write SILENTLY DROPPED as ${role} — no error, but not stored`, 'bad');
  }
}

// ------------------------------------------------------ storage accounting
//
// Round 3 measured the room ceiling at 15,816–19,912 (consistent with exactly
// 16,384) and found the room sitting at 11,720 chars at rest — but the design's
// own accounting only explains ~8,800 of those. A total tells you that you are
// full; it does not tell you what to move. Everything below reports per key.

/** What one key costs the shared document: `"key":value,`. */
function keyCost(key: string, value: unknown): number {
  if (value === undefined) return 0;
  return JSON.stringify(key).length + 1 + JSON.stringify(value).length + 1;
}

/**
 * Which family a key belongs to, for the grouped total.
 *
 * The per-key list is the evidence; the grouping is the answer. Six PC sheets
 * spread over six keys read as noise until they are added up as "the roster".
 */
function family(key: string): string {
  const known = [
    'com.savagebot/pc/',
    'com.savagebot/bennies/',
    'com.savagebot/place/',
    'com.savagebot/dice-anim/',
    'com.savagebot/mine/',
  ];
  return known.find((prefix) => key.startsWith(prefix)) ?? key;
}

function reportDocument(label: string, metadata: Record<string, unknown>, capacity?: number): void {
  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, keyCost(key, value)] as const)
    .sort((a, b) => b[1] - a[1]);
  const total = JSON.stringify(metadata).length;

  const listed = Object.keys(metadata).length;
  const live = entries.length;
  log(
    `--- ${label}: ${total} chars, ${live} live key(s)` +
      (listed > live ? `, ${listed - live} tombstoned` : '') +
      (capacity ? ` — ${((total / capacity) * 100).toFixed(0)}% of ${capacity}` : ''),
  );

  if (!live) {
    log('  (empty)');
    return;
  }

  const groups = new Map<string, { chars: number; count: number }>();
  for (const [key, chars] of entries) {
    const name = family(key);
    const current = groups.get(name) ?? { chars: 0, count: 0 };
    groups.set(name, { chars: current.chars + chars, count: current.count + 1 });
  }

  log('  by family:');
  for (const [name, { chars, count }] of [...groups].sort((a, b) => b[1].chars - a[1].chars)) {
    log(
      `    ${name.padEnd(26)} ${String(chars).padStart(6)}  ${((chars / total) * 100)
        .toFixed(1)
        .padStart(5)}%${count > 1 ? `  (${count} keys)` : ''}`,
    );
  }

  log('  by key:');
  for (const [key, chars] of entries) log(`    ${key.padEnd(34)} ${String(chars).padStart(6)}`);
}

/** gzip + base64. Separated out so the report and the check cannot drift apart. */
async function gzipBase64(raw: string): Promise<string> {
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Compression, measured on **the room's real keys** rather than a synthetic roster.
 *
 * Round 3 got 5.1× on a made-up party and then failed the round trip with no way
 * to tell why, because the write was unguarded and the failure branch logged
 * neither the error nor what came back. Both are fixed here: the write is in a
 * try, and a mismatch prints the lengths and the first divergence.
 */
async function compressionCheck(): Promise<void> {
  if (typeof CompressionStream === 'undefined') {
    log('CompressionStream unavailable in this context', 'bad');
    return;
  }
  log('--- compression, on this room’s own keys ---');

  const room = await OBR.room.getMetadata();
  const sheets = Object.entries(room).filter(
    ([key, value]) => key.startsWith('com.savagebot/pc/') && value !== undefined,
  );
  if (!sheets.length) {
    log('  no PC keys in this room — nothing real to measure', 'bad');
    return;
  }

  // Per key, never one blob: `roster.ts` keeps one key per owner precisely so two
  // players editing two characters cannot collide, and compressing them together
  // would trade that away for a better ratio.
  let raw = 0;
  let packed = 0;
  for (const [key, value] of sheets) {
    const json = JSON.stringify(value);
    const encoded = await gzipBase64(json);
    raw += json.length;
    packed += encoded.length;
    log(
      `  ${key.replace('com.savagebot/pc/', '').padEnd(22)} ${String(json.length).padStart(5)} → ` +
        `${String(encoded.length).padStart(5)}  (${(json.length / encoded.length).toFixed(2)}×)`,
    );
  }
  log(
    `  ${sheets.length} sheet(s): ${raw} → ${packed}, ${(raw / packed).toFixed(2)}× overall, ` +
      `saving ${raw - packed} chars`,
    'ok',
  );

  // The round trip. Base64 is pure ASCII, so this should be uneventful — which is
  // exactly why round 3's failure needs a cause rather than a shrug.
  const key = `${PREFIX}-compressed`;
  const sample = await gzipBase64(JSON.stringify(sheets[0]![1]));
  try {
    await OBR.room.setMetadata({ [key]: sample });
  } catch (error) {
    log(`  round trip: the WRITE threw — ${describe(error)}`, 'bad');
    return;
  }
  const back = (await OBR.room.getMetadata())[key];
  if (back === sample) {
    log('  round trip: base64 survived room metadata intact', 'ok');
  } else if (back === undefined) {
    log(`  round trip FAILED: key absent after write — silently dropped (${sample.length} chars)`, 'bad');
  } else if (typeof back !== 'string') {
    log(`  round trip FAILED: came back as ${typeof back}, not a string`, 'bad');
  } else {
    const at = [...sample].findIndex((c, i) => back[i] !== c);
    log(
      `  round trip FAILED: sent ${sample.length} chars, got ${back.length}, ` +
        `first difference at ${at}`,
      'bad',
    );
  }
  await OBR.room.setMetadata({ [key]: undefined });
}

/**
 * Keys nothing owns any more.
 *
 * Round 4 found two kinds in a live room, both small and both permanent, which is
 * the combination that matters in an append-only-feeling 16 kB store:
 *
 *   - `com.savagebot/seat/<id>` — the *previous* schema. `seats.ts` says in as
 *     many words that the key is `place/` and **not** the old `seat/`, but nothing
 *     ever removed the old ones, so they are still being paid for.
 *   - `com.savagebot/bennies/<sheetId>` for a character that no longer exists.
 *     `Roster.remove` deletes the sheet and documents leaving the *rules-text*
 *     dictionary alone; it says nothing about bennies, and does not clear them.
 *
 * Reported, never deleted. This harness should not be in the business of removing
 * data it merely believes is unreferenced.
 */
async function orphanCheck(): Promise<void> {
  log('--- orphaned keys (reported only, nothing is deleted) ---');
  const room = await OBR.room.getMetadata();
  const live = (key: string) => room[key] !== undefined;
  const sheetIds = new Set(
    Object.keys(room)
      .filter((k) => k.startsWith('com.savagebot/pc/') && live(k))
      .map((k) => k.slice('com.savagebot/pc/'.length)),
  );

  let total = 0;
  const legacy = Object.keys(room).filter((k) => k.startsWith('com.savagebot/seat/') && live(k));
  for (const key of legacy) {
    const chars = keyCost(key, room[key]);
    total += chars;
    log(`  superseded schema: ${key} (${chars} chars) — replaced by place/`, 'bad');
  }

  const strayBennies = Object.keys(room).filter(
    (k) =>
      k.startsWith('com.savagebot/bennies/') &&
      live(k) &&
      !sheetIds.has(k.slice('com.savagebot/bennies/'.length)),
  );
  for (const key of strayBennies) {
    const chars = keyCost(key, room[key]);
    total += chars;
    log(`  no such character: ${key} (${chars} chars)`, 'bad');
  }

  log(
    total ? `  ${legacy.length + strayBennies.length} orphan(s), ${total} chars` : '  none',
    total ? 'bad' : 'ok',
  );
}

/**
 * How much of the rules-text dictionary is already in the shipped catalogue.
 *
 * Round 4 made this the decisive number: `rules-text` is 4,447 chars, 38% of the
 * room's real usage once the probe's own leftover blob is discounted. The
 * dictionary is *already* declared best-effort and rebuildable — `roster.ts`
 * documents it as evictable and `rebuildRulesText` regenerates it from the
 * catalogue that ships in the bundle. So every entry the catalogue can supply is
 * a paragraph being paid for twice.
 *
 * What cannot be dropped is text the book never had: a homebrew edge, or wording
 * that came off an imported card and differs from the printed entry. This splits
 * the dictionary into those two piles and prices them, because the *derivable*
 * pile is the saving and the *divergent* pile is the reason it cannot simply be
 * deleted.
 */
async function rulesTextCoverage(): Promise<void> {
  log('--- rules-text vs the shipped catalogue ---');
  const text = (await OBR.room.getMetadata())['com.savagebot/rules-text'] as
    | Record<string, string>
    | undefined;
  if (!text || !Object.keys(text).length) {
    log('  no rules-text dictionary in this room');
    return;
  }

  let identical = 0;
  let divergent = 0;
  let missing = 0;
  const cost = (name: string) => keyCost(name, text[name]);
  const divergentNames: string[] = [];
  const missingNames: string[] = [];

  for (const name of Object.keys(text)) {
    const found = findEntry(name)?.text;
    if (found === undefined) {
      missing += cost(name);
      missingNames.push(name);
    } else if (found.trim() === (text[name] ?? '').trim()) {
      identical += cost(name);
    } else {
      divergent += cost(name);
      divergentNames.push(name);
    }
  }

  const total = identical + divergent + missing;
  log(`  ${Object.keys(text).length} entries, ${total} chars`);
  log(`    identical to the catalogue .. ${String(identical).padStart(5)}  ← droppable outright`);
  log(`    differs from the catalogue .. ${String(divergent).padStart(5)}`);
  log(`    not in the catalogue ........ ${String(missing).padStart(5)}`);
  if (divergentNames.length) log(`    differing: ${divergentNames.join(', ')}`);
  if (missingNames.length) log(`    absent:    ${missingNames.join(', ')}`);

  // Round 4 found 27 of 30 differing and *none* missing, which is not what 27
  // homebrew edges look like — it is what one systematic difference looks like.
  // Whether it is cosmetic decides everything: curly quotes or trailing
  // whitespace means the whole dictionary is droppable, whereas a card that
  // abridges the printed entry means the stored text is the shorter one and
  // dropping it would change what is on screen. Print enough to tell them apart.
  for (const name of divergentNames.slice(0, 3)) {
    const stored = text[name] ?? '';
    const book = findEntry(name)?.text ?? '';
    const at = [...stored].findIndex((c, i) => book[i] !== c);
    log(`  ── ${name}: stored ${stored.length} chars, catalogue ${book.length}, differ at ${at}`);
    log(`      stored:    …${JSON.stringify(stored.slice(Math.max(0, at - 20), at + 60))}`);
    log(`      catalogue: …${JSON.stringify(book.slice(Math.max(0, at - 20), at + 60))}`);
  }
  const shorter = divergentNames.filter(
    (n) => (text[n] ?? '').length < (findEntry(n)?.text ?? '').length,
  ).length;
  if (divergentNames.length) {
    log(
      `  of the ${divergentNames.length} differing, ${shorter} are SHORTER than the book — ` +
        `if that is most of them the cards are abridged, and the catalogue is the better text`,
    );
  }
  log(
    `  storing only what the catalogue cannot supply would save ${identical} chars ` +
      `(${((identical / total) * 100).toFixed(0)}% of the dictionary)`,
    identical ? 'ok' : 'bad',
  );
}

/**
 * **The one button.** Measures and logs everything, and writes nothing that is not
 * cleaned up — so it is safe to press in a live room mid-session.
 *
 * Deliberately not a capacity search: the caps are known now (room 16,384; item
 * 512 kB; scene ≥8 MB), and re-bisecting them fills the room with filler and
 * trips the rate limiter for no new information. What was never known is where
 * the bytes actually go, which is what this answers.
 */
async function storageReport(): Promise<void> {
  log('════════ storage report ════════');

  reportDocument('ROOM metadata', await OBR.room.getMetadata(), ROOM_CAPACITY);

  if (await OBR.scene.isReady()) {
    reportDocument('SCENE metadata', await OBR.scene.getMetadata());
  } else {
    log('--- SCENE metadata: no scene open', 'bad');
  }

  // Item metadata is per token and roomy, so the interesting figure is the total
  // across the scene rather than any one token — that is what a move to items or
  // to scene-scoped storage would be competing with.
  if (await OBR.scene.isReady()) {
    const items = await OBR.scene.items.getItems();
    const bound = items.filter((item) => Object.keys(item.metadata ?? {}).length);
    const chars = bound.reduce((a, item) => a + JSON.stringify(item.metadata).length, 0);
    log(
      `--- ITEM metadata: ${chars} chars over ${bound.length} of ${items.length} items ` +
        `(cap is 512 kB *each*)`,
    );
  }

  await orphanCheck();
  await rulesTextCoverage();
  await compressionCheck();

  // Can a player write scene metadata? This decides how much of the roster can
  // move there: villains are the Marshal's, but a PC sheet is edited by its owner,
  // and `roster.ts` is built one-key-per-owner because of that.
  log('--- scene metadata write permission ---');
  const role = await OBR.player.getRole();
  if (!(await OBR.scene.isReady())) {
    log('  no scene open — cannot test', 'bad');
  } else {
    const key = `${PREFIX}-perm`;
    try {
      await OBR.scene.setMetadata({ [key]: 'probe' });
      const ok = (await OBR.scene.getMetadata())[key] === 'probe';
      log(
        `  as ${role}: scene metadata write ${ok ? 'SUCCEEDED' : 'was silently dropped'}`,
        ok ? 'ok' : 'bad',
      );
      await OBR.scene.setMetadata({ [key]: undefined });
    } catch (error) {
      log(`  as ${role}: scene metadata write REJECTED — ${describe(error)}`, 'bad');
    }
    if (role === 'GM') log('  run this again as a PLAYER — that is the answer that matters');
  }

  log('════════ end of report ════════', 'ok');
}

/**
 * **The other button.** Remove every probe key from every store.
 *
 * Chunk-aware, which the old cleaner was not. Round 3 wrote an 8 MB blob to scene
 * metadata and then could not clear it: assigning `undefined` threw `4014 Max
 * chunk exceeded`, because the host has to sync the *existing* oversized value to
 * apply the change. Overwriting with something tiny first shrinks the document
 * below the chunk boundary, and only then does the delete go through.
 */
async function deepClean(): Promise<void> {
  log('════════ deep clean ════════');

  const room = await OBR.room.getMetadata();
  const roomKeys = Object.keys(room).filter((k) => isProbeKey(k) && room[k] !== undefined);
  if (roomKeys.length) {
    await OBR.room.setMetadata(Object.fromEntries(roomKeys.map((k) => [k, undefined])));
    const after = await OBR.room.getMetadata();
    const left = roomKeys.filter((k) => after[k] !== undefined);
    log(
      `room: cleared ${roomKeys.length - left.length}/${roomKeys.length} probe key(s), ` +
        `now ${JSON.stringify(after).length} chars`,
      left.length ? 'bad' : 'ok',
    );
  } else {
    log('room: no probe keys', 'ok');
  }

  if (await OBR.scene.isReady()) {
    const scene = await OBR.scene.getMetadata();
    const sceneKeys = Object.keys(scene).filter((k) => isProbeKey(k) && scene[k] !== undefined);
    for (const key of sceneKeys) {
      const size = JSON.stringify(scene[key]).length;
      try {
        // Shrink, *then* delete. One step for a small value, two for a big one —
        // and the shrink is what makes the delete survivable at 8 MB.
        if (size > 1024) {
          await OBR.scene.setMetadata({ [key]: 'x' });
          log(`  scene: shrank ${key} from ${size} chars to 1`);
        }
        await OBR.scene.setMetadata({ [key]: undefined });
        log(`  scene: cleared ${key} (was ${size} chars)`, 'ok');
      } catch (error) {
        log(`  scene: could NOT clear ${key} (${size} chars) — ${describe(error)}`, 'bad');
      }
    }
    log(
      sceneKeys.length
        ? `scene: now ${JSON.stringify(await OBR.scene.getMetadata()).length} chars`
        : 'scene: no probe keys',
      'ok',
    );

    // Probe keys on tokens, and the stray markers the attachment test builds.
    const items = await OBR.scene.items.getItems();
    const dirty = items.filter((item) => Object.keys(item.metadata ?? {}).some(isProbeKey));
    if (dirty.length) {
      await OBR.scene.items.updateItems(
        dirty.map((i) => i.id),
        (drafts) => {
          for (const draft of drafts) {
            // `undefined`, not `delete`: OBR rejects delete on the Immer draft.
            for (const key of Object.keys(draft.metadata)) {
              if (isProbeKey(key)) draft.metadata[key] = undefined;
            }
          }
        },
      );
      log(`items: cleared probe keys from ${dirty.length} item(s)`, 'ok');
    } else {
      log('items: no probe keys', 'ok');
    }

    const locals = await OBR.scene.local.getItems();
    const markers = locals.filter((item) => Object.keys(item.metadata ?? {}).some(isProbeKey));
    if (markers.length) {
      await OBR.scene.local.deleteItems(markers.map((i) => i.id));
      log(`local: deleted ${markers.length} leftover marker(s)`, 'ok');
    }
  } else {
    log('scene: not open — scene, item and local stores not cleaned', 'bad');
  }

  await OBR.player.setMetadata({ [STAMP_KEY]: undefined });
  await showStamps();
  log('════════ clean ════════', 'ok');
}

/**
 * Does a `scene.local` item follow a synced token it is attached to?
 *
 * This decides how status badges are drawn. Local items are not synced, so each
 * client renders its own — which costs nothing in scene storage, pollutes no undo
 * history, and sidesteps leader election entirely, because there is no shared
 * write to collide over. All of that is worthless if the badge does not move with
 * the token.
 *
 * Fully automated: attach a marker, move the token, see whether the marker moved.
 */
async function attachmentTest(): Promise<void> {
  const selection = await OBR.player.getSelection();
  const tokenId = selection?.[0];
  if (!tokenId) {
    log('select a token first', 'bad');
    return;
  }
  const [token] = await OBR.scene.items.getItems([tokenId]);
  if (!token) {
    log('selection is not a scene item', 'bad');
    return;
  }
  const home = { ...token.position };
  log(`--- local-item attachment, on "${token.name}" ---`);

  const marker = buildShape()
    .shapeType('CIRCLE')
    .width(20)
    .height(20)
    .position(home)
    .attachedTo(tokenId)
    .disableHit(true)
    .metadata({ [BLOB_KEY]: 'probe-marker' })
    .build();

  try {
    await OBR.scene.local.addItems([marker]);
    const before = (await OBR.scene.local.getItems([marker.id]))[0]?.position;
    if (!before) {
      log('local item was not created at all', 'bad');
      return;
    }
    log(`marker created at ${before.x.toFixed(0)},${before.y.toFixed(0)}`);

    await OBR.scene.items.updateItems([tokenId], (items) => {
      for (const item of items) item.position = { x: home.x + 250, y: home.y };
    });
    // Attachment is applied by the renderer, so give it a frame or two.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const after = (await OBR.scene.local.getItems([marker.id]))[0]?.position;
    const moved = after ? Math.round(after.x - before.x) : 0;
    log(`token moved +250; marker moved ${moved}`);
    if (Math.abs(moved - 250) < 2) {
      log('LOCAL ATTACHMENT WORKS — badges can be local, no leader election needed', 'ok');
    } else if (moved === 0) {
      log('local items do NOT follow a synced token — use synced attachments', 'bad');
    } else {
      log(`marker moved by ${moved}, not 250 — investigate before relying on it`, 'bad');
    }
  } catch (error) {
    log(`attachment test failed: ${describe(error)}`, 'bad');
  } finally {
    await OBR.scene.local.deleteItems([marker.id]);
    await OBR.scene.items.updateItems([tokenId], (items) => {
      for (const item of items) item.position = home;
    });
    log('marker removed, token put back');
  }
}

/**
 * Dump a token's geometry.
 *
 * Badge placement has now been wrong twice on one token and right on another,
 * which means the model of how OBR positions an image is wrong rather than the
 * arithmetic. Print what the item actually says instead of guessing a third time.
 */
async function tokenGeometry(): Promise<void> {
  const selection = await OBR.player.getSelection();
  const id = selection?.[0];
  if (!id) {
    log('select a token first', 'bad');
    return;
  }
  const [item] = await OBR.scene.items.getItems([id]);
  if (!item) {
    log('selection is not a scene item', 'bad');
    return;
  }
  const sceneDpi = await OBR.scene.grid.getDpi();
  const raw = item as unknown as {
    image?: { width?: number; height?: number };
    grid?: { dpi?: number; offset?: { x: number; y: number } };
    scale?: { x?: number; y?: number };
  };

  log(`--- geometry of "${item.name}" (${item.type}, ${item.layer}) ---`);
  log(`  scene dpi ......... ${sceneDpi}`);
  log(`  position .......... ${item.position.x.toFixed(1)}, ${item.position.y.toFixed(1)}`);
  log(`  scale ............. ${raw.scale?.x ?? '—'} x ${raw.scale?.y ?? '—'}`);
  log(`  image px .......... ${raw.image?.width ?? '—'} x ${raw.image?.height ?? '—'}`);
  log(`  image grid dpi .... ${raw.grid?.dpi ?? '(none)'}`);
  log(`  image grid offset . ${raw.grid?.offset ? `${raw.grid.offset.x}, ${raw.grid.offset.y}` : '(none)'}`);

  // The same arithmetic the extension uses, so a wrong number is visible here.
  const imageDpi = raw.grid?.dpi ?? sceneDpi;
  const unit = sceneDpi / imageDpi;
  const pixelsW = raw.image?.width ?? imageDpi;
  const pixelsH = raw.image?.height ?? imageDpi;
  const offset = raw.grid?.offset ?? { x: pixelsW / 2, y: pixelsH / 2 };
  const centre = {
    x: item.position.x + (pixelsW / 2 - offset.x) * unit * (raw.scale?.x ?? 1),
    y: item.position.y + (pixelsH / 2 - offset.y) * unit * (raw.scale?.y ?? 1),
  };
  const height = pixelsH * unit * (raw.scale?.y ?? 1);
  log(`  => computed centre  ${centre.x.toFixed(1)}, ${centre.y.toFixed(1)}`, 'ok');
  log(`  => computed height  ${height.toFixed(1)} (${(height / sceneDpi).toFixed(2)} squares)`, 'ok');
  log('  If the height is far off what you see on the map, that is the bug.');
}

// ---------------------------------------------------------------- range

/**
 * What `OBR.scene.grid.getDistance` actually returns.
 *
 * Round 3. Range matters because a Shooting roll is resolved at short / medium /
 * long, and the panel cannot offer that without knowing how far apart two tokens
 * are. The SDK has `getDistance(from, to)`, but its implementation is host-side —
 * the shipped file only posts a message — so the docstring is all there is, and it
 * does not say what the number *means*. Three readings are plausible and they
 * differ by a factor of the grid dpi and again by the scale multiplier:
 *
 *   1. scene pixels        — 300 for one 300dpi square
 *   2. grid cells          — 1
 *   3. scaled units        — 5, for a scale of "5ft"
 *
 * Guessing wrong makes every range in the app wrong by 60x, so this measures it
 * rather than assuming. It computes all three candidates from the geometry the
 * extension already derives, then says which one the host's answer matches.
 *
 * It also reports Euclidean against Chebyshev, since a square grid set to
 * CHEBYSHEV counts a diagonal as one square and Deadlands ranges are in yards.
 */
interface Placed {
  name: string;
  position: { x: number; y: number };
  centre: { x: number; y: number };
}

function centreOf(item: unknown, sceneDpi: number): { x: number; y: number } {
  const raw = item as {
    position: { x: number; y: number };
    image?: { width?: number; height?: number };
    grid?: { dpi?: number; offset?: { x: number; y: number } };
    scale?: { x?: number; y?: number };
  };
  const imageDpi = raw.grid?.dpi ?? sceneDpi;
  const unit = sceneDpi / imageDpi;
  const pixelsW = raw.image?.width ?? imageDpi;
  const pixelsH = raw.image?.height ?? imageDpi;
  const offset = raw.grid?.offset ?? { x: pixelsW / 2, y: pixelsH / 2 };
  const centre = {
    x: raw.position.x + (pixelsW / 2 - offset.x) * unit * (raw.scale?.x ?? 1),
    y: raw.position.y + (pixelsH / 2 - offset.y) * unit * (raw.scale?.y ?? 1),
  };
  return Number.isFinite(centre.x) && Number.isFinite(centre.y) ? centre : { ...raw.position };
}

async function showGrid(): Promise<void> {
  const [dpi, scale, type, measurement] = await Promise.all([
    OBR.scene.grid.getDpi(),
    OBR.scene.grid.getScale(),
    OBR.scene.grid.getType(),
    OBR.scene.grid.getMeasurement(),
  ]);
  fill('grid', [
    ['dpi', String(dpi)],
    ['type', type],
    ['measurement', measurement],
    ['scale raw', scale.raw],
    ['multiplier', String(scale.parsed.multiplier)],
    ['unit', scale.parsed.unit],
    ['digits', String(scale.parsed.digits)],
  ]);
}

async function rangeProbe(): Promise<void> {
  const selection = (await OBR.player.getSelection()) ?? [];
  if (selection.length !== 2) {
    log('select exactly two tokens', 'bad');
    return;
  }
  const items = await OBR.scene.items.getItems(selection);
  if (items.length !== 2) {
    log('selection is not two scene items', 'bad');
    return;
  }

  const [dpi, scale, type, measurement] = await Promise.all([
    OBR.scene.grid.getDpi(),
    OBR.scene.grid.getScale(),
    OBR.scene.grid.getType(),
    OBR.scene.grid.getMeasurement(),
  ]);

  const placed: Placed[] = items.map((item) => ({
    name: item.name,
    position: { ...item.position },
    centre: centreOf(item, dpi),
  }));
  const [a, b] = placed as [Placed, Placed];

  const dx = Math.abs(b.centre.x - a.centre.x);
  const dy = Math.abs(b.centre.y - a.centre.y);
  const euclideanPx = Math.hypot(dx, dy);
  // Kept in the dump because a hex map that reports these as equal is telling you
  // the two tokens are on a pure axis, which is worth seeing while placing them.
  const chebyshevPx = Math.max(dx, dy);
  const manhattanPx = dx + dy;

  const [byPosition, byCentre] = await Promise.all([
    OBR.scene.grid.getDistance(a.position, b.position),
    OBR.scene.grid.getDistance(a.centre, b.centre),
  ]);

  log(`--- range: "${a.name}" to "${b.name}" ---`);
  log(`  grid .............. ${type}, ${measurement}, ${dpi}dpi, scale "${scale.raw}"`);
  log(`  centre delta ...... ${dx.toFixed(1)}, ${dy.toFixed(1)} px`);
  log(`  euclidean ......... ${euclideanPx.toFixed(1)} px`);
  log(`  chebyshev ......... ${chebyshevPx.toFixed(1)} px`);
  log(`  manhattan ......... ${manhattanPx.toFixed(1)} px`);
  log(`  getDistance(pos) .. ${byPosition}`);
  log(`  getDistance(ctr) .. ${byCentre}`, 'ok');

  // Not a square-grid model. The first run of this probe compared the host's
  // answer against euclidean/chebyshev/manhattan on the raw pixel delta and
  // reported NO MATCH on a hex map — those are square-grid rules, and on hex the
  // pixel delta says nothing directly. The host is doing hex topology, which is
  // the point of asking it rather than reimplementing it.
  //
  // What is still worth showing is the pixel separation next to the answer, so a
  // wildly wrong dpi is visible.
  log(`  cells if square ... ${(euclideanPx / dpi).toFixed(3)} (euclidean, for reference only)`);
  log(`  scale multiplier .. ${scale.parsed.multiplier} ${scale.parsed.unit}`);
  if (scale.parsed.multiplier === 1) {
    log(
      '  NOTE: a multiplier of 1 cannot distinguish "cells" from "scaled units" — ' +
        'they are the same number. Run the scale test below.',
      'bad',
    );
  }
}

/**
 * Does `getDistance` apply the scale multiplier, or return bare cells?
 *
 * The two are indistinguishable on a scene whose scale multiplier is 1 — which
 * is the common case, and was the case in the room where this was first run. The
 * only way to tell them apart is to change the multiplier and look again, so this
 * does exactly that: measures, sets a scale with a known multiplier, measures the
 * same two points, and puts the original scale back.
 *
 * It writes to the scene, which no other probe does. The original is logged
 * before anything changes, and restored in a `finally`, so a thrown error or a
 * closed tab still leaves it recoverable by hand.
 */
const SCALE_PROBE = '7ft';

async function scaleTest(): Promise<void> {
  const selection = (await OBR.player.getSelection()) ?? [];
  if (selection.length !== 2) {
    log('select exactly two tokens', 'bad');
    return;
  }
  const items = await OBR.scene.items.getItems(selection);
  if (items.length !== 2) {
    log('selection is not two scene items', 'bad');
    return;
  }
  const dpi = await OBR.scene.grid.getDpi();
  const [a, b] = items.map((item) => centreOf(item, dpi)) as [
    { x: number; y: number },
    { x: number; y: number },
  ];

  const original = await OBR.scene.grid.getScale();
  log(`--- scale test --- original scale is "${original.raw}" (x${original.parsed.multiplier})`);
  log('  if this probe dies part way through, set the scale back to that by hand');

  try {
    const before = await OBR.scene.grid.getDistance(a, b);
    log(`  at "${original.raw}" ......... ${before}`);

    await OBR.scene.grid.setScale(SCALE_PROBE);
    const applied = await OBR.scene.grid.getScale();
    if (applied.parsed.multiplier === original.parsed.multiplier) {
      log(`  scale did not change (still x${applied.parsed.multiplier}) — test inconclusive`, 'bad');
      return;
    }
    const after = await OBR.scene.grid.getDistance(a, b);
    log(`  at "${applied.raw}" ......... ${after}`);

    const ratio = before === 0 ? NaN : after / before;
    const expected = applied.parsed.multiplier / (original.parsed.multiplier || 1);
    log(`  ratio ............. ${ratio.toFixed(3)} (multiplier changed by ${expected.toFixed(3)})`);

    if (Math.abs(ratio - 1) < 0.01) {
      log('  CONCLUSION: getDistance returns BARE CELLS — apply the multiplier yourself', 'ok');
    } else if (Math.abs(ratio - expected) < 0.01) {
      log('  CONCLUSION: getDistance returns SCALED UNITS — do not multiply again', 'ok');
    } else {
      log('  the number moved, but not by the multiplier — look at the raw values above', 'bad');
    }
  } finally {
    await OBR.scene.grid.setScale(original.raw);
    const restored = await OBR.scene.grid.getScale();
    log(
      `  scale restored to "${restored.raw}"`,
      restored.raw === original.raw ? 'ok' : 'bad',
    );
  }
}

OBR.onReady(async () => {
  button('storage-report', storageReport);
  button('deep-clean', deepClean);
  button('stamp', stamp);
  button('clear-stamps', clearProbeKeys);
  button('room-cap', roomCap);
  button('scene-cap', sceneCap);
  button('scene-safe-cap', sceneSafeCap);
  button('scene-stamp', sceneStamp);
  button('scene-stamp-check', sceneStampCheck);
  button('scene-timing', sceneWriteTiming);
  button('item-cap', itemCap);
  button('item', writeToSelectedItem);
  button('compression', compressionCheck);
  button('attach', attachmentTest);
  button('geometry', tokenGeometry);
  button('range', rangeProbe);
  button('scale-test', scaleTest);

  await showIdentity();
  await showStamps();
  await showGrid().catch(() => log('no scene open, so no grid to read', 'bad'));
  log('ready — open a scene, then press "Storage report". "Deep clean" when finished.');

  OBR.room.onMetadataChange(() => void showStamps());
  OBR.player.onChange(() => void showIdentity());
});
