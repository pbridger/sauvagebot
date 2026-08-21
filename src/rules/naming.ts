/**
 * What to call a character, and who is allowed to hear it.
 *
 * One of the Marshal's characters has two names: the one on the sheet, which says
 * what the thing *is* — "Rattler Cultist", "Landshark" — and the one on the token,
 * which is what the table actually says out loud. The first is a spoiler and the
 * second is not.
 *
 * The split that matters is **not** "who is looking". It is *where the string is
 * going*, and that is why these are two functions rather than one with a flag.
 * A name rendered into this client's DOM can safely depend on whether this client
 * is the GM. A name that goes on the wire cannot: it is computed once, on the
 * roller's machine, with the roller's answer to that question, and then broadcast
 * pre-joined to everybody's log, where no recipient can take it apart again. A
 * Marshal rolling a shot published the class name of the thing to the table.
 *
 * Both of these are screens rather than locks. Room metadata is readable by every
 * client, so a determined player can always read the roster; what these stop is a
 * name the Marshal is holding back turning up in a player's UI unasked, which is
 * the failure that actually happens.
 */
import type { Sheet } from './sheet.js';
import type { TokenLike } from '../obr/binding.js';

/**
 * What the table calls this token.
 *
 * The **map label** when it has one, and the item name only as a fallback. Those
 * are two different strings in Owlbear and the difference matters here: the item
 * name is what the Marshal typed into the items tray, which is usually the
 * creature's real name and is usually identical across every copy of it. The
 * label is what is drawn under the token for everyone to read.
 *
 * So the label is the only name that is both **safe** — a player reading it
 * learns nothing they cannot already see — and **distinct**: five mooks sharing
 * one sheet and one item name still carry five different labels, which is what
 * makes "the one on the left" answerable.
 */
export function mapName(token: Pick<TokenLike, 'name' | 'label'>): string {
  return token.label?.trim() || token.name;
}

/** The separator between what a thing is and which one of them it is. */
const JOIN = ' · ';

/**
 * The name to show on **this** screen.
 *
 * The Marshal gets both halves: the sheet says what it is, the token says which
 * one. A player gets what is written on the map and nothing else.
 *
 * A PC is their sheet name to everybody — appending "Reggie Kane · Reggie" tells
 * nobody anything — and so is an NPC whose token was never renamed.
 */
export function localName(sheet: Pick<Sheet, 'name' | 'pc'>, tokenName: string, isGM: boolean): string {
  if (sheet.pc) return sheet.name;
  if (!isGM) return tokenName;
  return tokenName === sheet.name ? sheet.name : `${sheet.name}${JOIN}${tokenName}`;
}

/**
 * The name to put in anything that **leaves this client** — a broadcast roll, a
 * log line, scene metadata another client will render.
 *
 * Never the sheet name for one of the Marshal's, whoever is asking. The GM loses
 * nothing by this: their own panels use `localName` and show them both names.
 */
export function wireName(sheet: Pick<Sheet, 'name' | 'pc'>, tokenName: string): string {
  return sheet.pc ? sheet.name : tokenName;
}
