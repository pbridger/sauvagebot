import { describe, expect, it } from 'vitest';
import {
  RollLog,
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
  });

  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['missing id', { at: 1, by: 'a', expression: 's8', explained: 'x' }],
    ['numeric by', { id: '1', at: 1, by: 7, expression: 's8', explained: 'x' }],
    ['NaN timestamp', { id: '1', at: NaN, by: 'a', expression: 's8', explained: 'x' }],
    ['object label', { id: '1', at: 1, by: 'a', expression: 's8', explained: 'x', label: {} }],
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
});
