import { describe, expect, it } from 'vitest';
import {
  RollLog,
  isApplicable,
  totalOf,
  forBroadcast,
  formatEntry,
  isRollEntry,
  newRollId,
  type RollEntry,
} from '../src/obr/rollLog.js';

const entry = (over: Partial<RollEntry> = {}): RollEntry => ({
  id: newRollId(),
  at: 1_000,
  by: 'Paul',
  expression: 's8',
  explained: 's8: [7; w3] = **7**',
  ...over,
});

describe('validating what arrives over the wire', () => {
  it('accepts a well-formed entry', () => {
    expect(isRollEntry(entry())).toBe(true);
    expect(isRollEntry(entry({ character: 'Reggie', label: 'Shooting' }))).toBe(true);
    expect(isRollEntry(entry({ total: 10, ap: 2 }))).toBe(true);
  });

  /** The stray-shot count rides on the entry because the dice do not. */
  it('accepts a stray count, and rejects one that is not a number', () => {
    expect(isRollEntry(entry({ stray: 1, strayOn: 2 }))).toBe(true);
    expect(isRollEntry(entry({ stray: 'yes' as never }))).toBe(false);
    expect(isRollEntry(entry({ strayOn: Number.NaN }))).toBe(false);
  });

  it('accepts a modifier breakdown, and rejects a malformed one', () => {
    expect(
      isRollEntry(
        entry({
          mods: [
            { label: '2 wounds', value: -2, kind: 'status' },
            { label: 'Dark', value: -4, kind: 'situational' },
          ],
        }),
      ),
    ).toBe(true);
    expect(isRollEntry(entry({ mods: [{ label: 'Dark', value: -4, kind: 'weather' }] as never }))).toBe(
      false,
    );
    expect(isRollEntry(entry({ mods: ['Dark -4'] as never }))).toBe(false);
    expect(isRollEntry(entry({ mods: 'Dark -4' as never }))).toBe(false);
  });

  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['missing id', { at: 1, by: 'a', expression: 's8', explained: 'x' }],
    ['numeric by', { id: '1', at: 1, by: 7, expression: 's8', explained: 'x' }],
    ['NaN timestamp', { id: '1', at: NaN, by: 'a', expression: 's8', explained: 'x' }],
    ['object label', { id: '1', at: 1, by: 'a', expression: 's8', explained: 'x', label: {} }],
    ['non-numeric ap', { id: '1', at: 1, by: 'a', expression: 'd6', explained: 'x', ap: 'lots' }],
  ])('rejects %s rather than rendering half an object', (_, value) => {
    expect(isRollEntry(value)).toBe(false);
  });
});

describe('what leaves the client', () => {
  it('strips the secret flag, which must never be sent', () => {
    const sent = forBroadcast(entry({ secret: true }));
    expect('secret' in sent).toBe(false);
    expect(JSON.stringify(sent)).not.toContain('secret');
  });

  it('leaves everything else intact', () => {
    const original = entry({ character: 'Reggie', label: 'Shooting' });
    expect(forBroadcast(original)).toEqual({ ...original });
  });
});

describe('RollLog', () => {
  it('keeps newest first', () => {
    const log = new RollLog();
    log.add(entry({ at: 100, expression: 'old' }));
    log.add(entry({ at: 300, expression: 'new' }));
    log.add(entry({ at: 200, expression: 'middle' }));
    expect(log.list().map((e) => e.expression)).toEqual(['new', 'middle', 'old']);
  });

  it('orders a late-arriving broadcast by when it was rolled, not when it landed', () => {
    const log = new RollLog();
    log.add(entry({ at: 500, by: 'Paul' }));
    // Another client's roll was made earlier but arrived after.
    log.add(entry({ at: 400, by: 'Damian' }));
    expect(log.list().map((e) => e.by)).toEqual(['Paul', 'Damian']);
  });

  it('keeps a client’s own rapid rolls in the order they were made', () => {
    const log = new RollLog();
    const first = entry({ at: 1_000, expression: 'first' });
    const second = entry({ at: 1_000, expression: 'second' });
    log.add(first);
    log.add(second);
    // Equal timestamps: insertion order wins, so the display does not jitter.
    expect(log.list().map((e) => e.expression)).toEqual(['first', 'second']);
  });

  it('ignores a duplicate id, so an echoed broadcast shows once', () => {
    const log = new RollLog();
    const one = entry();
    expect(log.add(one)).toBe(true);
    expect(log.add({ ...one })).toBe(false);
    expect(log.list()).toHaveLength(1);
  });

  it('caps the log and forgets the ids it dropped', () => {
    const log = new RollLog(3);
    for (let i = 0; i < 10; i++) log.add(entry({ at: i, expression: `roll-${i}` }));
    expect(log.list().map((e) => e.expression)).toEqual(['roll-9', 'roll-8', 'roll-7']);

    // An evicted id must be addable again, or the Set grows without bound.
    const small = new RollLog(2);
    const evicted = entry({ at: 1, id: 'evicted' });
    small.add(evicted);
    small.add(entry({ at: 2, id: 'b' }));
    small.add(entry({ at: 3, id: 'c' }));
    expect(small.list().map((e) => e.id)).toEqual(['c', 'b']);
    expect(small.add(evicted)).toBe(true);
  });

  it('clears', () => {
    const log = new RollLog();
    log.add(entry());
    log.clear();
    expect(log.list()).toHaveLength(0);
  });
});

