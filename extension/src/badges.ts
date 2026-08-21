/**
 * Status badges drawn on tokens.
 *
 * These are **local** items — `scene.local`, not synced. Probed in the live room
 * before committing to it: a local item attached to a synced token does follow it
 * (the marker moved exactly 250 when the token did). That result is worth a lot:
 *
 *   - nothing is written to the scene, so no storage cost and no undo-history
 *     clutter from a dozen badge objects;
 *   - no shared write means **no leader election** — every client independently
 *     renders the same state from the same metadata, and they cannot collide;
 *   - a badge can never be left behind as an orphan, since local items die with
 *     the tab.
 *
 * The trade-off is that every client redraws for itself, which is cheap.
 *
 * Built with `buildLabel` rather than a shape plus a text item. Two reasons, one
 * of them learned the hard way: a Label carries its own background, so it is one
 * item instead of two — and `TextBuilder` defaults its content type to `"RICH"`,
 * so setting only `plainText` renders an item with no text in it. That was the
 * empty coloured ellipse. `LabelBuilder` defaults to `"PLAIN"`.
 */
import OBR, { buildLabel, type Item } from '@owlbear-rodeo/sdk';
import { readBinding, type TokenLike } from '../../src/obr/binding.js';
import { conditionBadges } from '../../src/rules/modifiers.js';
import { damageBadge } from '../../src/rules/status.js';
import { isJoker } from '../../src/rules/initiative.js';
import { cardLabel, isRedSuit } from '../../src/game/cards.js';
import type { Sheet } from '../../src/rules/sheet.js';

/** Marks our local items so we only ever clear up our own. */
export const BADGE_KEY = 'com.savagebot/badge';

const WOUND_RED = '#8c2f22';
const FATIGUE_AMBER = '#9a6a15';
const SHAKEN_YELLOW = '#c9a227';
const JOKER_PURPLE = '#5b3a86';
/* Conditions are markers, not damage: a cool slate keeps them clearly distinct
   from the red/amber/yellow family that means "this character is hurt". */
const STATUS_SLATE = '#41505f';
/* A playing card is dark ink on white. Black suits on a dark pill were the one
   badge you could not read at a glance. */
const CARD_FACE = '#f7f3e8';
const CARD_BLACK = '#1b1b1b';
const CARD_RED = '#b3261e';

const FONT_SIZE = 22;
const PADDING = 5;
/** Roughly what the label occupies: one line of text plus padding top and bottom. */
const LABEL_HEIGHT = FONT_SIZE * 1.2 + PADDING * 2;
/** Breathing room between the artwork and a badge. */
const GAP = 4;

interface Token extends TokenLike {
  /** The artwork's centre, which is not necessarily the item's `position`. */
  centre: { x: number; y: number };
  /** Rendered size in scene units. */
  width: number;
  height: number;
}

