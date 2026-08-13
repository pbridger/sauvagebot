/**
 * The shared roll log.
 *
 * Delivery is OBR's `broadcast`: ephemeral, reaching whoever is connected now and
 * storing nothing. That is the right trade for dice. The alternative — a rolling
 * window in scene metadata — survives a reload but is a shared mutable key, which
 * drags in leader election and write collisions for what is essentially a running
 * commentary. A log is not a record; if it turns out to need persistence, adding
 * it later is easy, and unwinding a collision-prone shared log is not.
 *
 * Consequence to be aware of: someone who joins late sees an empty log.
 *
 * **Secret rolls are never broadcast at all.** A GM screen that relied on other
 * clients choosing not to display a message would not be a screen — every client
 * receives every broadcast. Keeping the roll local is the only honest way to do
 * it here, and it works because the person hiding the roll is the one making it.
 */

export const ROLL_CHANNEL = 'com.savagebot/roll';

export interface RollEntry {
  /** Unique per roll, so a client that somehow sees its own echo does not double it. */
  id: string;
  at: number;
  /** Display name of whoever rolled. */
  by: string;
  /** Character the roll was made for, when it came off a sheet. */
  character?: string;
  /** "Shooting", "Colt Rainmaker damage", or absent for a free expression. */
  label?: string;
  expression: string;
  /** The engine's explanation, with Discord-style `**bold**` around the total. */
  explained: string;
  /** Kept local, never sent. Present only on the roller's own client. */
  secret?: boolean;
}

export function newRollId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Incoming entries come from other clients, so nothing about their shape is
 * guaranteed. Reject rather than render half an object — and never trust
 * `secret`, which by construction only ever means something locally.
 */
export function isRollEntry(value: unknown): value is RollEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RollEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at) &&
    typeof entry.by === 'string' &&
    typeof entry.expression === 'string' &&
    typeof entry.explained === 'string' &&
    (entry.character === undefined || typeof entry.character === 'string') &&
    (entry.label === undefined || typeof entry.label === 'string')
  );
}

/** Strip anything that must not leave this client. */
export function forBroadcast(entry: RollEntry): RollEntry {
  const { secret, ...rest } = entry;
  void secret;
  return rest;
}

export const DEFAULT_LOG_SIZE = 60;

/**
 * Newest-first, capped, duplicate-free. Ordered by timestamp rather than arrival,
 * since broadcasts from different clients can land out of order — but ties break
 * on insertion order so a client's own rapid rolls stay in the order they were made.
 */
export class RollLog {
  private readonly entries: RollEntry[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly limit = DEFAULT_LOG_SIZE) {}

  /** @returns false if this entry was already present. */
  add(entry: RollEntry): boolean {
    if (this.seen.has(entry.id)) return false;
    this.seen.add(entry.id);

    const at = this.entries.findIndex((existing) => existing.at < entry.at);
    if (at === -1) this.entries.push(entry);
    else this.entries.splice(at, 0, entry);

    while (this.entries.length > this.limit) {
      const dropped = this.entries.pop();
      if (dropped) this.seen.delete(dropped.id);
    }
    return true;
  }

  list(): readonly RollEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
    this.seen.clear();
  }
}

/** One line of plain text, for a tooltip or a copy-to-clipboard. */
export function formatEntry(entry: RollEntry): string {
  const who = entry.character ? `${entry.character}` : entry.by;
  const what = entry.label ? `${who} — ${entry.label}` : who;
  return `${what}: ${entry.explained.replace(/\*\*/g, '')}`;
}
