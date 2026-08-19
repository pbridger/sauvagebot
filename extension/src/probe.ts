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
 * Everything written lives under `com.savagebot/probe*`.
 *
 * KEEP THIS around after milestone 0 rather than deleting it: it is the only
 * harness for checking real OBR behaviour in a live room, and the next surprise
 * will want it.
 */
import OBR, { buildShape } from '@owlbear-rodeo/sdk';

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
  button('stamp', stamp);
  button('clear-stamps', clearProbeKeys);
  button('room-cap', roomCap);
  button('scene-cap', sceneCap);
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
  log('ready — start with "Clear probe keys", your room still holds round 1 data');

  OBR.room.onMetadataChange(() => void showStamps());
  OBR.player.onChange(() => void showIdentity());
});
