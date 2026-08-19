import { describe, expect, it } from 'vitest';
import { displayName, type Combatant } from '../extension/src/initiativePanel.js';
import { emptySheet, sheetFromJson, sheetToJson, type Sheet } from '../src/rules/sheet.js';
import { newTokenState } from '../src/obr/binding.js';

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
describe("one of the Marshal's characters", () => {
  it('shows players the token name rather than the sheet name', () => {
    const all = [combatant('Big Rock', landshark), combatant('Reggie Kane', reggie)];
    expect(displayName(all[0]!, all, false)).toBe('Big Rock');
  });

  it('shows the Marshal the real name', () => {
    const all = [combatant('Big Rock', landshark)];
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
