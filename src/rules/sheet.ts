/**
 * The character sheet.
 *
 * The shape is not invented — it is taken from the party's actual sheets, the
 * "Deadlands Seasoned Archetypes" printable HTML cards (see `importArchetypeCard.ts`).
 * Matching what they already use means import is lossless and nobody has to
 * re-key a character.
 *
 * Split by lifecycle, as measured in docs/OBR-DEADLANDS-PLAN.md §2:
 *   - `Sheet`  — the build. Campaign-scoped, lives in room metadata (~400 chars each).
 *   - `TokenState` — wounds, fatigue, shaken, initiative card. Scene-scoped, lives in
 *     item metadata on the token, alongside anything bulky.
 *
 * Keeping them apart is what lets the roster stay inside the room's ~15 kB budget
 * while notes and prose go on the token, where there is 512 kB going spare.
 */

export const ATTRIBUTES = ['agility', 'smarts', 'spirit', 'strength', 'vigor'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

/** The SWADE skill list, in the order the party's cards print them. */
export const SKILLS = [
  'Academics', 'Athletics', 'Battle', 'Boating', 'Com. Knowledge', 'Driving',
  'Fighting', 'Gambling', 'Healing', 'Intimidation', 'Language', 'Notice',
  'Occult', 'Performance', 'Persuasion', 'Piloting', 'Repair', 'Research',
  'Riding', 'Science', 'Shooting', 'Stealth', 'Survival', 'Taunt',
  'Thievery', 'Trade',
] as const;
export type Skill = (typeof SKILLS)[number];

/** Die sides. A trait the character does not have is absent, not `0`. */
export type DieSides = 4 | 6 | 8 | 10 | 12;

export interface Trait {
  die: DieSides;
  /** Flat modifier, e.g. `+1` from an Edge. Absent means zero. */
  mod?: number;
}

export interface NamedEntry {
  name: string;
  /** The card carries the rules text inline; keep it, it is what players read. */
  text?: string;
}

export interface Sheet {
  id: string;
  name: string;
  /** The card's italic line under the name. */
  quote?: string;
  rank?: string;
  wildCard: boolean;

  attributes: Partial<Record<Attribute, Trait>>;
  skills: Partial<Record<Skill, Trait>>;

  pace?: number;
  parry?: number;
  toughness?: number;
  armor?: number;
  /** The card writes Toughness as e.g. "7(5)". Kept verbatim so nothing is lost. */
  toughnessRaw?: string;

  hindrances: NamedEntry[];
  edges: NamedEntry[];
  /** Free text on the card, deliberately not parsed into items. */
  gear?: string;
  advances?: string;
}

// NB: per-token combat state lives in `obr/binding.ts`, not here — it belongs to
// the token and the scene rather than to the character.

export function emptySheet(id: string, name: string): Sheet {
  return { id, name, wildCard: true, attributes: {}, skills: {}, hindrances: [], edges: [] };
}

/** The die a trait rolls, defaulting to d4-2 for an untrained skill as SWADE does. */
export function traitDie(sheet: Sheet, skill: Skill): { die: DieSides; mod: number } {
  const trait = sheet.skills[skill];
  if (!trait) return { die: 4, mod: -2 };
  return { die: trait.die, mod: trait.mod ?? 0 };
}

export function isDieSides(n: number): n is DieSides {
  return n === 4 || n === 6 || n === 8 || n === 10 || n === 12;
}

/**
 * Round-trip check for the export/import path, which is the backup, the
 * offline-authoring route, and the way the roster moves from Paul's dev room to
 * Damian's campaign room. Nothing room-specific may leak into a sheet.
 */
export function sheetToJson(sheet: Sheet): string {
  return JSON.stringify(sheet);
}

export function sheetFromJson(text: string): Sheet {
  const parsed = JSON.parse(text) as Partial<Sheet>;
  if (!parsed || typeof parsed.id !== 'string' || typeof parsed.name !== 'string') {
    throw new Error('not a character sheet: missing id or name');
  }
  return {
    wildCard: true,
    attributes: {},
    skills: {},
    hindrances: [],
    edges: [],
    ...parsed,
  } as Sheet;
}
