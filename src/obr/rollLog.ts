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

import { describeMods, type RollMod } from '../rules/modifiers.js';

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
  /** The numeric result, when there was a single one. Lets a roll be applied as damage. */
  total?: number;
  /**
   * Whether this may be applied to a token as damage.
   *
   * Set explicitly by whoever publishes, rather than inferred. Inferring it went
   * wrong: "gets a Benny — now has **3**" looks exactly like a roll of 3 to any
   * rule based on the text, and offered to apply three damage to whoever was
   * selected.
   */
  applicable?: boolean;
  /**
   * Armour-piercing carried from the weapon that rolled it, so applying the
   * damage does not silently forget the AP the sheet already knew about.
   */
  ap?: number;
  /**
   * What made up the modifier on this roll — "2 wounds −2, Dark −4".
   *
   * Carried rather than recomputed: the receiving client cannot know what the
   * roller's token looked like at the moment they rolled, and by the time the
   * line is read the fight has usually moved on.
   */
  mods?: RollMod[];
  /**
   * Dice for this roll are on their way over the dice channel.
   *
   * A hint, not the payload — the dice themselves are a separate message, because
   * this one is sent `REMOTE` and would therefore animate on every screen except
   * the roller's own. What the hint buys is knowing to *hold* the line: without it
   * a receiving client cannot tell whether a roll is going to be animated, and
   * would have to either print every line at once (spoiling the animation) or delay
   * every line on the chance that dice are coming.
   *
   * Whoever rolls sets it. Whether to animate at all is the reader's own choice.
   */
  animated?: boolean;
  /** Kept local, never sent. Present only on the roller's own client. */
  secret?: boolean;

  /**
   * Enough for any client to work the roll out against a target, and no more.
   *
   * The targeting table is shown to everyone — Parry, Toughness and Pace are
   * numbers the table does arithmetic against all evening — so a receiving
   * client has to be able to build it. It looks the defenders' stats up locally
   * from the roster it already has; what it cannot know is anything about the
   * *attacker*, which is what these three carry.
   *
   * Deliberately nothing about the Marshal's characters travels in here. An
   * entry is broadcast to every client in the room, so a stat put in one is
   * published, whatever the UI then chooses to draw.
   */
  /** The attacker's token, as the point ranges are measured from. */
  from?: string;
  /** The skill rolled — "Fighting", "Shooting" — deciding what it resolves against. */
  skill?: string;
  /** The weapon's `12/24/48`, when it had one. Absent for a melee attack. */
  bands?: [number, number, number];
  /**
   * How many skill dice on this roll came up low enough to endanger a bystander.
   *
   * Carried rather than recomputed for the same reason `mods` is: the dice
   * themselves go over a *different* channel, are stripped from secret rolls, and
   * are gone by the time anyone reads the line. A receiving client cannot work
   * this out, and it is one number.
   *
   * Absent when nothing strayed, so its presence is the whole signal. Whether it
   * *means* anything still depends on the miss, which is per-target and settled in
   * the targeting table. See `bystanders.ts`.
   */
  stray?: number;
  /** The window that count was taken at — 1, or 2 for a weapon that sprays. */
  strayOn?: number;
  /**
   * The id of a roll this entry corrects.
   *
   * A shot's modifiers stay live after the dice land — the Marshal reads the
   * logged roll, says "you aimed last round", and the player clicks Aim. The
   * arithmetic changes; the dice never do.
   *
   * An amendment is its own entry rather than an edit of the one it corrects, and
   * that is not a workaround for `add` refusing a repeated id. It is the point:
   * the original roll happened, everyone saw it, and a log that rewrites itself
   * under a Marshal using it for oversight is worth less than one that appends.
   * `rollRaiseDamage` reached the same conclusion for the same reason.
   *
   * What is shown is a different question from what is stored. The panel folds an
   * amendment into the line it amends — one line on screen, the whole history
   * underneath. See `amendmentsOf` and `latest`.
   *
   * Carrying `total` and `mods` afresh, rather than a delta, means a client that
   * joined late or missed the parent still reads a complete entry.
   */
  amends?: string;
}