function badge(
  token: Token,
  text: string,
  background: string,
  offset: { x: number; y: number },
  textColour = '#ffffff',
): Item {
  return (
    buildLabel()
      .plainText(text)
      .position({ x: token.centre.x + offset.x, y: token.centre.y + offset.y })
      .backgroundColor(background)
      .backgroundOpacity(0.92)
      .fillColor(textColour)
      .fontSize(FONT_SIZE)
      .fontWeight(700)
      .padding(PADDING)
      .cornerRadius(9)
      .pointerHeight(0)
      .pointerWidth(0)
      // Keep it legible when zoomed out and unobtrusive when zoomed in.
      .minViewScale(0.6)
      .maxViewScale(1.4)
      .attachedTo(token.id)
      .disableHit(true)
      .locked(true)
      .layer('ATTACHMENT')
      .metadata({ [BADGE_KEY]: true })
      .build()
  );
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
  await clearBadges();

  const dpi = await OBR.scene.grid.getDpi();
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  const items: Item[] = [];

  for (const token of tokens) {
    const state = readBinding(token.metadata);
    if (!state) continue;
    const sheet = byId.get(state.sheetId);
    if (!sheet) continue;

    // Two edges, and the other two left clear:
    //
    //   above   the initiative card — the thing you scan the map for in a fight
    //   left    wounds and fatigue, then Shaken, then the conditions, stacked
    //
    // Everything that is not the card is now in one column down the left. Below
    // the token is deliberately empty: that is where Owlbear draws a token's own
    // name label, and the table has started relying on those names — an NPC is
    // referred to by what is written on the map, not by what is on the Marshal's
    // sheet. A wound badge sitting on top of that name was the thing in the way.
    //
    // Wounds stay separate from Shaken, which is the original lesson here: one
    // badge for both meant a Shaken-but-unwounded character looked fine, and a
    // wounded one looked Shaken. Shaken now sits at the head of the condition
    // stack instead, where it belongs — it is cleared at the end of a turn, like
    // the rest of that column, and unlike a wound.
    //
    // Half-width horizontally, half-height vertically — and both clamped.
    //
    // The mook tokens are 768x1365 at 768 dpi, so they render 1 square wide by
    // 1.78 tall. The geometry is right, but the *artwork* is a standing figure
    // with empty space around it, so a badge placed correctly against the image
    // edge floats away from the creature you can actually see. There is no way
    // to find where the visible pixels stop, so the offset is capped at roughly
    // one square: correct for normal tokens, and close enough for tall ones.
    const cap = dpi * 0.6;
    const halfWidth = Math.min(token.width / 2, cap);
    const halfHeight = Math.min(token.height / 2, cap);

    if (state.card) {
      const joker = isJoker(state.card);
      items.push(
        badge(
          token,
          cardLabel(state.card),
          joker ? JOKER_PURPLE : CARD_FACE,
          // Top centre, the most-scanned spot on a token during a fight, and now
          // uncontested: SHAKEN moved to the condition column.
          { x: 0, y: -halfHeight - GAP },
          // White on purple for a joker; ink on white for everything else.
          joker ? '#ffffff' : isRedSuit(state.card) ? CARD_RED : CARD_BLACK,
        ),
      );
    }

    // The status column, top-down beside the token. Damage leads, then Shaken,
    // then the rest in their list order so the column does not reshuffle as they
    // come and go.
    //
    // Damage at the head rather than mixed in: a wound is the one thing here that
    // does not clear at the end of a turn, and it keeps its own colours so it
    // still reads as "hurt" rather than as one more marker.
    //
    // Placed clear of the artwork by a fixed amount, because a label's rendered
    // width is not knowable here — enough for the widest of these ("SHAKEN" at
    // five or six characters), which is why the badge texts are kept short. The
    // label is centred on its position, so the leftward push mirrors what the
    // column used to have on the right.
    const damage = damageBadge(state, sheet);
    const column = [
      ...(damage ? [{ text: damage, colour: state.wounds > 0 ? WOUND_RED : FATIGUE_AMBER }] : []),
      ...(state.shaken ? [{ text: 'SHAKEN', colour: SHAKEN_YELLOW }] : []),
      ...conditionBadges(state).map((text) => ({ text, colour: STATUS_SLATE })),
    ];
    column.forEach(({ text, colour }, row) => {
      items.push(
        badge(token, text, colour, {
          x: -(halfWidth + GAP * 14),
          // Grown downward from a little above the middle, so one or two markers
          // — the common case — sit level with the token rather than above it.
          y: LABEL_HEIGHT * 0.75 + row * (LABEL_HEIGHT + GAP),
        }),
      );
    });
  }

  if (items.length) await OBR.scene.local.addItems(items);
}

export async function clearBadges(): Promise<void> {
  if (!(await OBR.scene.isReady())) return;
  const existing = await OBR.scene.local.getItems(
    (item: Item) => item.metadata[BADGE_KEY] === true,
  );
  if (existing.length) await OBR.scene.local.deleteItems(existing.map((item) => item.id));
}
