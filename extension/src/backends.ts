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
  SCENE_CAPACITY,
  VerifiedStore,
  type Backend,
} from '../../src/obr/store.js';
import { Roster } from '../../src/obr/roster.js';
import { findEntry } from '../../src/rules/catalogue.js';
import { electLeader, type Peer } from '../../src/obr/leader.js';
import {
  TOKEN_KEY,
  autoBindings,
  newTokenState,
  readBinding,
  resetSceneState,
  type TokenLike,
  type TokenState,
} from '../../src/obr/binding.js';
import type { Sheet } from '../../src/rules/sheet.js';
import { clearHand, setHand } from '../../src/rules/hand.js';
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

/**
 * Scene metadata as a `Backend`. The same two methods the room exposes.
 *
 * Measured 2026-08-27 (probe round 6): 1 MB round-trips in 22 ms, ten 40 kB
 * writes ran at a median of 4 ms with no rate limiting, and a stamp survived
 * closing and reopening the tab. It is durable storage, not a session cache.
 */
const sceneBackend: Backend = {
  get: () => OBR.scene.getMetadata() as Promise<Record<string, unknown>>,
  set: (update) => OBR.scene.setMetadata(update),
};

export function roomStore(onWarning?: (message: string) => void): VerifiedStore {
  return new VerifiedStore(roomBackend, {
    capacity: ROOM_CAPACITY,
    ...(onWarning ? { onWarning } : {}),
  });
}

export function itemStore(itemId: string): VerifiedStore {
  return new VerifiedStore(itemBackend(itemId), { capacity: ITEM_CAPACITY });
}

export function sceneStore(onWarning?: (message: string) => void): VerifiedStore {
  return new VerifiedStore(sceneBackend, {
    capacity: SCENE_CAPACITY,
    ...(onWarning ? { onWarning } : {}),
  });
}

/**
 * The roster, told where the rulebook is.
 *
 * The lookup is supplied here rather than imported inside `roster.ts` so that
 * module stays free of the catalogue and can be tested against any book. With it,
 * an edge the book knows is stored as a name alone and its text is fetched from
 * the bundle on the way out.
 */
export async function roster(onWarning?: (message: string) => void): Promise<Roster> {
  // No scene, no scene store — and that is a real state rather than a defensive
  // `undefined`: Owlbear opens a room without opening a board, and the roster has
  // to keep working, showing the campaign half and saying so when a villain has
  // nowhere scene-shaped to go.
  const scene = (await OBR.scene.isReady()) ? sceneStore(onWarning) : undefined;
  return new Roster(
    { room: roomStore(onWarning), ...(scene ? { scene } : {}) },
    onWarning ?? (() => {}),
    (name) => findEntry(name)?.text,
  );
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
    /** Rendered size in scene units, for placing badges clear of the artwork. */
    width: number;
    height: number;
    /**
     * Whether the token is on the map to be seen. A target list built from
     * everything would offer the Marshal's not-yet-revealed ambush as something
     * to shoot at.
     */
    visible: boolean;
    /**
     * The artwork's centre in scene units. Not the same as `position`: an image
     * is anchored at its `grid.offset`, which is often not the middle.
     */
    centre: { x: number; y: number };
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
        image?: { url?: string; width?: number; height?: number };
        grid?: { dpi?: number; offset?: { x: number; y: number } };
        scale?: { x?: number; y?: number };
        /** The label drawn under the token on the map. See `TokenLike.label`. */
        text?: { plainText?: string };
      };
      const image = asImage.image?.url;
      // OBR scales an image so its own grid dpi maps onto the scene's, then
      // applies the item's scale. Guessing "one square" was what put the badge
      // over the artwork on anything larger.
      const imageDpi = asImage.grid?.dpi ?? sceneDpi;
      const unit = sceneDpi / imageDpi;
      const scaleX = asImage.scale?.x ?? 1;
      const scaleY = asImage.scale?.y ?? 1;
      const pixelsW = asImage.image?.width ?? imageDpi;
      const pixelsH = asImage.image?.height ?? imageDpi;
      const width = pixelsW * unit * scaleX;
      const height = pixelsH * unit * scaleY;

      // An item's `position` is its `grid.offset` point, not its middle. Tokens
      // whose offset is the centre look right either way; one that is anchored
      // anywhere else had its badges displaced in both axes at once.
      const offset = asImage.grid?.offset ?? { x: pixelsW / 2, y: pixelsH / 2 };
      const centre = {
        x: item.position.x + (pixelsW / 2 - offset.x) * unit * scaleX,
        y: item.position.y + (pixelsH / 2 - offset.y) * unit * scaleY,
      };
      // Owlbear keeps an empty label as an empty string rather than dropping it,
      // so a blank one has to be treated as absent or every unlabelled token
      // would be called "".
      const label = asImage.text?.plainText?.trim();

      return {
        id: item.id,
        name: item.name,
        ...(label ? { label } : {}),
        layer: item.layer,
        metadata: item.metadata,
        // Needed to place a badge: an attached item keeps its own position and
        // moves with the parent by delta, so it must start in the right spot.
        position: { ...item.position },
        visible: item.visible,
        width: Number.isFinite(width) && width > 0 ? width : sceneDpi,
        height: Number.isFinite(height) && height > 0 ? height : sceneDpi,
        centre: Number.isFinite(centre.x) && Number.isFinite(centre.y)
          ? centre
          : { ...item.position },
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
 * Wipe the fight off every bound token in the scene, keeping the bindings.
 *
 * One `updateItems` call for the lot, so the map redraws once, and so a Marshal
 * cannot end up with half the party reset. See `resetSceneState` for exactly
 * what is cleared.
 *
 * @returns how many tokens were changed.
 */
export async function resetAllTokens(): Promise<number> {
  const tokens = await characterTokens();
  const bound = tokens.filter((token) => readBinding(token.metadata));
  if (!bound.length) return 0;
  await OBR.scene.items.updateItems(
    bound.map((token) => token.id),
    (items) => {
      for (const item of items) {
        const existing = readBinding(item.metadata);
        if (existing) item.metadata[TOKEN_KEY] = resetSceneState(existing);
      }
    },
  );
  return bound.length;
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
/**
 * Write a whole hand onto each token, or clear it.
 *
 * A hand rather than a card because Level Headed draws more than one and the
 * player chooses between them — see `hand.ts`. `card` is written too, as the
 * chosen one, so every reader that wants a single card is untouched.
 */
export async function setHands(
  hands: ReadonlyMap<string, { cards: readonly Card[]; chosen: Card } | undefined>,
): Promise<void> {
  const ids = [...hands.keys()];
  if (!ids.length) return;
  await OBR.scene.items.updateItems(ids, (items) => {
    for (const item of items) {
      const existing = readBinding(item.metadata);
      if (!existing) continue;
      const hand = hands.get(item.id);
      item.metadata[TOKEN_KEY] = hand
        ? setHand(existing, hand.cards, hand.chosen)
        : // Spread, because Owlbear rejects `delete` on the Immer draft and a
          // cleared hand has to actually stop being three fields.
          { ...clearHand(existing), card: undefined, cards: undefined, chosen: undefined };
    }
  });
}
