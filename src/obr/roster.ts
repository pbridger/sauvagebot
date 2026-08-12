/**
 * The campaign roster: PC sheets in room metadata, one key per character.
 *
 * One key per PC rather than a single `roster` object, for the reason measured in
 * milestone 0: writes are last-write-wins per key, so two players editing two
 * different characters must not share a key. It also means a sheet that grows too
 * large fails on its own rather than taking the party down with it.
 *
 * The bulky half of a sheet — the rules text of edges and hindrances, gear, the
 * quote — is *not* stored here. On the party's real cards that prose is 60% of the
 * sheet, and six full sheets would be 75% of the room's budget. `splitSheet` sends
 * it to the token instead, where there is 512 kB spare.
 */
import type { NamedEntry, Sheet } from '../rules/sheet.js';
import { sheetFromJson } from '../rules/sheet.js';
import type { VerifiedStore } from './store.js';

export const ROSTER_PREFIX = 'com.savagebot/pc/';
export const ROSTER_VERSION = 1;

/** The half of a sheet that stays out of the room budget. */
export interface SheetProse {
  quote?: string;
  gear?: string;
  advances?: string;
  /** Rules text keyed by entry name, so it can be reattached on read. */
  text: Record<string, string>;
}

export interface SplitSheet {
  lean: Sheet;
  prose: SheetProse;
}

export function splitSheet(sheet: Sheet): SplitSheet {
  const text: Record<string, string> = {};
  const strip = (entries: NamedEntry[]): NamedEntry[] =>
    entries.map((entry) => {
      if (entry.text) text[entry.name] = entry.text;
      return { name: entry.name };
    });

  const lean: Sheet = {
    ...sheet,
    edges: strip(sheet.edges),
    hindrances: strip(sheet.hindrances),
  };
  delete lean.quote;
  delete lean.gear;
  delete lean.advances;

  const prose: SheetProse = { text };
  if (sheet.quote !== undefined) prose.quote = sheet.quote;
  if (sheet.gear !== undefined) prose.gear = sheet.gear;
  if (sheet.advances !== undefined) prose.advances = sheet.advances;

  return { lean, prose };
}

export function joinSheet(lean: Sheet, prose: SheetProse | undefined): Sheet {
  if (!prose) return lean;
  const restore = (entries: NamedEntry[]): NamedEntry[] =>
    entries.map((entry) => {
      const text = prose.text[entry.name];
      return text ? { ...entry, text } : entry;
    });

  const sheet: Sheet = {
    ...lean,
    edges: restore(lean.edges),
    hindrances: restore(lean.hindrances),
  };
  if (prose.quote !== undefined) sheet.quote = prose.quote;
  if (prose.gear !== undefined) sheet.gear = prose.gear;
  if (prose.advances !== undefined) sheet.advances = prose.advances;
  return sheet;
}

/** What a whole-roster export looks like. This is the backup and the room-to-room move. */
export interface RosterExport {
  version: number;
  exportedAt: string;
  sheets: Sheet[];
}

export class Roster {
  constructor(private readonly store: VerifiedStore) {}

  private key(id: string): string {
    return `${ROSTER_PREFIX}${id}`;
  }

  async list(): Promise<Sheet[]> {
    const all = await this.store.readAll();
    return Object.entries(all)
      .filter(([key, value]) => key.startsWith(ROSTER_PREFIX) && value !== undefined)
      .map(([, value]) => value as Sheet)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Sheet | undefined> {
    return this.store.read<Sheet>(this.key(id));
  }

  /**
   * Saves the lean half and hands back the prose for the caller to put on the
   * token. Returning it rather than writing it keeps this class ignorant of items,
   * which is what lets it be tested without OBR.
   */
  async save(sheet: Sheet): Promise<SheetProse> {
    const { lean, prose } = splitSheet(sheet);
    await this.store.write(this.key(sheet.id), lean);
    return prose;
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(this.key(id));
  }

  /** Whole-roster export. Lean sheets only — prose lives on tokens and travels with them. */
  async export(): Promise<RosterExport> {
    return {
      version: ROSTER_VERSION,
      exportedAt: new Date().toISOString(),
      sheets: await this.list(),
    };
  }

  /**
   * Import a previously exported roster.
   *
   * Refuses partway rather than half-importing: the budget is checked for the
   * whole set first, because discovering on sheet five that the room is full
   * would leave the roster in a state nobody asked for.
   */
  async import(data: RosterExport | string): Promise<Sheet[]> {
    const parsed: RosterExport =
      typeof data === 'string' ? (JSON.parse(data) as RosterExport) : data;
    if (!Array.isArray(parsed.sheets)) throw new Error('not a roster export: no sheets array');
    if (parsed.version > ROSTER_VERSION) {
      throw new Error(`roster was exported by a newer version (${parsed.version})`);
    }

    const sheets = parsed.sheets.map((sheet) => sheetFromJson(JSON.stringify(sheet)));
    const projected = sheets.reduce(
      (total, sheet) => total + JSON.stringify(splitSheet(sheet).lean).length,
      0,
    );
    const { used, capacity } = await this.store.usage();
    if (used + projected > capacity) {
      throw new Error(
        `importing ${sheets.length} sheets needs ${projected} chars but only ` +
          `${capacity - used} remain — nothing was imported`,
      );
    }

    for (const sheet of sheets) await this.save(sheet);
    return sheets;
  }
}