describe('formatting', () => {
  it('prefers the character over the player, and drops the markdown', () => {
    expect(formatEntry(entry({ character: 'Reggie', label: 'Shooting' }))).toBe(
      'Reggie — Shooting: s8: [7; w3] = 7',
    );
  });

  it('falls back to the player for a free expression', () => {
    expect(formatEntry(entry())).toBe('Paul: s8: [7; w3] = 7');
  });

  it('shows armour-piercing, which changes what the damage means', () => {
    expect(formatEntry(entry({ label: 'Colt damage', ap: 1 }))).toMatch(/\(AP 1\)$/);
    expect(formatEntry(entry({ ap: 0 }))).not.toMatch(/AP/);
  });

  it('says where the modifier came from', () => {
    expect(
      formatEntry(
        entry({
          label: 'Shooting',
          character: 'Reggie',
          mods: [
            { label: '2 wounds', value: -2, kind: 'status' },
            { label: 'Dark', value: -4, kind: 'situational' },
          ],
        }),
      ),
    ).toMatch(/\[2 wounds -2, Dark -4\]$/);
  });
});

describe('applying a roll to a token', () => {
  it('reads the total after the equals sign', () => {
    expect(totalOf('2d6!: 4 + 6 = **10**')).toBe(10);
    expect(totalOf('s8-2: [7; w3] -2 = **5**')).toBe(5);
    expect(totalOf('s4-6: [2; w1] -6 = **-4**')).toBe(-4);
  });

  it('is not fooled by the raise count, which the engine also bolds', () => {
    // This was a real bug, and a nasty one: it made Soak fail silently on
    // exactly the rolls that should have worked.
    expect(totalOf('s8+2: [6; w5] + 2 = **8** (success; **1** raise)')).toBe(8);
    expect(totalOf('s10: [10+7; w5] = **17** (success; **3** raises)')).toBe(17);
    expect(totalOf('s8: [6; w5] = **6** (success)')).toBe(6);
  });

  it('declines a multi-roll rather than guessing which result to use', () => {
    expect(totalOf('1: x = **7**\n2: y = **11**')).toBeUndefined();
    expect(totalOf('no numbers here')).toBeUndefined();
  });

  it('offers damage and freehand rolls, which say so', () => {
    expect(isApplicable(entry({ expression: '2d6!', total: 10, applicable: true }))).toBe(true);
    expect(isApplicable(entry({ expression: '4+3', total: 7, applicable: true }))).toBe(true);
  });

  it('refuses anything that did not opt in', () => {
    // Trait rolls, Soak rolls, initiative deals and the log's own notices.
    expect(isApplicable(entry({ expression: 's8', total: 7 }))).toBe(false);
    expect(isApplicable(entry({ expression: 'benny', total: 3 }))).toBe(false);
  });

  it('refuses an opted-in entry with no total', () => {
    expect(isApplicable(entry({ expression: '3#s8', applicable: true }))).toBe(false);
  });
});

/**
 * A roll that named its target arrived from the shot panel with range, cover and
 * the defender's conditions already in its total. The log line must not offer to
 * do that arithmetic again.
 */
describe('a roll that already knows what it was aimed at', () => {
  it('accepts a declared target over the wire', () => {
    expect(isRollEntry(entry({ target: 'Sir Ed Fiddlebottom III' }))).toBe(true);
    expect(isRollEntry(entry({ target: 7 as never }))).toBe(false);
  });

  it('survives the trip to other clients', () => {
    const sent = forBroadcast(entry({ target: 'Sallow Jake' }));
    expect(sent.target).toBe('Sallow Jake');
  });

  /**
   * The bug: a 15 that had already lost 2 to medium range was shown in the table
   * as 11, because the table subtracted the range a second time — two raises
   * reported as one.
   */
  it('is a name rather than a token id, so any client can read it', () => {
    const shot = entry({ target: 'Sallow Jake', from: 'token-9' });
    expect(typeof shot.target).toBe('string');
    expect(shot.target).not.toBe(shot.from);
  });
});

/**
 * A shot's modifiers stay live after the dice land: the Marshal says "you aimed
 * last round", the player clicks Aim, and the arithmetic changes. The correction
 * appends rather than rewriting, because a log the Marshal is using for oversight
 * is worth less if lines can change under them.
 */
