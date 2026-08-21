import { describe, expect, it } from 'vitest';
import { displayName, type Combatant } from '../extension/src/initiativePanel.js';
import { emptySheet, sheetFromJson, sheetToJson, type Sheet } from '../src/rules/sheet.js';
import { newTokenState } from '../src/obr/binding.js';
import { PARRY_VISIBLE_CELLS, showsParry } from '../src/rules/targeting.js';
import { localName, mapName, wireName } from '../src/rules/naming.js';

const combatant = (tokenName: string, sheet: Sheet): Combatant => ({
  tokenId: `t-${tokenName}`,
  name: tokenName,
  sheet,
  state: newTokenState(sheet.id),
});

/** `emptySheet` is an NPC: everything the Marshal adds is one until they say so. */
const landshark: Sheet = emptySheet('landshark', 'Landshark');
const reggie: Sheet = { ...emptySheet('reggie', 'Reggie Kane'), pc: true };

/**
 * An NPC is a screen, not a lock — room metadata is readable by every client.
 * What it must do is stop a name the Marshal is holding back turning up in a
 * player's UI by itself, which is the part nobody would think to check.
 */
/**
 * The map label, not the item name.
 *
 * Two different strings in Owlbear, and only one of them is safe: the item name
 * is what the Marshal typed into the items tray — usually the creature's real
 * name, and usually identical on every copy of it — while the label is what is
 * drawn under the token for the whole table to read. It is also the only one
 * that tells five mooks sharing a sheet apart.
 */
describe('what the table calls a token', () => {
  it('prefers the map label to the item name', () => {
    expect(mapName({ name: 'Rattler Cultist', label: 'Robed Figure' })).toBe('Robed Figure');
  });

  it('falls back to the item name when the token carries no label', () => {
    expect(mapName({ name: 'Big Rock' })).toBe('Big Rock');
    // Owlbear stores an absent label as an empty string rather than dropping it.
    expect(mapName({ name: 'Big Rock', label: '   ' })).toBe('Big Rock');
  });

  it('is what a player is shown, and half of what the Marshal is shown', () => {
    const token = { name: 'Landshark', label: 'Thing in the Water' };
    expect(localName(landshark, mapName(token), false)).toBe('Thing in the Water');
    expect(localName(landshark, mapName(token), true)).toBe('Landshark · Thing in the Water');
    expect(wireName(landshark, mapName(token))).toBe('Thing in the Water');
  });
});

describe("one of the Marshal's characters", () => {
  it('shows players the token name rather than the sheet name', () => {
    const all = [combatant('Big Rock', landshark), combatant('Reggie Kane', reggie)];
    expect(displayName(all[0]!, all, false)).toBe('Big Rock');
  });

  /**
   * Both halves, and for every NPC rather than only for a gang sharing a sheet.
   * The token name is the one a player will say out loud, so the Marshal has to
   * be able to map "Big Rock" back to what it actually is without counting how
   * many of them are on the map.
   */
  it('shows the Marshal the real name and the token it is on', () => {
    const all = [combatant('Big Rock', landshark)];
    expect(displayName(all[0]!, all, true)).toBe('Landshark \u00b7 Big Rock');
  });

  /** Nothing to append when the Marshal never renamed the token. */
  it('says it once when the token carries the sheet name already', () => {
    const all = [combatant('Landshark', landshark)];
    expect(displayName(all[0]!, all, true)).toBe('Landshark');
  });

  it('leaves a player character alone either way', () => {
    const all = [combatant('Reggie Kane', reggie)];
    expect(displayName(all[0]!, all, false)).toBe('Reggie Kane');
    expect(displayName(all[0]!, all, true)).toBe('Reggie Kane');
  });

  it('still distinguishes a gang of Extras by token for the Marshal', () => {
    const bandit = { ...emptySheet('bandit', 'Bandit'), wildCard: false };
    const all = [combatant('Bandit 1', bandit), combatant('Bandit 2', bandit)];
    expect(displayName(all[0]!, all, true)).toBe('Bandit · Bandit 1');
  });

  /**
   * The rule that a name on the wire must not depend on who computed it.
   *
   * This is the one that went wrong: the shot panel joined its target names on
   * the roller's client, with the roller's `isGM`, and put the result on a
   * broadcast roll — so a Marshal shooting at a Landshark published the word
   * "Landshark" into every player's log, pre-joined and unrecoverable.
   */
  it('never puts the sheet name of one of the Marshal\u2019s on the wire', () => {
    expect(wireName(landshark, 'Big Rock')).toBe('Big Rock');
    // The GM has no say. There is no argument here for them to have one with.
    expect(wireName(reggie, 'Reggie Kane')).toBe('Reggie Kane');
  });

  it('survives export and re-import, so it moves rooms with the roster', () => {
    expect(sheetFromJson(sheetToJson(landshark)).pc).toBe(false);
    expect(sheetFromJson(sheetToJson(reggie)).pc).toBe(true);
  });
});

