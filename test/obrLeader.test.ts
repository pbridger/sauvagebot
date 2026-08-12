import { describe, expect, it } from 'vitest';
import { asLeader, electLeader, isLeader, type Peer } from '../src/obr/leader.js';

const gm = (id: string): Peer => ({ connectionId: id, role: 'GM' });
const player = (id: string): Peer => ({ connectionId: id, role: 'PLAYER' });

describe('electLeader', () => {
  it('prefers a GM over any player', () => {
    expect(electLeader([player('aaa'), gm('zzz'), player('bbb')])).toBe('zzz');
  });

  it('falls back to the lowest player when no GM is connected', () => {
    expect(electLeader([player('ccc'), player('aaa'), player('bbb')])).toBe('aaa');
  });

  it('picks the lowest connection id among several GMs', () => {
    expect(electLeader([gm('mmm'), gm('aaa'), gm('zzz')])).toBe('aaa');
  });

  it('returns undefined for an empty party', () => {
    expect(electLeader([])).toBeUndefined();
  });

  it('is order-independent, so every client agrees', () => {
    const peers = [player('ccc'), gm('bbb'), player('aaa'), gm('ddd')];
    const permutations = [
      peers,
      [...peers].reverse(),
      [peers[2]!, peers[0]!, peers[3]!, peers[1]!],
      [peers[1]!, peers[3]!, peers[2]!, peers[0]!],
    ];
    const results = new Set(permutations.map(electLeader));
    expect(results).toEqual(new Set(['bbb']));
  });

  it('is stable when a non-leader disconnects', () => {
    const before = [gm('bbb'), player('aaa'), player('ccc')];
    const after = before.filter((p) => p.connectionId !== 'ccc');
    expect(electLeader(after)).toBe(electLeader(before));
  });

  it('hands over deterministically when the leader disconnects', () => {
    const before = [gm('bbb'), gm('ddd'), player('aaa')];
    expect(electLeader(before)).toBe('bbb');
    expect(electLeader(before.filter((p) => p.connectionId !== 'bbb'))).toBe('ddd');
  });

  it('never elects two leaders — exactly one peer sees itself as leader', () => {
    const peers = [gm('bbb'), player('aaa'), player('ccc'), gm('ddd')];
    const leaders = peers.filter((p) => isLeader(peers, p.connectionId));
    expect(leaders).toHaveLength(1);
  });
});

describe('asLeader', () => {
  it('runs the action on the leader', async () => {
    const peers = [gm('bbb'), player('aaa')];
    const outcome = await asLeader(peers, 'bbb', async () => 'drew a chip');
    expect(outcome).toEqual({ ran: true, result: 'drew a chip' });
  });

  it('tells a follower who the leader is rather than silently doing nothing', async () => {
    const peers = [gm('bbb'), player('aaa')];
    let ran = false;
    const outcome = await asLeader(peers, 'aaa', async () => {
      ran = true;
      return 'drew a chip';
    });
    expect(ran).toBe(false);
    expect(outcome).toEqual({ ran: false, leader: 'bbb' });
  });

  it('runs exactly once across the whole party — the chip-pot invariant', async () => {
    const peers = [gm('bbb'), player('aaa'), player('ccc'), gm('ddd')];
    let draws = 0;
    // Every client reacts to the same event, as they all would in a real room.
    await Promise.all(
      peers.map((p) =>
        asLeader(peers, p.connectionId, async () => {
          draws++;
        }),
      ),
    );
    expect(draws).toBe(1);
  });
});
