/**
 * The campaign roster: PC sheets in room metadata, one key per character.
 *
 * One key per PC rather than a single `roster` object, for the reason measured in
 * milestone 0: writes are last-write-wins per key, so two players editing two
 * different characters must not share a key. It also means a sheet that grows too
 * large fails on its own rather than taking the party down with it.
 *
 * ## Where the rules text goes
 *
 * A full imported sheet is ~1,877 chars, three-fifths of which is the rules text
 * of its edges and hindrances — six of those would be 75% of the room's ~15 kB.
 *
 * The first design sent that prose to the token. That was wrong twice over: it
 * keyed the text by entry name inside each sheet, so two identically-named
 * entries collided; and a PC exists campaign-wide while a token does not, so the
 * prose of an off-scene character had nowhere to live.
 *
 * The observation that fixes both: **rules text is not character data.** "GUTS"
 * says the same thing on every card that has it. So it lives once, in a single
 * shared dictionary keyed by entry name, and the sheets store only names. Six PCs
 * with overlapping edges pay for each edge once rather than six times.
 *
 * The dictionary is **best-effort and evictable**: if it does not fit, sheets
 * still save and the UI shows edge names without their text. Nothing that matters
 * is ever traded against something that does not.
 */
import type { NamedEntry, Sheet } from '../rules/sheet.js';
import { sheetFromJson } from '../rules/sheet.js';
import { CapacityError, VerifiedStore, WriteDroppedError } from './store.js';

export const ROSTER_PREFIX = 'com.savagebot/pc/';
export const TEXT_KEY = 'com.savagebot/rules-text';
export const ROSTER_VERSION = 1;

/** Entry name → rules text, shared by every character that has that edge. */
export type RulesText = Record<string, string>;

export interface SplitSheet {
  lean: Sheet;
  /** This sheet's contribution to the shared dictionary. */
  text: RulesText;
}

/**
 * Strip rules text out of a sheet, returning what it contributed to the shared
 * dictionary. Gear, quote and advances stay on the sheet: they are genuinely
 * per-character, and modest.
 */
export function splitSheet(sheet: Sheet): SplitSheet {
  const text: RulesText = {};
  const strip = (entries: NamedEntry[]): NamedEntry[] =>
    entries.map((entry) => {
      if (entry.text) text[entry.name] = entry.text;
      return { name: entry.name };
    });

  return {
    lean: { ...sheet, edges: strip(sheet.edges), hindrances: strip(sheet.hindrances) },
    text,
  };
}

/**
 * Reattach rules text from the dictionary.
 *
 * Keying by name is correct rather than merely convenient here: two entries with
 * the same name *are* the same edge and should show the same text. (Two characters
 * with a homebrew variant under one name would share the last-written text — worth
 * knowing, but preferable to storing the same paragraph six times.)
 */
export function joinSheet(lean: Sheet, text: RulesText | undefined): Sheet {
  if (!text) return lean;
  const restore = (entries: NamedEntry[]): NamedEntry[] =>
    entries.map((entry) => (text[entry.name] ? { ...entry, text: text[entry.name]! } : entry));
  return { ...lean, edges: restore(lean.edges), hindrances: restore(lean.hindrances) };
}

/** What a whole-roster export looks like. This is the backup and the room-to-room move. */
export interface RosterExport {
  version: number;
  exportedAt: string;
  /** Full sheets, prose reattached — an export must stand alone. */
  sheets: Sheet[];
}

export class Roster {
  constructor(
    private readonly store: VerifiedStore,
    private readonly onWarning: (message: string) => void = () => {},
  ) {}

  private key(id: string): string {
    return `${ROSTER_PREFIX}${id}`;
  }

  async rulesText(): Promise<RulesText> {
    return (await this.store.read<RulesText>(TEXT_KEY)) ?? {};
  }

  /** Lean sheets, as stored. Use `listFull` when the text is wanted too. */
  async list(): Promise<Sheet[]> {
    const all = await this.store.readAll();
    return Object.entries(all)
      .filter(([key, value]) => key.startsWith(ROSTER_PREFIX) && value !== undefined)
      .map(([, value]) => value as Sheet)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listFull(): Promise<Sheet[]> {
    const text = await this.rulesText();
    return (await this.list()).map((sheet) => joinSheet(sheet, text));
  }

  async get(id: string): Promise<Sheet | undefined> {
    const lean = await this.store.read<Sheet>(this.key(id));
    return lean && joinSheet(lean, await this.rulesText());
  }

  /**
   * Save a character. The sheet write must succeed; the dictionary write is
   * allowed to fail, and says so rather than failing the save.
   */
  async save(sheet: Sheet): Promise<void> {
    const { lean, text } = splitSheet(sheet);
    await this.store.write(this.key(sheet.id), lean);
    await this.mergeText(text);
  }

  private async mergeText(contribution: RulesText): Promise<void> {
    const current = await this.rulesText();
    const merged = { ...current, ...contribution };
    const changed = Object.keys(contribution).some((k) => current[k] !== contribution[k]);
    if (!changed) return;
    try {
      await this.store.write(TEXT_KEY, merged);
    } catch (error) {
      if (error instanceof CapacityError || error instanceof WriteDroppedError) {
        this.onWarning(
          'no room for the rules-text dictionary — sheets are saved, but edges and ' +
            'hindrances will show without their descriptions',
        );
        return;
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(this.key(id));
    // The dictionary is intentionally left alone: another character very likely
    // shares these edges, and a stale entry costs a few hundred bytes at worst.
  }

  /** Drop the dictionary to reclaim its space. Sheets keep working without it. */
  async dropRulesText(): Promise<void> {
    await this.store.remove(TEXT_KEY);
  }

  /** Whole-roster export, with prose reattached so the file stands on its own. */
  async export(): Promise<RosterExport> {
    return {
      version: ROSTER_VERSION,
      exportedAt: new Date().toISOString(),
      sheets: await this.listFull(),
    };
  }

  /**
   * Import a previously exported roster.
   *
   * Refuses outright rather than half-importing: discovering on sheet five that
   * the room is full would leave the roster in a state nobody asked for. The
   * estimate counts the key names too — `com.savagebot/pc/<id>` is ~25 chars
   * apiece, negligible for a party and not for thirty NPCs.
   */
  async import(data: RosterExport | string): Promise<Sheet[]> {
    const parsed: RosterExport =
      typeof data === 'string' ? (JSON.parse(data) as RosterExport) : data;
    if (!Array.isArray(parsed.sheets)) throw new Error('not a roster export: no sheets array');
    if (parsed.version > ROSTER_VERSION) {
      throw new Error(`roster was exported by a newer version (${parsed.version})`);
    }

    const sheets = parsed.sheets.map((sheet) => sheetFromJson(JSON.stringify(sheet)));
    const projected = sheets.reduce((total, sheet) => {
      const { lean } = splitSheet(sheet);
      // +4 for the quotes, colon and comma JSON adds around each entry.
      return total + JSON.stringify(lean).length + this.key(sheet.id).length + 4;
    }, 0);
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
