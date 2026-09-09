/**
 * What is actually in a metadata document, and whose it is.
 *
 * The room is ~16 kB shared by **everything in the room**, and until now the only
 * thing anybody could see was a percentage. A number with no attribution is not
 * actionable: it says you are nearly full and nothing about what to do next. This
 * turns a document into named rows — *Reggie Kane's character sheet*, *Bennies for
 * a character that no longer exists* — so the Marshal can decide rather than guess.
 *
 * Two facts shape it, and both are measured rather than assumed:
 *
 *  - **The budget is per document, not per extension.** `usedBytes` is
 *    `JSON.stringify` of the whole thing and `VerifiedStore` checks a write against
 *    that, so a key belonging to another extension costs us exactly what one of
 *    ours does. Whether any exist in a given room is a question only this report can
 *    answer — §12.5's dump of Paul's room found none, and it would have shown them.
 *  - **Per-key costs do not sum to the document total.** The braces and separators
 *    belong to no key. So the total is taken from the document and the rows are
 *    attribution, never the other way round; a pane that added rows up would quietly
 *    disagree with the thing the store actually enforces.
 *
 * No OBR import: this is a pure function of a metadata object plus who is in the
 * room, which is what makes it testable in node against documents nobody has to be
 * running Owlbear to produce.
 */
import { BENNY_PREFIX } from './bennyBank.js';
import { POWER_PREFIX } from './powerBank.js';
import { ROSTER_PREFIX, TEXT_KEY } from './roster.js';
import { DICE_PREFIX, MINE_PREFIX, PLACE_PREFIX } from './seats.js';

/**
 * The superseded seating schema. `seats.ts` says in as many words that the key is
 * `place/` and not this, and that the old ones are *"left to rot"* — so they are
 * still being paid for in every room that predates the change. Named here because
 * this is the first screen that can offer to sweep them up.
 */
export const LEGACY_SEAT_PREFIX = 'com.savagebot/seat/';

/** Everything this extension writes lives under one namespace. */
export const NAMESPACE = 'com.savagebot/';

/** Leftovers from the probe harness — `probe.ts` writes these and can strand them. */
export const PROBE_PREFIX = 'com.savagebot/probe';

/**
 * The scene's turn order. Written by `backends.ts`, which is extension-side and
 * cannot be imported here, so the string is repeated deliberately — the alternative
 * is a src → extension dependency for one literal.
 */
export const INITIATIVE_KEY = 'com.savagebot/initiative';

/**
 * What a row is, for the grouped total.
 *
 * The per-key list is the evidence; the grouping is the answer. Six sheets across
 * six keys read as noise until they are added up as "the characters".
 */
export type StorageGroup =
  | 'characters'
  | 'bennies'
  | 'rules-text'
  | 'table'
  | 'session'
  | 'stale'
  | 'other-extension'
  | 'unrecognised';

/**
 * What the pane offers for a row *besides* clearing it, which every row now has.
 *
 * `move` is the one that matters: it is how a Marshal actually reclaims campaign
 * space, since character sheets are the biggest thing in the room and deleting them
 * is not what anybody wants. Both directions, because a villain promoted to the
 * campaign and a villain sent back to the map are equally ordinary.
 */
export type StorageAction =
  | { kind: 'none' }
  | { kind: 'move'; sheetId: string; to: 'room' | 'scene' }
  | { kind: 'roster'; sheetId: string };

/**
 * How badly a row would be missed.
 *
 * Every row can be cleared — Paul, 2026-09-09: the pane exists so the Marshal can
 * make the deletion decision, and one that hides the button on the rows that
 * actually cost something is not that pane. What survives of the earlier caution is
 * this grading, which decides the wording and the colour rather than whether the
 * button is there at all. Undo is what makes that safe, and it is offered on every
 * clear.
 */
export type Weight =
  | 'leftover'
  | 'rebuildable'
  | 'state'
  | 'sheet'
  | 'foreign';

export interface StorageRow {
  key: string;
  /** Cost including the key name, which is a third of a `bennies/<id>` entry. */
  chars: number;
  /** What it is, in words a Marshal can act on. */
  label: string;
  /** Why it is here, or what happens to it. Absent when the label says everything. */
  note?: string | undefined;
  group: StorageGroup;
  action: StorageAction;
  weight: Weight;
  /** What clearing this one actually costs, in the notice and the tooltip. */
  clearNote: string;
}

export interface StorageGroupTotal {
  group: StorageGroup;
  label: string;
  chars: number;
  keys: number;
}

