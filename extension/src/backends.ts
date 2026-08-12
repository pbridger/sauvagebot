/**
 * The only place the OBR SDK meets the storage layer.
 *
 * `src/obr/store.ts` deliberately knows nothing about OBR so it can be tested in
 * node. These adapters are the thin edge that cannot be — keep them trivial, so
 * that everything worth testing stays on the other side of the `Backend`
 * interface.
 */
import OBR from '@owlbear-rodeo/sdk';
import {
  ITEM_CAPACITY,
  ROOM_CAPACITY,
  VerifiedStore,
  type Backend,
} from '../../src/obr/store.js';
import { Roster } from '../../src/obr/roster.js';
import { electLeader, type Peer } from '../../src/obr/leader.js';

const roomBackend: Backend = {
  get: () => OBR.room.getMetadata(),
  set: (update) => OBR.room.setMetadata(update),
};

/**
 * One token's metadata as a `Backend`.
 *
 * Note `undefined` rather than `delete` for removal: milestone 0 found OBR rejects
 * `delete` on the Immer draft.
 */
export function itemBackend(itemId: string): Backend {
  return {
    async get() {
      const [item] = await OBR.scene.items.getItems([itemId]);
      return item?.metadata ?? {};
    },
    async set(update) {
      await OBR.scene.items.updateItems([itemId], (items) => {
        for (const item of items) Object.assign(item.metadata, update);
      });
    },
  };
}

export function roomStore(onWarning?: (message: string) => void): VerifiedStore {
  return new VerifiedStore(roomBackend, {
    capacity: ROOM_CAPACITY,
    ...(onWarning ? { onWarning } : {}),
  });
}

export function itemStore(itemId: string): VerifiedStore {
  return new VerifiedStore(itemBackend(itemId), { capacity: ITEM_CAPACITY });
}

export function roster(onWarning?: (message: string) => void): Roster {
  return new Roster(roomStore(onWarning));
}

/**
 * The party as the election sees it. `OBR.party.getPlayers()` reports everyone
 * *else*, so self has to be added — forgetting that would mean a solo GM elects
 * nobody and every shared write silently stops happening.
 */
export async function peers(): Promise<Peer[]> {
  const [others, role, connectionId] = await Promise.all([
    OBR.party.getPlayers(),
    OBR.player.getRole(),
    OBR.player.getConnectionId(),
  ]);
  return [
    { connectionId, role },
    ...others.map((p) => ({ connectionId: p.connectionId, role: p.role })),
  ];
}

/**
 * Re-reads the party every time rather than caching.
 *
 * Election is advisory (see `src/obr/leader.ts`): a cached party list is a stale
 * one, and the window where two clients both believe they lead is exactly when a
 * chip gets drawn twice. Checking immediately before the write keeps that window
 * as small as the SDK allows.
 */
export async function amLeader(): Promise<boolean> {
  const [party, connectionId] = await Promise.all([peers(), OBR.player.getConnectionId()]);
  return electLeader(party) === connectionId;
}