function isRollMod(value: unknown): value is RollMod {
  if (!value || typeof value !== 'object') return false;
  const mod = value as Partial<RollMod>;
  return (
    typeof mod.label === 'string' &&
    typeof mod.value === 'number' &&
    Number.isFinite(mod.value) &&
    (mod.kind === 'status' || mod.kind === 'situational') &&
    (mod.short === undefined || typeof mod.short === 'string')
  );
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
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
    isOptionalNumber(entry.total) &&
    isOptionalNumber(entry.ap) &&
    isOptionalNumber(entry.stray) &&
    isOptionalNumber(entry.strayOn) &&
    (entry.applicable === undefined || typeof entry.applicable === 'boolean') &&
    (entry.animated === undefined || typeof entry.animated === 'boolean') &&
    (entry.character === undefined || typeof entry.character === 'string') &&
    (entry.label === undefined || typeof entry.label === 'string') &&
    (entry.from === undefined || typeof entry.from === 'string') &&
    (entry.amends === undefined || typeof entry.amends === 'string') &&
    (entry.skill === undefined || typeof entry.skill === 'string') &&
    (entry.bands === undefined ||
      (Array.isArray(entry.bands) &&
        entry.bands.length === 3 &&
        entry.bands.every((n) => typeof n === 'number' && Number.isFinite(n)))) &&
    (entry.mods === undefined || (Array.isArray(entry.mods) && entry.mods.every(isRollMod)))
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

  /**
   * The lines to draw, with amendments folded away into what they amend.
   *
   * An amendment whose parent is *not* here stands on its own. That happens two
   * ways and both are real: the parent aged out past `limit` during a long fight,
   * or the broadcasts landed out of order and the parent has not arrived yet. The
   * second case heals itself on the next render, which is why this is computed
   * per call rather than maintained.
   */
  roots(): readonly RollEntry[] {
    return this.entries.filter((entry) => entry.amends === undefined || !this.seen.has(entry.amends));
  }

  /**
   * Every correction to one roll, **oldest first** — the order they were made.
   *
   * Against the log's own newest-first ordering on purpose: an amendment chain is
   * read as a sequence of corrections to one thing, and reversing it would show
   * the current answer before the reason for it.
   */
  amendmentsOf(id: string): readonly RollEntry[] {
    return this.entries.filter((entry) => entry.amends === id).reverse();
  }

  /**
   * The version of a roll that currently stands: the roll, with the corrections
   * applied to it.
   *
   * A **merge**, not a substitution, and that distinction is load-bearing. An
   * amendment carries the numbers that changed and nothing else — no `skill`, no
   * `bands`, no `from`, no `stray`. Returning it in place of the roll would say
   * the roll had no skill and endangered nobody, which reads downstream as the
   * targeting table vanishing and the bystander warning going quiet the moment
   * anyone corrects a shot. A bare amendment is not a version of the roll.
   *
   * So everything describing *what kind of roll this was* comes from the roll,
   * and only the numbers come from the correction. The id is the roll's too, so
   * anything keyed on it — the Marshal's damage adjustment, an open targeting
   * table — stays attached to the thing it was attached to.
   */
  latest(id: string): RollEntry | undefined {
    const roll = this.entries.find((entry) => entry.id === id);
    const last = this.amendmentsOf(id).at(-1);
    if (!roll || !last) return roll ?? last;
    return {
      ...roll,
      ...(last.total === undefined ? {} : { total: last.total }),
      ...(last.mods === undefined ? {} : { mods: last.mods }),
    };
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
  const ap = entry.ap ? ` (AP ${entry.ap})` : '';
  const mods = entry.mods?.length ? ` [${describeMods(entry.mods)}]` : '';
  return `${what}: ${entry.explained.replace(/\*\*/g, '')}${ap}${mods}`;
}

/**
 * Pull the total out of the engine's explanation.
 *
 * The total is the number after the `=`, and *only* that one. Matching any bold
 * run instead was a real bug: a Savage Worlds roll annotates its raises in bold
 * too — `s8+2: [6; w5] + 2 = **8** (success; **1** raise)` — so a roll that
 * succeeded with a raise looked ambiguous and yielded nothing. Which meant Soak
 * silently did nothing on exactly the rolls that should have worked.
 *
 * Still returns nothing when there are several totals, since that is a
 * multi-roll and picking one would be a guess.
 */
export function totalOf(explained: string): number | undefined {
  const totals = [...explained.matchAll(/=\s*\*\*(-?\d+)\*\*/g)];
  if (totals.length !== 1) return undefined;
  return Number(totals[0]![1]);
}

/**
 * Whether this roll may be applied to a token as damage.
 *
 * A whitelist, set by the publisher: damage rolls and anything typed by hand.
 * Trait rolls are not — `s8` measures whether you hit, not how hard — and
 * neither are the log's own notices. Deducing it from the text had "gets a
 * Benny — now has **3**" offering to deal three damage.
 */
export function isApplicable(entry: RollEntry): boolean {
  return entry.applicable === true && entry.total !== undefined;
}