export interface DocumentReport {
  /** `room` or `scene` — which document this is. */
  scope: 'room' | 'scene';
  /** From `JSON.stringify` of the document: the figure the store enforces. */
  total: number;
  capacity: number;
  /** Keys holding a value. */
  live: number;
  /**
   * Keys present but `undefined`. Worth reporting separately: a deleted key can
   * linger in the object we are handed while costing nothing, and counting those as
   * live would overstate what is stored.
   */
  tombstoned: number;
  rows: StorageRow[];
  groups: StorageGroupTotal[];
  /** Total held by keys this extension did not write. */
  foreign: number;
}

/** Who is in the room, for naming a per-player key. */
export interface Seated {
  id: string;
  name: string;
}

/** Enough of a sheet to name one. Takes the real `Sheet` without importing it. */
export interface Named {
  id: string;
  name: string;
  pc?: boolean | undefined;
}

export interface ReportContext {
  sheets: readonly Named[];
  party: readonly Seated[];
  /** Which document this is. Decides whether a sheet can be moved out of it. */
  scope: 'room' | 'scene';
}

const GROUP_LABELS: Record<StorageGroup, string> = {
  characters: 'Character sheets',
  bennies: 'Bennies and Power Points',
  'rules-text': 'Stored rules text',
  table: 'Seating and preferences',
  session: 'This scene',
  stale: 'Leftovers',
  'other-extension': 'Other extensions',
  unrecognised: 'Unrecognised',
};

export function groupLabel(group: StorageGroup): string {
  return GROUP_LABELS[group];
}

/**
 * What one key costs the document.
 *
 * Deliberately identical to `probe.ts`'s: the key name, its quotes, the colon, the
 * value and the comma. Two screens reporting the same room must not print two
 * different numbers, because nobody would know which to believe.
 */
export function keyCost(key: string, value: unknown): number {
  if (value === undefined) return 0;
  return JSON.stringify(key).length + 1 + JSON.stringify(value).length + 1;
}

/** The namespace an unfamiliar key belongs to — `rodeo.owlbear.fog/state` → the fog. */
function ownerOf(key: string): string {
  const slash = key.indexOf('/');
  return slash > 0 ? key.slice(0, slash) : key;
}

function personNamed(id: string, party: readonly Seated[]): string | undefined {
  return party.find((seated) => seated.id === id)?.name;
}

/**
 * Classify one key.
 *
 * Ordered most specific first, and `seat/` is tested before `place/` would ever
 * match anything, because the two prefixes are one character apart and getting that
 * backwards would offer to delete the live seating.
 */
