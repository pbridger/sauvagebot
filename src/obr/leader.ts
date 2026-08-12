/**
 * Leader election.
 *
 * Constraint 4 from the SDK survey: every connected client runs the extension, so
 * anything that reacts to an event and writes shared state produces N duplicate
 * writes. For the Fate Chip pot that is not merely wasteful — two clients drawing
 * simultaneously would take the same chip, and a player who dislikes a draw could
 * simply call it again.
 *
 * The election is a **pure function of the party list**, not a protocol. Nothing is
 * written, no lock is taken, no timer runs. Every client computes the same answer
 * from the same input, and when the leader disconnects the party list changes and
 * everyone re-derives the same successor. That side-steps the split-brain and
 * stale-lock problems a written election would introduce, on a platform where
 * there is no way to expire a lock (constraint 3: no background execution).
 *
 * The GM is preferred so that shared writes come from the machine most likely to
 * stay connected for the whole session.
 *
 * **Election is advisory, not a lock.** It is exactly-one-leader for a *given*
 * party list, which the tests pin — but clients learn about a disconnect at
 * slightly different moments, so for a few hundred milliseconds after the leader
 * drops, two clients can both believe they lead. A call site that mutates shared
 * state must therefore:
 *
 *   1. re-check `isLeader` immediately before the write, not once at startup; and
 *   2. read back and confirm *its own* change is the one that landed.
 *
 * `VerifiedStore` gives you (2) for capacity failures; logical conflicts — a chip
 * drawn twice — need the caller to check an invariant as well.
 */

export interface Peer {
  connectionId: string;
  role: 'GM' | 'PLAYER';
}

/**
 * @param peers every connected client *including self*. `OBR.party.getPlayers()`
 *              reports the others, so callers must add themselves.
 * @returns the leader's `connectionId`, or undefined if the party is empty
 */
export function electLeader(peers: readonly Peer[]): string | undefined {
  if (peers.length === 0) return undefined;
  const gms = peers.filter((p) => p.role === 'GM');
  const candidates = gms.length > 0 ? gms : peers;
  // Lexicographic on connectionId: an arbitrary but total order every client agrees on.
  return candidates.reduce((best, p) => (p.connectionId < best.connectionId ? p : best))
    .connectionId;
}

export function isLeader(peers: readonly Peer[], selfConnectionId: string): boolean {
  return electLeader(peers) === selfConnectionId;
}

/**
 * Run `action` only on the leader.
 *
 * Returning a discriminated result rather than silently doing nothing keeps the
 * caller honest: a follower needs to know it should wait for the leader's write
 * to arrive over `onChange`, not that the action succeeded.
 */
export async function asLeader<T>(
  peers: readonly Peer[],
  selfConnectionId: string,
  action: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false; leader: string | undefined }> {
  if (!isLeader(peers, selfConnectionId)) return { ran: false, leader: electLeader(peers) };
  return { ran: true, result: await action() };
}
