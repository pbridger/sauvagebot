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

const landshark: Sheet = { ...emptySheet('landshark', 'Landshark'), private: true };
const reggie = emptySheet('reggie', 'Reggie Kane');

/**
 * "Private" is a screen, not a lock — room metadata is readable by every client.
 * What it must do is stop a name the Marshal hid turning up in a player's UI by
 * itself, which is the part nobody would think to check.
 */
describe('a character the Marshal has hidden', () => {
  it('shows players the token name rather than the sheet name', () => {
    const all = [combatant('Big Rock', landshark), combatant('Reggie Kane', reggie)];
    expect(displayName(all[0]!, all, false)).toBe('Big Rock');
  });

  it('shows the Marshal the real name', () => {
    const all = [combatant('Big Rock', landshark)];
    expect(displayName(all[0]!, all, true)).toBe('Landshark');
  });

  it('leaves an ordinary character alone either way', () => {
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
    expect(sheetFromJson(sheetToJson(landshark)).private).toBe(true);
    expect(sheetFromJson(sheetToJson(reggie)).private).toBeUndefined();
  });
});
