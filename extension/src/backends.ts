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
import {
  TOKEN_KEY,
  autoBindings,
  newTokenState,
  readBinding,
  type TokenLike,
  type TokenState,
} from '../../src/obr/binding.js';
import type { Sheet } from '../../src/rules/sheet.js';
import {
  isInitiativeState,
  newInitiative,
  type InitiativeState,
} from '../../src/rules/initiative.js';
import { JavaRandom } from '../../src/dice/javaRandom.js';
import type { Card } from '../../src/game/cards.js';

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

// ---------------------------------------------------------------- tokens

/** Every character token in the current scene, in the shape `binding.ts` expects. */
export async function characterTokens(): Promise<
  (TokenLike & {
    imageUrl?: string;
    position: { x: number; y: number };
    /** Rendered height in scene units, for placing badges clear of the artwork. */
    height: number;
  })[]
> {
  if (!(await OBR.scene.isReady())) return [];
  const [items, sceneDpi] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.scene.grid.getDpi(),
  ]);
  return items
    .filter((item) => item.layer === 'CHARACTER')
    .map((item) => {
      const asImage = item as {
        image?: { url?: string; height?: number };
        grid?: { dpi?: number };
        scale?: { y?: number };
      };
      const image = asImage.image?.url;
      // OBR scales an image so its own grid dpi maps onto the scene's, then
      // applies the item's scale. Guessing "one square" was what put the badge
      // over the artwork on anything larger.
      const imageDpi = asImage.grid?.dpi ?? sceneDpi;
      const pixels = asImage.image?.height ?? imageDpi;
      const height = (pixels * sceneDpi) / imageDpi * (asImage.scale?.y ?? 1);
      return {
        id: item.id,
        name: item.name,
        layer: item.layer,
        metadata: item.metadata,
        // Needed to place a badge: an attached item keeps its own position and
        // moves with the parent by delta, so it must start in the right spot.
        position: { ...item.position },
        height: Number.isFinite(height) && height > 0 ? height : sceneDpi,
        ...(image ? { imageUrl: image } : {}),
      };
    });
}

export async function bindToken(tokenId: string, sheetId: string): Promise<void> {
  await OBR.scene.items.updateItems([tokenId], (items) => {
    for (const item of items) {
      const existing = readBinding(item.metadata);
      // Re-binding an already-bound token keeps its wounds: the GM is usually
      // fixing a mistaken link mid-fight, not resetting the character.
      item.metadata[TOKEN_KEY] = existing
        ? { ...existing, sheetId }
        : newTokenState(sheetId);
    }
  });
}

export async function unbindToken(tokenId: string): Promise<void> {
  // `undefined`, not `delete` — measured in milestone 0: OBR rejects `delete` on
  // the Immer draft of item metadata.
  await OBR.scene.items.updateItems([tokenId], (items) => {
    for (const item of items) item.metadata[TOKEN_KEY] = undefined;
  });
}

export async function updateTokenState(
  tokenId: string,
  change: (state: TokenState) => TokenState,
): Promise<void> {
  await OBR.scene.items.updateItems([tokenId], (items) => {
    for (const item of items) {
      const existing = readBinding(item.metadata);
      if (existing) item.metadata[TOKEN_KEY] = change(existing);
    }
  });
}

/**
 * Bind whatever is unambiguous, and report how many.
 *
 * Called when a scene opens, because item metadata is per-scene: without this
 * the GM would re-bind the whole party on every new map. `autoBindings` only
 * matches one-to-one, so this cannot quietly attach three bandits to one sheet.
 */
export async function autoBind(sheets: readonly Sheet[]): Promise<number> {
  const tokens = await characterTokens();
  const bindings = autoBindings(tokens, sheets);
  for (const { tokenId, sheetId } of bindings) await bindToken(tokenId, sheetId);
  return bindings.length;
}

// ---------------------------------------------------------------- initiative

export const INITIATIVE_KEY = 'com.savagebot/initiative';

/**
 * The deck lives in scene metadata: a fight belongs to a scene, and starting a
 * new map should start a new fight rather than resume the last one.
 *
 * Each combatant's *card* lives on their own token instead, so five bandits
 * sharing one sheet still get five different cards, and no shared list has to be
 * kept in step with which tokens actually exist.
 */
export async function readInitiative(): Promise<InitiativeState | undefined> {
  if (!(await OBR.scene.isReady())) return undefined;
  const value = (await OBR.scene.getMetadata())[INITIATIVE_KEY];
  return isInitiativeState(value) ? value : undefined;
}

export async function writeInitiative(state: InitiativeState | undefined): Promise<void> {
  await OBR.scene.setMetadata({ [INITIATIVE_KEY]: state });
}

export async function freshInitiative(): Promise<InitiativeState> {
  const state = newInitiative(new JavaRandom());
  await writeInitiative(state);
  return state;
}

/** Write dealt cards onto their tokens in one update, so the map redraws once. */
export async function setCards(cards: ReadonlyMap<string, Card | undefined>): Promise<void> {
  const ids = [...cards.keys()];
  if (!ids.length) return;
  await OBR.scene.items.updateItems(ids, (items) => {
    for (const item of items) {
      const existing = readBinding(item.metadata);
      if (!existing) continue;
      const card = cards.get(item.id);
      item.metadata[TOKEN_KEY] = card ? { ...existing, card } : { ...existing, card: undefined };
    }
  });
}
