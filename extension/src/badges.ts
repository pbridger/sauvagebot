/**
 * Status badges drawn on tokens.
 *
 * These are **local** items — `scene.local`, not synced. Probed in the live room
 * before committing to it: a local item attached to a synced token does follow it
 * (marker moved exactly 250 when the token did). That result is worth a lot:
 *
 *   - nothing is written to the scene, so no storage cost and no undo-history
 *     clutter from a dozen badge objects;
 *   - no shared write means **no leader election** — every client independently
 *     renders the same state from the same metadata, and they cannot collide;
 *   - a badge can never be left behind as an orphan, since local items die with
 *     the tab.
 *
 * The trade-off is that every client redraws for itself, which is cheap.
 */
import OBR, { buildShape, buildText, type Item } from '@owlbear-rodeo/sdk';
import { readBinding, type TokenLike } from '../../src/obr/binding.js';
import { badgeText, isIncapacitated } from '../../src/rules/status.js';
import type { Sheet } from '../../src/rules/sheet.js';

/** Marks our local items so we only ever clear up our own. */
export const BADGE_KEY = 'com.savagebot/badge';

const RED = '#8c2f22';
const AMBER = '#b06a1f';

interface Token extends TokenLike {
  position: { x: number; y: number };
}

/**
 * Rebuild every badge from scratch.
 *
 * Diffing would be faster and much easier to get subtly wrong — a stale badge on
 * a dead mook is exactly the sort of bug nobody notices until it matters. Local
 * items are cheap, so the whole set is replaced on any change.
 */
export async function renderBadges(
  tokens: readonly Token[],
  sheets: readonly Sheet[],
): Promise<void> {
  if (!(await OBR.scene.isReady())) return;

  const existing = await OBR.scene.local.getItems((item: Item) => item.metadata[BADGE_KEY] === true);
  if (existing.length) await OBR.scene.local.deleteItems(existing.map((item) => item.id));

  // Offset into the token's lower-right rather than over its face. A token is
  // one grid square, so the grid's dpi is the unit to work in.
  const dpi = await OBR.scene.grid.getDpi();
  const offset = { x: dpi * 0.3, y: dpi * 0.3 };

  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  const items: Item[] = [];

  for (const token of tokens) {
    const state = readBinding(token.metadata);
    if (!state) continue;
    const sheet = byId.get(state.sheetId);
    if (!sheet) continue;

    const text = badgeText(state, sheet.wildCard);
    if (!text) continue;

    const out = isIncapacitated(state, sheet.wildCard);
    const colour = out || state.wounds > 0 ? RED : AMBER;
    const position = { x: token.position.x + offset.x, y: token.position.y + offset.y };

    // A filled pill behind the text, because token art is arbitrary and unstyled
    // text over a light image is unreadable.
    items.push(
      buildShape()
        .shapeType('CIRCLE')
        .width(46)
        .height(30)
        .position(position)
        .fillColor(colour)
        .fillOpacity(0.85)
        .strokeWidth(0)
        .attachedTo(token.id)
        .disableHit(true)
        .locked(true)
        .layer('ATTACHMENT')
        .metadata({ [BADGE_KEY]: true })
        .build(),
      buildText()
        .plainText(text)
        .fontSize(20)
        .fontWeight(700)
        .textAlign('CENTER')
        .textAlignVertical('MIDDLE')
        .fillColor('#ffffff')
        .strokeWidth(0)
        .width(46)
        .height(30)
        .position(position)
        .attachedTo(token.id)
        .disableHit(true)
        .locked(true)
        .layer('ATTACHMENT')
        .metadata({ [BADGE_KEY]: true })
        .build(),
    );
  }

  if (items.length) await OBR.scene.local.addItems(items);
}

export async function clearBadges(): Promise<void> {
  if (!(await OBR.scene.isReady())) return;
  const existing = await OBR.scene.local.getItems((item: Item) => item.metadata[BADGE_KEY] === true);
  if (existing.length) await OBR.scene.local.deleteItems(existing.map((item) => item.id));
}