describe('amending a roll that has already been made', () => {
  const shot = entry({ id: 'shot', at: 1_000, total: 5, label: 'Peacemaker — Shooting' });
  const aimed = entry({ id: 'aim', at: 1_100, total: 7, amends: 'shot' });

  it('accepts an amendment over the wire', () => {
    expect(isRollEntry(aimed)).toBe(true);
    expect(isRollEntry(entry({ amends: 42 as never }))).toBe(false);
  });

  it('keeps both entries, since the original roll did happen', () => {
    const log = new RollLog();
    log.add(shot);
    log.add(aimed);
    expect(log.list()).toHaveLength(2);
  });

  it('draws one line, not two', () => {
    const log = new RollLog();
    log.add(shot);
    log.add(aimed);
    expect(log.roots().map((e) => e.id)).toEqual(['shot']);
    expect(log.amendmentsOf('shot').map((e) => e.id)).toEqual(['aim']);
  });

  /** Read forwards, so the reason comes before the answer it produced. */
  it('reads a chain of corrections oldest first', () => {
    const log = new RollLog();
    log.add(shot);
    log.add(aimed);
    log.add(entry({ id: 'cover', at: 1_200, total: 5, amends: 'shot' }));
    expect(log.amendmentsOf('shot').map((e) => e.id)).toEqual(['aim', 'cover']);
  });

  it('answers with the version that currently stands', () => {
    const log = new RollLog();
    log.add(shot);
    expect(log.latest('shot')?.total).toBe(5);
    log.add(aimed);
    expect(log.latest('shot')?.total).toBe(7);
    log.add(entry({ id: 'cover', at: 1_200, total: 1, amends: 'shot' }));
    expect(log.latest('shot')?.total).toBe(1);
  });

  /**
   * The correction says what changed and nothing else. Handing it back in place
   * of the roll would say the roll had no skill and endangered nobody — which is
   * the targeting table disappearing and the bystander warning going quiet the
   * moment anyone clicks Aim.
   */
  it('merges the correction into the roll rather than replacing it', () => {
    const log = new RollLog();
    log.add(
      entry({
        id: 'aimed-shot',
        at: 1_000,
        total: 5,
        skill: 'Shooting',
        from: 'token-1',
        bands: [12, 24, 48],
        stray: 1,
        strayOn: 1,
        ap: 1,
        applicable: false,
      }),
    );
    log.add(entry({ id: 'fix', at: 1_100, total: 9, amends: 'aimed-shot' }));

    const now = log.latest('aimed-shot')!;
    expect(now.total).toBe(9);
    // Everything describing what kind of roll it was survives the correction.
    expect(now.skill).toBe('Shooting');
    expect(now.from).toBe('token-1');
    expect(now.bands).toEqual([12, 24, 48]);
    expect(now.stray).toBe(1);
    expect(now.ap).toBe(1);
    // And it stays the same entry, so anything keyed on the id still matches.
    expect(now.id).toBe('aimed-shot');
    expect(now.amends).toBeUndefined();
  });

  it('takes the corrected modifiers when the correction carries them', () => {
    const log = new RollLog();
    log.add(entry({ id: 'm', at: 1_000, mods: [{ label: 'Long range', value: -4, kind: 'situational' }] }));
    log.add(entry({ id: 'm2', at: 1_100, amends: 'm', mods: [] }));
    expect(log.latest('m')?.mods).toEqual([]);
  });

  it('keeps the roll’s own modifiers when the correction says nothing about them', () => {
    const log = new RollLog();
    const mods = [{ label: 'Long range', value: -4, kind: 'situational' as const }];
    log.add(entry({ id: 'm', at: 1_000, mods }));
    log.add(entry({ id: 'm2', at: 1_100, amends: 'm', total: 3 }));
    expect(log.latest('m')?.mods).toEqual(mods);
  });

  it('has nothing to say about a roll it never saw', () => {
    expect(new RollLog().latest('nobody')).toBeUndefined();
  });

  /** Broadcasts from different clients can land in either order. */
  it('stands an orphan on its own until its parent arrives', () => {
    const log = new RollLog();
    log.add(aimed);
    expect(log.roots().map((e) => e.id)).toEqual(['aim']);
    log.add(shot);
    expect(log.roots().map((e) => e.id)).toEqual(['shot']);
  });

  /** A long fight pushes the roll off the end while its correction is still here. */
  it('stands an orphan on its own when its parent has aged out', () => {
    const log = new RollLog(2);
    log.add(shot);
    log.add(aimed);
    log.add(entry({ id: 'later', at: 2_000 }));
    expect(log.list().map((e) => e.id)).toEqual(['later', 'aim']);
    expect(log.roots().map((e) => e.id)).toEqual(['later', 'aim']);
  });

  it('carries a whole entry, so a late client can read it alone', () => {
    expect(aimed.total).toBe(7);
    expect(isRollEntry(forBroadcast(aimed))).toBe(true);
  });
});
