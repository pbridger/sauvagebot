/**
 * Milestone 0 — throwaway storage probe. Round 2.
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
 * Everything written lives under `com.savagebot/probe*`. Delete this directory
 * once the answers are in docs/OBR-DEADLANDS-PLAN.md §2.
 */
import OBR from '@owlbear-rodeo/sdk';

const PREFIX = 'com.savagebot/probe';
const STAMP_KEY = `${PREFIX}-stamp`;
const BLOB_KEY = `${PREFIX}-blob`;

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
  const selection = await OBR.player.getSelection();
  for (const id of selection ?? []) await cleanItem(id);

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
  log(
    left.length ? `item probe keys SURVIVED: ${left.join(', ')}` : 'item probe keys cleared',
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

/**
 * Compression turns a marginal fit into a comfortable one: real sheet JSON is
 * highly repetitive, unlike the noise used to measure the cap. Confirms that
 * CompressionStream exists in this context and that base64 survives a round trip.
 */
async function compressionCheck(): Promise<void> {
  if (typeof CompressionStream === 'undefined') {
    log('CompressionStream unavailable in this context', 'bad');
    return;
  }
  const roster = Array.from({ length: 6 }, (_, i) => ({
    id: `pc-${i}`,
    name: `Character ${i}`,
    wildCard: true,
    traits: { agility: 8, smarts: 6, spirit: 6, strength: 6, vigor: 8, fighting: 8, shooting: 10 },
    derived: { parry: 6, toughness: 7, armor: 2, pace: 6, grit: 1 },
    edges: ['Quick', 'Level Headed', 'Marksman', 'Steady Hands'],
    hindrances: ['Loyal', 'Stubborn', 'Vengeful (Minor)'],
    gear: ['Colt Peacemaker', 'Winchester 76', 'Bowie knife', 'Duster', 'Horse'],
  }));
  const raw = JSON.stringify(roster);

  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const encoded = btoa(binary);

  log(`6 realistic sheets: ${raw.length} chars raw, ${encoded.length} gzip+base64`, 'ok');

  const key = `${PREFIX}-compressed`;
  await OBR.room.setMetadata({ [key]: encoded });
  const back = (await OBR.room.getMetadata())[key];
  log(
    back === encoded ? 'base64 round-tripped through room metadata intact' : 'base64 round trip FAILED',
    back === encoded ? 'ok' : 'bad',
  );
  await OBR.room.setMetadata({ [key]: undefined });
}

// ---------------------------------------------------------------- wiring

OBR.onReady(async () => {
  button('stamp', stamp);
  button('clear-stamps', clearProbeKeys);
  button('room-cap', roomCap);
  button('scene-cap', sceneCap);
  button('item-cap', itemCap);
  button('item', writeToSelectedItem);
  button('compression', compressionCheck);

  await showIdentity();
  await showStamps();
  log('ready — start with "Clear probe keys", your room still holds round 1 data');

  OBR.room.onMetadataChange(() => void showStamps());
  OBR.player.onChange(() => void showIdentity());
});
