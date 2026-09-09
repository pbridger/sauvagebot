import { describe, expect, it } from 'vitest';
import {
  describeKey,
  keyCost,
  leftoverChars,
  leftoverKeys,
  reportDocument,
  type ReportContext,
} from '../src/obr/storageReport.js';

const context = (over: Partial<ReportContext> = {}): ReportContext => ({
  scope: 'room',
  sheets: [
    { id: 'reggie-kane', name: 'Reggie Kane', pc: true },
    { id: 'ike-turnbull', name: 'Ike Turnbull', pc: false },
  ],
  party: [{ id: 'p1', name: 'Damian' }],
  ...over,
});

const describes = (key: string, value: unknown = 1, over: Partial<ReportContext> = {}) =>
  describeKey(key, value, context(over));

describe('naming a key', () => {
  it('names a character sheet after the character', () => {
    const row = describes('com.savagebot/pc/reggie-kane', { name: 'Reggie Kane' });
    expect(row.label).toBe('Reggie Kane — character sheet');
    expect(row.group).toBe('characters');
  });

  it('falls back to the id when the roster has no such character', () => {
    // The pane must still print a row: an unattributable key is exactly the kind
    // the Marshal most needs to see.
    const row = describes('com.savagebot/pc/whoever', { name: 'x' });
    expect(row.label).toBe('whoever — character sheet');
  });

  it('names a player’s Bennies', () => {
    expect(describes('com.savagebot/bennies/reggie-kane').label).toBe('Reggie Kane’s Bennies');
  });

  it('calls Bennies for a deleted character what they are, and calls them a leftover', () => {
    const row = describes('com.savagebot/bennies/long-gone');
    expect(row.group).toBe('stale');
    expect(row.weight).toBe('leftover');
    expect(row.note).toContain('long-gone');
  });

  it('does the same for Power Points', () => {
    expect(describes('com.savagebot/pp/reggie-kane').label).toBe('Reggie Kane’s Power Points');
    expect(describes('com.savagebot/pp/long-gone').weight).toBe('leftover');
  });

  it('names a player for their seat, and says so when nobody matches', () => {
    expect(describes('com.savagebot/place/p1').label).toBe('Damian’s place at the table');
    expect(describes('com.savagebot/place/p9').note).toContain('not in the room');
  });

  it('does not call live seating a leftover, even for an absent player', () => {
    // Clearable like everything else — but never swept up by the bulk button:
    // somebody who is not logged in tonight is not gone.
    for (const key of ['com.savagebot/place/p9', 'com.savagebot/dice-anim/p9', 'com.savagebot/mine/p9']) {
      expect(describes(key).weight, key).toBe('state');
    }
  });

  it('tells the superseded seat schema from the live one', () => {
    // One character apart, and getting it backwards would delete the seating.
    expect(describes('com.savagebot/seat/p1').group).toBe('stale');
    expect(describes('com.savagebot/place/p1').group).toBe('table');
  });

  it('calls the probe’s leftovers leftovers', () => {
    expect(describes('com.savagebot/probe-blob', 'xxxx').weight).toBe('leftover');
  });

  it('attributes a key from another extension to its namespace, and will not touch it', () => {
    const row = describes('rodeo.owlbear.initiative/metadata', { x: 1 });
    expect(row.label).toBe('rodeo.owlbear.initiative — another extension');
    expect(row.group).toBe('other-extension');
    expect(row.action.kind).toBe('none');
    // Removable like anything else, and flagged as somebody else's, because the
    // extension that wrote it will not know it has gone.
    expect(row.weight).toBe('foreign');
  });

  it('shows an unfamiliar key of our own rather than hiding it', () => {
    const row = describes('com.savagebot/something-new');
    expect(row.group).toBe('unrecognised');
    expect(row.action.kind).toBe('none');
  });
});

describe('what the pane offers for a sheet', () => {
  it('offers to move a room-stored NPC to the scene', () => {
    const row = describes('com.savagebot/pc/ike-turnbull', { name: 'Ike' });
    expect(row.action).toEqual({ kind: 'move', sheetId: 'ike-turnbull', to: 'scene' });
  });

  it('offers the other direction for a scene-stored NPC', () => {
    // A villain worth keeping outlives the map they were made on.
    const row = describes('com.savagebot/pc/ike-turnbull', { name: 'Ike' }, { scope: 'scene' });
    expect(row.action).toEqual({ kind: 'move', sheetId: 'ike-turnbull', to: 'room' });
  });

  it('never offers to move a PC out of the room', () => {
    // A PC that vanishes when the Marshal changes map is a bug, not a choice.
    const row = describes('com.savagebot/pc/reggie-kane', { name: 'Reggie' });
    expect(row.action.kind).toBe('roster');
  });

  it('never sweeps a character sheet up with the leftovers', () => {
    // Clearing one is offered, because the pane is where the Marshal decides —
    // but it is weighted so the bulk button cannot take a character by accident,
    // and so the button can say whose sheet it is about to delete.
    for (const scope of ['room', 'scene'] as const) {
      for (const id of ['reggie-kane', 'ike-turnbull', 'unknown-id']) {
        const row = describes(`com.savagebot/pc/${id}`, { name: 'x' }, { scope });
        expect(row.weight, id).toBe('sheet');
        expect(row.clearNote, id).toMatch(/deletes/i);
      }
    }
  });
});