export function describeKey(key: string, value: unknown, context: ReportContext): StorageRow {
  const chars = keyCost(key, value);
  const row = (rest: Omit<StorageRow, 'key' | 'chars'>): StorageRow => ({ key, chars, ...rest });

  if (!key.startsWith(NAMESPACE)) {
    return row({
      label: `${ownerOf(key)} — another extension`,
      note: 'Not ours. It shares this document’s budget all the same.',
      group: 'other-extension',
      action: { kind: 'none' },
      weight: 'foreign',
      clearNote: 'Another extension wrote this and will not know it has gone.',
    });
  }

  if (key.startsWith(PROBE_PREFIX)) {
    return row({
      label: 'Left behind by the storage probe',
      note: 'Test data. Nothing reads it.',
      group: 'stale',
      action: { kind: 'none' },
      weight: 'leftover',
      clearNote: 'Nothing reads it.',
    });
  }

  if (key.startsWith(LEGACY_SEAT_PREFIX)) {
    return row({
      label: 'Seating from an older version',
      note: 'Superseded by the current seating, which is stored separately.',
      group: 'stale',
      action: { kind: 'none' },
      weight: 'leftover',
      clearNote: 'Nothing reads it.',
    });
  }

  if (key.startsWith(ROSTER_PREFIX)) {
    const id = key.slice(ROSTER_PREFIX.length);
    const sheet = context.sheets.find((s) => s.id === id);
    const name = sheet?.name ?? id;
    // A PC has to survive changing map, so the room is the only place it can live
    // and there is nothing to offer. An NPC in the room is a deliberate choice —
    // §14.9's promoted villain — but it is also the biggest thing in here, so the
    // pane says how to reclaim it rather than pretending it is fixed.
    // A PC has to survive changing map, so the room is the only place it can live.
    // Everyone else can go either way: to the scene to stop costing the campaign
    // anything, or back to the room to outlive the map they were made on.
    const movable = sheet !== undefined && !sheet.pc;
    const to = context.scope === 'room' ? 'scene' : 'room';
    return row({
      label: `${name} — character sheet`,
      note: sheet?.pc
        ? 'A player’s character. Kept in the room so it survives changing map.'
        : movable && to === 'scene'
          ? 'Kept for the whole campaign. Move it to the scene to free this up.'
          : movable
            ? 'Goes when this map does. Move it to the campaign to keep it.'
            : undefined,
      group: 'characters',
      action: movable
        ? { kind: 'move', sheetId: id, to }
        : sheet
          ? { kind: 'roster', sheetId: id }
          : { kind: 'none' },
      weight: 'sheet',
      clearNote: `This deletes ${name}. Moving is usually what you want instead.`,
    });
  }

  if (key.startsWith(BENNY_PREFIX) || key.startsWith(POWER_PREFIX)) {
    const isBennies = key.startsWith(BENNY_PREFIX);
    const id = key.slice((isBennies ? BENNY_PREFIX : POWER_PREFIX).length);
    const sheet = context.sheets.find((s) => s.id === id);
    const what = isBennies ? 'Bennies' : 'Power Points';
    if (!sheet) {
      return row({
        label: `${what} for a character that no longer exists`,
        note: `Nothing on the roster is called “${id}”.`,
        group: 'stale',
        action: { kind: 'none' },
        weight: 'leftover',
        clearNote: 'Nothing reads it.',
      });
    }
    return row({
      label: `${sheet.name}’s ${what}`,
      group: 'bennies',
      action: { kind: 'none' },
      weight: 'state',
      clearNote: `${sheet.name} goes back to none.`,
    });
  }

  if (key === TEXT_KEY) {
    return row({
      label: 'Rules text kept from older sheets',
      note: 'The rulebook ships inside this extension, so most of this is a second copy.',
      group: 'rules-text',
      action: { kind: 'none' },
      weight: 'rebuildable',
      clearNote:
        'Anything the rulebook covers comes back from the book. Homebrew wording ' +
        'does not — use the button below, which keeps it.',
    });
  }

  if (key === INITIATIVE_KEY) {
    return row({
      label: 'The turn order',
      group: 'session',
      action: { kind: 'none' },
      weight: 'state',
      clearNote: 'Ends the current fight — the same as pressing Clear on it.',
    });
  }

  for (const [prefix, what] of [
    [PLACE_PREFIX, 'place at the table'],
    [DICE_PREFIX, 'dice preference'],
    [MINE_PREFIX, 'claimed character'],
  ] as const) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    const name = personNamed(id, context.party);
    return row({
      label: name ? `${name}’s ${what}` : `A ${what}`,
      // Not offered for deletion even when the player is absent: they are a few
      // chars each, and someone who is not logged in tonight is not gone. If these
      // pile up far beyond the size of the group, that is the `seats.ts` warning
      // about player ids coming true, and the count is the evidence for it.
      note: name ? undefined : 'Whoever this was is not in the room right now.',
      group: 'table',
      action: { kind: 'none' },
      weight: 'state',
      clearNote: name
        ? `${name} is re-seated automatically; a dice colour would be picked again.`
        : 'They are re-seated automatically if they come back.',
    });
  }

  return row({
    label: key.slice(NAMESPACE.length),
    note: 'Ours, but this screen does not know what it is.',
    group: 'unrecognised',
    action: { kind: 'none' },
    weight: 'state',
    clearNote: 'Nothing here knows what depends on it.',
  });
}

/**
 * The whole document, attributed.
 *
 * Rows are sorted by cost because the question being asked is always "what is big",
 * and groups the same way for the same reason.
 */
export function reportDocument(
  metadata: Readonly<Record<string, unknown>>,
  capacity: number,
  context: ReportContext,
): DocumentReport {
  const entries = Object.entries(metadata);
  const live = entries.filter(([, value]) => value !== undefined);

  const rows = live
    .map(([key, value]) => describeKey(key, value, context))
    .sort((a, b) => b.chars - a.chars || a.key.localeCompare(b.key));

  const totals = new Map<StorageGroup, StorageGroupTotal>();
  for (const item of rows) {
    const current =
      totals.get(item.group) ??
      { group: item.group, label: groupLabel(item.group), chars: 0, keys: 0 };
    current.chars += item.chars;
    current.keys += 1;
    totals.set(item.group, current);
  }

  return {
    scope: context.scope,
    total: JSON.stringify(metadata).length,
    capacity,
    live: live.length,
    tombstoned: entries.length - live.length,
    rows,
    groups: [...totals.values()].sort((a, b) => b.chars - a.chars),
    foreign: rows
      .filter((item) => item.group === 'other-extension')
      .reduce((sum, item) => sum + item.chars, 0),
  };
}

/**
 * The keys nothing reads any more — what the sweep-up button takes.
 *
 * Every row has its own Clear now, so this is not "what may be deleted" but "what
 * can be deleted without thinking about it": the probe's litter, the superseded
 * seating schema, and chips banked for characters that no longer exist.
 */
export function leftoverKeys(report: DocumentReport): string[] {
  return report.rows.filter((row) => row.weight === 'leftover').map((row) => row.key);
}

export function leftoverChars(report: DocumentReport): number {
  return report.rows
    .filter((row) => row.weight === 'leftover')
    .reduce((sum, row) => sum + row.chars, 0);
}
