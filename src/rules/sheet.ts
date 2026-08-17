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

/**
 * The skills the cards print by default, in their printed order.
 *
 * NOT an exhaustive list, and skills are NOT restricted to it. The party's own
 * cards already break it three ways: Father Jed has **Faith**, Paige has
 * **Trade (Journalism)** and Sir Ed **Language (Your Choice)** — an arcane skill
 * and two parenthetical specialisations. A sheet may hold any skill name.
 */
export const BASE_SKILLS = [
  'Academics', 'Athletics', 'Battle', 'Boating', 'Com. Knowledge', 'Driving',
  'Fighting', 'Gambling', 'Healing', 'Intimidation', 'Language', 'Notice',
  'Occult', 'Performance', 'Persuasion', 'Piloting', 'Repair', 'Research',
  'Riding', 'Science', 'Shooting', 'Stealth', 'Survival', 'Taunt',
  'Thievery', 'Trade',
] as const;

/** A known skill name. Any string is legal; this is for autocomplete and ordering. */
export type BaseSkill = (typeof BASE_SKILLS)[number];

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
  /**
   * Marshal's eyes only: hidden from players' panels, pickers and initiative
   * names.
   *
   * A screen, not a vault. Room metadata is readable by every client in the room,
   * so this keeps a mook's stats out of the way rather than out of reach — the
   * same guard rail as the Table tab. It is the right level for a table where
   * everyone is trusted; it is not a defence against someone who goes looking.
   */
  private?: boolean;
  /**
   * What colour this character's animated dice are.
   *
   * On the sheet rather than on the player, because a character is the thing you
   * recognise across the table — the Marshal rolls for six of them in a fight, and
   * one colour per *player* would make all six the same. Absent means the colour
   * `defaultDiceColour` picks from the character's id, so every character starts
   * distinguishable without anybody choosing anything.
   */
  diceColour?: string;

  attributes: Partial<Record<Attribute, Trait>>;
  /** Free-form: the cards carry arcane skills and parenthetical specialisations. */
  skills: Record<string, Trait>;

  pace?: number;
  parry?: number;
  toughness?: number;
  armor?: number;
  /** The card writes Toughness as e.g. "7(5)". Kept verbatim so nothing is lost. */
  toughnessRaw?: string;

  hindrances: NamedEntry[];
  edges: NamedEntry[];
  /** Who this is: flavour, notes, whatever the GM wants to remember. */
  description?: string;
  /** Free text on the card, deliberately not parsed into items. */
  gear?: string;
  advances?: string;
  /** The POWERS block: powers, Power Points, Backlash. Blessed and Hucksters have one. */
  powers?: NamedEntry[];
}

/**
 * Skill names to show, in a stable order: the printed list first, then anything
 * this character has that is not on it, in the order the card gave them.
 */
export function skillNames(sheet: Sheet): string[] {
  const extra = Object.keys(sheet.skills).filter(
    (name) => !(BASE_SKILLS as readonly string[]).includes(name),
  );
  return [...BASE_SKILLS, ...extra];
}

// NB: per-token combat state lives in `obr/binding.ts`, not here — it belongs to
// the token and the scene rather than to the character.

export function emptySheet(id: string, name: string): Sheet {
  return { id, name, wildCard: true, attributes: {}, skills: {}, hindrances: [], edges: [] };
}

/** The die a trait rolls, defaulting to d4-2 for an untrained skill as SWADE does. */
export function traitDie(sheet: Sheet, skill: string): { die: DieSides; mod: number } {
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

/**
 * The colours animated dice come in.
 *
 * A short, deliberately spread-out list rather than a colour picker: these have to
 * be told apart across a table at a glance, mid-fight, by someone who is not looking
 * for the difference. Two greens a shade apart would be worse than either alone.
 * Named for the Weird West, because a dropdown reading "Whisky" is easier to hold in
 * mind than one reading "#b4792c".
 */
export const DICE_COLOURS: readonly { name: string; hex: string }[] = [
  { name: 'Bone', hex: '#e8e0cf' },
  { name: 'Blood', hex: '#a32e26' },
  { name: 'Whisky', hex: '#b4792c' },
  { name: 'Brass', hex: '#c9a227' },
  { name: 'Sagebrush', hex: '#4f7a4a' },
  { name: 'Sky', hex: '#3d7ea6' },
  { name: 'Ink', hex: '#2f3542' },
  { name: 'Widow', hex: '#6b4a7a' },
  { name: 'Dust', hex: '#9a8f7a' },
];

/**
 * The colour a character's dice start out.
 *
 * Derived from the id rather than assigned in order, so it does not depend on what
 * else is in the roster: importing a character twice, or in a different order, gives
 * the same colour both times. Bone is skipped for the default — it is the fallback
 * for anything unrecognised, and a party where two characters happen to be Bone
 * should be a choice somebody made rather than a coincidence.
 */
export function defaultDiceColour(id: string): string {
  const palette = DICE_COLOURS.slice(1);
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
  return palette[hash % palette.length]!.hex;
}

/** The colour this character's dice are, chosen or derived. */
export function diceColourOf(sheet: Sheet): string {
  return sheet.diceColour ?? defaultDiceColour(sheet.id);
}
