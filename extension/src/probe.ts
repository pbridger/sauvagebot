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

async function clearStamps(): Promise<void> {
  // OBR treats an explicit `undefined` as a key deletion.
  await OBR.room.setMetadata({ [STAMP_KEY]: undefined, [BLOB_KEY]: undefined });
  await OBR.player.setMetadata({ [STAMP_KEY]: undefined });
  log('cleared probe keys from room and player metadata');
  await showStamps();
}

/**
 * A write "succeeds" only if it reads back at full length. A silent truncation
 * or a dropped write would otherwise look like success.
 */
async function tryBlob(size: number): Promise<{ ok: boolean; detail: string }> {
  const payload = 'x'.repeat(size);
  try {
    await OBR.room.setMetadata({ [BLOB_KEY]: payload });
  } catch (error) {
    return { ok: false, detail: `rejected: ${describe(error)}` };
  }
  const stored = (await OBR.room.getMetadata())[BLOB_KEY];
  if (typeof stored !== 'string') return { ok: false, detail: `read back as ${typeof stored}` };
  if (stored.length !== size) return { ok: false, detail: `read back ${stored.length} chars` };
  return { ok: true, detail: 'read back intact' };
}

async function measureCap(): Promise<void> {
  const CEILING = 4 * 1024 * 1024;
  let lastOk = 0;
  let firstBad = 0;

  log('--- room metadata capacity ---');
  for (let size = 1024; size <= CEILING; size *= 2) {
    const { ok, detail } = await tryBlob(size);
    log(`${size} chars: ${ok ? 'ok' : 'FAILED'} — ${detail}`, ok ? 'ok' : 'bad');
    if (!ok) {
      firstBad = size;
      break;
    }
    lastOk = size;
  }

  if (!firstBad) {
    log(`no limit found below ${CEILING} chars — suspicious, check for silent truncation`, 'bad');
  } else if (!lastOk) {
    log('even 1024 chars failed — something else is wrong', 'bad');
  } else {
    // Narrow to within 256 chars; finer than that does not change any decision.
    let lo = lastOk;
    let hi = firstBad;
    while (hi - lo > 256) {
      const mid = Math.floor((lo + hi) / 2);
      const { ok, detail } = await tryBlob(mid);
      log(`  probe ${mid}: ${ok ? 'ok' : 'FAILED'} — ${detail}`);
      if (ok) lo = mid;
      else hi = mid;
    }
    log(`CAP: largest single-key value is ~${lo} chars (${(lo / 1024).toFixed(1)} kB)`, 'ok');
  }

  await OBR.room.setMetadata({ [BLOB_KEY]: undefined });
  log('cleaned up blob key');
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
  button('clear-stamps', clearStamps);
  button('cap', measureCap);
  button('item', writeToSelectedItem);

  await showIdentity();
  await showStamps();
  log('ready');

  OBR.room.onMetadataChange(() => void showStamps());
  OBR.player.onChange(() => void showIdentity());
});