describe('costing a key', () => {
  it('counts the key name, not just the value', () => {
    // A `bennies/<id>` entry is mostly its own key, so a report that ignored the
    // name would understate the cheap-looking rows by the most.
    expect(keyCost('ab', 1)).toBe(JSON.stringify('ab').length + 1 + 1 + 1);
    expect(keyCost('com.savagebot/bennies/reggie-kane', 3)).toBeGreaterThan(35);
  });

  it('charges nothing for a tombstone', () => {
    expect(keyCost('anything', undefined)).toBe(0);
  });
});

describe('the document as a whole', () => {
  const document = {
    'com.savagebot/pc/reggie-kane': { name: 'Reggie Kane', gear: 'x'.repeat(200) },
    'com.savagebot/pc/ike-turnbull': { name: 'Ike Turnbull' },
    'com.savagebot/bennies/reggie-kane': 3,
    'com.savagebot/bennies/long-gone': 2,
    'com.savagebot/seat/p1': 'nw',
    'rodeo.owlbear.fog/state': { lit: true },
    'com.savagebot/gone': undefined,
  };

  it('takes the total from the document rather than adding rows up', () => {
    // The braces and separators belong to no key, so the sum of the rows is not
    // the number the store enforces — and the store's number is the one that can
    // refuse a write.
    const report = reportDocument(document, 15_000, context());
    const summed = report.rows.reduce((n, row) => n + row.chars, 0);
    expect(report.total).toBe(JSON.stringify(document).length);
    expect(report.total).not.toBe(summed);
    expect(Math.abs(report.total - summed)).toBeLessThan(10);
  });

  it('counts tombstones apart from live keys', () => {
    const report = reportDocument(document, 15_000, context());
    expect(report.live).toBe(6);
    expect(report.tombstoned).toBe(1);
    expect(report.rows).toHaveLength(6);
  });

  it('sorts rows biggest first, because the question is always what is big', () => {
    const report = reportDocument(document, 15_000, context());
    expect(report.rows[0]!.key).toBe('com.savagebot/pc/reggie-kane');
    const costs = report.rows.map((row) => row.chars);
    expect([...costs].sort((a, b) => b - a)).toEqual(costs);
  });

  it('groups, and sorts the groups the same way', () => {
    const report = reportDocument(document, 15_000, context());
    expect(report.groups[0]!.group).toBe('characters');
    expect(report.groups.find((g) => g.group === 'characters')!.keys).toBe(2);
    expect(report.groups.find((g) => g.group === 'stale')!.keys).toBe(2);
  });

  it('reports what another extension is costing us', () => {
    const report = reportDocument(document, 15_000, context());
    expect(report.foreign).toBe(keyCost('rodeo.owlbear.fog/state', { lit: true }));
  });

  it('reports no foreign bytes for a document that is all ours', () => {
    const { 'rodeo.owlbear.fog/state': _theirs, ...ours } = document;
    expect(reportDocument(ours, 15_000, context()).foreign).toBe(0);
  });

  it('collects exactly the keys nothing reads any more', () => {
    const report = reportDocument(document, 15_000, context());
    expect(leftoverKeys(report).sort()).toEqual([
      'com.savagebot/bennies/long-gone',
      'com.savagebot/seat/p1',
    ]);
    expect(leftoverChars(report)).toBe(
      keyCost('com.savagebot/bennies/long-gone', 2) + keyCost('com.savagebot/seat/p1', 'nw'),
    );
  });

  it('gives every row something to say before it is cleared', () => {
    // The button is on all of them now, so the warning has to be too.
    const report = reportDocument(document, 15_000, context());
    for (const row of report.rows) expect(row.clearNote, row.key).not.toBe('');
  });

  it('survives an empty document', () => {
    const report = reportDocument({}, 15_000, context());
    expect(report.rows).toHaveLength(0);
    expect(report.groups).toHaveLength(0);
    expect(report.total).toBe(2);
  });
});