/**
 * `pc` replaced a `private` flag, which was the same distinction stated
 * backwards. Rooms and exported rosters written before the change still carry
 * `private`, and reading it the wrong way round would hide a whole party at once
 * — every existing sheet has no `pc` at all.
 */
describe('a sheet written before the PC flag existed', () => {
  const asJson = (sheet: Record<string, unknown>) => JSON.stringify(sheet);

  it('treats a private sheet as one of the Marshal\'s', () => {
    const old = asJson({ id: 'landshark', name: 'Landshark', wildCard: true, private: true });
    expect(sheetFromJson(old).pc).toBe(false);
  });

  it('treats a sheet with neither flag as a player character', () => {
    const old = asJson({ id: 'reggie', name: 'Reggie Kane', wildCard: true });
    expect(sheetFromJson(old).pc).toBe(true);
  });

  it('drops the old flag rather than carrying both', () => {
    const old = asJson({ id: 'landshark', name: 'Landshark', wildCard: true, private: true });
    expect(sheetFromJson(old)).not.toHaveProperty('private');
  });

  it('prefers an explicit pc when a sheet somehow carries both', () => {
    const both = asJson({ id: 'x', name: 'X', wildCard: true, private: true, pc: true });
    expect(sheetFromJson(both).pc).toBe(true);
  });
});

/**
 * Parry in the targeting table, which was reported as data leakage: a Shooting
 * roll printed the Parry of every character on the map, and a shot is resolved
 * against a flat 4 rather than against Parry, so it bought the arithmetic
 * nothing.
 *
 * These pin a decision that would regress invisibly — putting the number back is
 * a one-word change and looks like nothing in a diff.
 */
describe('whose Parry the targeting table will print', () => {
  it('shows it for Fighting, which is resolved against it', () => {
    expect(showsParry('Fighting', 1)).toBe(true);
    expect(showsParry('Fighting', 40)).toBe(true);
    // Even unmeasured: the number is the target number, so the table is useless
    // without it. This is the failure the table was built for.
    expect(showsParry('Fighting', undefined)).toBe(true);
  });

  it('withholds it for a shot that travelled', () => {
    expect(showsParry('Shooting', PARRY_VISIBLE_CELLS)).toBe(false);
    expect(showsParry('Shooting', 12)).toBe(false);
    expect(showsParry('Throwing', 5)).toBe(false);
  });

  it('shows it for a shot close enough to have been into melee', () => {
    expect(showsParry('Shooting', 0)).toBe(true);
    expect(showsParry('Shooting', 1.9)).toBe(true);
  });

  /** Withholding is the safe default, so an unmeasured range must not leak. */
  it('withholds it when the range could not be measured', () => {
    expect(showsParry('Shooting', undefined)).toBe(false);
    expect(showsParry('Athletics', undefined)).toBe(false);
  });

  it('says nothing about a roll that is not an attack', () => {
    expect(showsParry('Notice', 1)).toBe(false);
    expect(showsParry(undefined, 1)).toBe(false);
  });
});
