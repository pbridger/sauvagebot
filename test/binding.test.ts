import { describe, expect, it } from 'vitest';
import { emptySheet, type Sheet } from '../src/rules/sheet.js';
import {
  TOKEN_KEY,
  autoBindings,
  duplicateWildCard,
  isTokenState,
  newTokenState,
  orphanedTokens,
  readBinding,
  tokensForSheet,
  type TokenLike,
} from '../src/obr/binding.js';

const token = (id: string, name: string, bound?: string, layer = 'CHARACTER'): TokenLike => ({
  id,
  name,
  layer,
  metadata: bound ? { [TOKEN_KEY]: newTokenState(bound) } : {},
});

const sheet = (id: string, name: string): Sheet => emptySheet(id, name);
const extra = (id: string, name: string): Sheet => ({ ...emptySheet(id, name), wildCard: false });

describe('reading a binding', () => {
  it('reads a well-formed one', () => {
    expect(readBinding(token('t1', 'Reggie', 'reggie').metadata)?.sheetId).toBe('reggie');
  });

  it('returns nothing for an unbound token', () => {
    expect(readBinding({})).toBeUndefined();
    expect(readBinding(undefined)).toBeUndefined();
  });

  it('ignores junk under our key rather than trusting it', () => {
    expect(readBinding({ [TOKEN_KEY]: { sheetId: 5 } })).toBeUndefined();
    expect(readBinding({ [TOKEN_KEY]: 'reggie' })).toBeUndefined();
    // A binding without its combat state is not a binding we can use.
    expect(isTokenState({ sheetId: 'x' })).toBe(false);
  });

  it('starts a bound token undamaged', () => {
    expect(newTokenState('reggie')).toEqual({
      sheetId: 'reggie',
      wounds: 0,
      fatigue: 0,
      shaken: false,
    });
  });
});

describe('auto-binding by name', () => {
  const reggie = sheet('reginald-reggie-kane', 'REGINALD "REGGIE" KANE');

  it('matches through case and punctuation', () => {
    const bindings = autoBindings([token('t1', 'Reginald Reggie Kane')], [reggie]);
    expect(bindings).toEqual([{ tokenId: 't1', sheetId: 'reginald-reggie-kane' }]);
  });

  it('leaves an already-bound token alone', () => {
    expect(
      autoBindings([token('t1', 'Reggie', 'someone-else')], [sheet('reggie', 'Reggie')]),
    ).toEqual([]);
  });

  it('ignores tokens that are not on the character layer', () => {
    expect(
      autoBindings([token('t1', 'Reggie', undefined, 'PROP')], [sheet('reggie', 'Reggie')]),
    ).toEqual([]);
  });

  it('will not put a Wild Card on two tokens, which would pool their wounds', () => {
    const twins = [token('t1', 'Reggie'), token('t2', 'Reggie')];
    expect(autoBindings(twins, [sheet('reggie', 'Reggie')])).toEqual([]);
  });

  it('binds every matching token to an Extra, which is how a gang works', () => {
    // Five bandits share one stat block; each keeps its own wounds, because
    // wounds live on the token.
    const bandits = [token('t1', 'Bandit'), token('t2', 'Bandit'), token('t3', 'Bandit')];
    expect(autoBindings(bandits, [extra('bandit', 'Bandit')])).toEqual([
      { tokenId: 't1', sheetId: 'bandit' },
      { tokenId: 't2', sheetId: 'bandit' },
      { tokenId: 't3', sheetId: 'bandit' },
    ]);
  });

  it('refuses to guess when several characters share a name', () => {
    expect(
      autoBindings(
        [token('t1', 'Bandit')],
        [sheet('bandit-1', 'Bandit'), sheet('bandit-2', 'Bandit')],
      ),
    ).toEqual([]);
  });

  it('handles a mixed scene: one Wild Card, a gang of Extras', () => {
    const tokens = [token('t1', 'Reggie'), token('t2', 'Bandit'), token('t3', 'Bandit')];
    const sheets = [sheet('reggie', 'Reggie'), extra('bandit', 'Bandit')];
    expect(autoBindings(tokens, sheets)).toEqual([
      { tokenId: 't1', sheetId: 'reggie' },
      { tokenId: 't2', sheetId: 'bandit' },
      { tokenId: 't3', sheetId: 'bandit' },
    ]);
  });

  it('binds nothing when no name matches', () => {
    expect(autoBindings([token('t1', 'Some Mook')], [sheet('reggie', 'Reggie')])).toEqual([]);
  });

  it('ignores a token with a blank name', () => {
    expect(autoBindings([token('t1', '  ')], [sheet('x', '  ')])).toEqual([]);
  });
});

describe('finding trouble', () => {
  it('spots a token pointing at a character that no longer exists', () => {
    const tokens = [token('t1', 'Reggie', 'reggie'), token('t2', 'Ghost', 'deleted')];
    expect(orphanedTokens(tokens, [sheet('reggie', 'Reggie')]).map((t) => t.id)).toEqual(['t2']);
  });

  it('does not call an unbound token orphaned', () => {
    expect(orphanedTokens([token('t1', 'Reggie')], [])).toEqual([]);
  });

  it('finds every token bound to one sheet, since duplicates carry the binding', () => {
    const tokens = [token('t1', 'Reggie', 'reggie'), token('t2', 'Reggie copy', 'reggie')];
    expect(tokensForSheet(tokens, 'reggie').map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('flags a duplicated Wild Card but not a gang of Extras', () => {
    const two = [token('t1', 'a', 'x'), token('t2', 'b', 'x')];
    expect(duplicateWildCard(two, { id: 'x', wildCard: true })).toBe(true);
    expect(duplicateWildCard(two, { id: 'x', wildCard: false })).toBe(false);
    expect(duplicateWildCard([two[0]!], { id: 'x', wildCard: true })).toBe(false);
  });
});
