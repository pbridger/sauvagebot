/**
 * Milestone 0 — throwaway storage probe.
 *
 * Answers the three questions in docs/OBR-DEADLANDS-PLAN.md §2 that cannot be
 * settled by reading the SDK, because they are host behaviour:
 *
 *   1. How much fits in room metadata? (decides whether PC sheets can live there)
 *   2. Does player metadata persist, and is `player.id` stable across a rejoin?
 *   3. Can a non-GM write item metadata? (decides whether players own their sheets)
 *
 * Everything it writes is under the `com.savagebot/probe*` keys and is removable
 * with "Clear stamps". Delete this whole directory once the answers are recorded.
 */
import OBR from '@owlbear-rodeo/sdk';

const STAMP_KEY = 'com.savagebot/probe-stamp';
const BLOB_KEY = 'com.savagebot/probe-blob';

const logEl = document.getElementById('log')!;

function log(message: string, cls?: 'ok' | 'bad'): void {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const el = document.getElementById(id) as HTMLButtonElement;
  el.addEventListener('click', async () => {
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
  const [name, role, connectionId, permissions] = await Promise.all([
    OBR.player.getName(),
    OBR.player.getRole(),
    OBR.player.getConnectionId(),
    OBR.room.getPermissions(),
  ]);
  fill('identity', [
    ['room', OBR.room.id],
    ['player id', OBR.player.id],
    ['connection', connectionId],
    ['name', name],
    ['role', role],
    ['restrictions', permissions.length ? permissions.join(', ') : '(none set)'],
  ]);
}

async function showStamps(): Promise<void> {
  const [room, player] = await Promise.all([OBR.room.getMetadata(), OBR.player.getMetadata()]);
  fill('stamps', [
    ['room stamp', formatStamp(room[STAMP_KEY])],
    ['player stamp', formatStamp(player[STAMP_KEY])],
    ['current player id', OBR.player.id],
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

/**
 * Deletes every probe key and *verifies* it. "Setting a key to undefined deletes
 * it" is an assumption, not a documented fact — and if it is wrong, every cleanup
 * path here would log success while leaving junk in the room. We only get one
 * live session, so the probe checks its own claims.
 */
async function clearProbeKeys(): Promise<void> {
  const roomBefore = Object.keys(await OBR.room.getMetadata()).filter(isProbeKey);
  const update: Record<string, undefined> = {};
  for (const key of roomBefore) update[key] = undefined;
  if (roomBefore.length) await OBR.room.setMetadata(update);
  await OBR.player.setMetadata({ [STAMP_KEY]: undefined });

  const roomAfter = Object.keys(await OBR.room.getMetadata()).filter(isProbeKey);
  const playerAfter = Object.keys(await OBR.player.getMetadata()).filter(isProbeKey);
  if (roomAfter.length || playerAfter.length) {
    log(
      `DELETE-BY-UNDEFINED DOES NOT WORK — survivors: ${[...roomAfter, ...playerAfter].join(', ')}`,
      'bad',
    );
  } else {
    log(`cleared ${roomBefore.length + 1} probe key(s); delete-by-undefined confirmed`, 'ok');
  }
  await showStamps();
}

function isProbeKey(key: string): boolean {
  return key.startsWith('com.savagebot/probe');
}

/**
 * Incompressible filler. A run of one character would measure nothing useful if
 * OBR compresses metadata anywhere between here and storage.
 */
function noise(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,.';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * A stand-in for one Deadlands PC sheet — roughly the right shape and size, with
 * the free-text fields (edges, hindrances, gear) that make sheets big.
 */
function dummySheet(index: number): unknown {
  return {
    id: `probe-${index}`,
    name: `Probe Character ${index}`,
    wildCard: true,
    traits: {
      agility: 8, smarts: 6, spirit: 6, strength: 6, vigor: 8,
      fighting: 8, shooting: 10, notice: 6, riding: 6, survival: 4,
      intimidation: 6, persuasion: 4, stealth: 6, athletics: 6,
    },
    derived: { parry: 6, toughness: 7, armor: 2, pace: 6, size: 0, grit: 1 },
    state: { wounds: 0, fatigue: 0, shaken: false, bennies: 3 },
    edges: [noise(140), noise(120), noise(160), noise(110)],
    hindrances: [noise(130), noise(150), noise(90)],
    gear: [noise(180), noise(160), noise(140), noise(200), noise(120)],
    powers: [noise(220), noise(240)],
    notes: noise(600),
  };
}

/**
 * The decision this probe exists to make is "do the party's PC sheets fit in room
 * metadata", so it measures in *sheets*, not characters — which sidesteps every
 * question about encoding, escaping and compression at once. One key per sheet,
 * because that is how the real thing would store them.
 */
async function measureCap(): Promise<void> {
  log('--- how many PC sheets fit in room metadata? ---');
  const sample = JSON.stringify(dummySheet(0));
  log(`one dummy sheet is ${sample.length} chars of JSON`);

  let stored = 0;
  for (let i = 1; i <= 40; i++) {
    const key = `com.savagebot/probe-roster/${i}`;
    try {
      await OBR.room.setMetadata({ [key]: dummySheet(i) });
    } catch (error) {
      log(`sheet ${i}: REJECTED — ${describe(error)}`, 'bad');
      break;
    }
    const back = await OBR.room.getMetadata();
    if (!back[key]) {
      log(`sheet ${i}: silently dropped — write returned, key absent`, 'bad');
      break;
    }
    stored = i;
  }
  const budget = stored * sample.length;
  log(
    `FITS: ${stored} sheets (~${(budget / 1024).toFixed(1)} kB of sheet JSON)`,
    stored >= 8 ? 'ok' : 'bad',
  );

  // Secondary: does the limit throw, or truncate silently? Error handling in the
  // real extension depends on which, and it is one write to find out.
  const huge = noise(1024 * 1024);
  try {
    await OBR.room.setMetadata({ [BLOB_KEY]: huge });
    const back = (await OBR.room.getMetadata())[BLOB_KEY];
    if (typeof back === 'string' && back.length === huge.length) {
      log('1 MB single key accepted intact — no practical cap on a single value', 'ok');
    } else if (typeof back === 'string') {
      log(`OVERSIZE WRITES TRUNCATE SILENTLY: 1 MB read back as ${back.length} chars`, 'bad');
    } else {
      log('1 MB write returned but the key is absent — silent drop, no error', 'bad');
    }
  } catch (error) {
    log(`oversize writes throw (good, detectable): ${describe(error)}`, 'ok');
  }

  await clearProbeKeys();
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
    log(`item write OK as ${role} on ${item?.name ?? selection[0]} (${item?.layer})`, 'ok');
  } else {
    log(`item write SILENTLY DROPPED as ${role} — no error, but not stored`, 'bad');
  }
}

OBR.onReady(async () => {
  button('stamp', stamp);
  button('clear-stamps', clearProbeKeys);
  button('cap', measureCap);
  button('item', writeToSelectedItem);

  await showIdentity();
  await showStamps();
  log('ready');

  OBR.room.onMetadataChange(() => void showStamps());
  OBR.player.onChange(() => void showIdentity());
});
