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

/** Which edition's rules a sheet is written in. `unknown` for anything typed by hand. */
export type Edition = 'swade' | 'reloaded' | 'unknown';

export interface SheetSource {
  /** Stable key, e.g. `coffin-rock`. This is the only part stored on a sheet. */
  id: string;
  /** What to show in a filter: "Coffin Rock". */
  name: string;
  edition?: Edition;
}

/**
 * The books a sheet can have come from.
 *
 * A sheet stores only the **id**, and the name and edition are looked up here.
 * That is not tidiness: room metadata has a ~15 kB budget for the whole roster,
 * and repeating `{"name":"Savage Free Bestiary","edition":"reloaded"}` on every
 * one of them cost 2.8% of it — which the size test in
 * `importArchetypeCard.test.ts` caught the moment it was tried. The name and the
 * edition are properties of the book, not of the character.
 */
export const SOURCES: readonly SheetSource[] = [
  { id: 'archetype-cards', name: 'Deadlands Seasoned Archetypes', edition: 'swade' },
  { id: 'savage-free-bestiary', name: 'Savage Free Bestiary', edition: 'reloaded' },
  { id: 'coffin-rock', name: 'Coffin Rock', edition: 'reloaded' },
];

/**
 * What a stored source id means.
 *
 * An id this build does not know still shows, spelled as itself, so a roster
 * exported from a later version does not silently lose where its creatures came
 * from.
 */
export function sourceOf(id: string | undefined): SheetSource | undefined {
  if (!id) return undefined;
  return SOURCES.find((s) => s.id === id) ?? { id, name: id, edition: 'unknown' };
}

export interface Sheet {
  id: string;
  name: string;
  /** The card's italic line under the name. */
  quote?: string;
  rank?: string;
  wildCard: boolean;
  /**
   * A player's character, rather than one of the Marshal's.
   *
   * This is the one fact the app cannot infer and the rules keep asking for.
   * Bennies are the clearest case — Joker's Wild goes to the players, a new
   * session sets *their* three, and the Marshal's own Wild Cards run off a
   * different pool — but it is also what decides whose sheet a player may open
   * and whose name shows in their initiative list.
   *
   * It replaced a `private` flag, which was the same distinction stated
   * backwards and only ever set by hand. Everything the Marshal adds — a
   * bestiary creature, a pasted stat block, a blank sheet — is an NPC until
   * somebody says otherwise, because that default is the one whose mistake is
   * recoverable: an unrevealed PC is a click away, a leaked mook cannot be
   * un-read.
   *
   * Hiding an NPC is a screen, not a vault. Room metadata is readable by every
   * client in the room, so this keeps a mook's stats out of the way rather than
   * out of reach. It is the right level for a table where everyone is trusted;
   * it is not a defence against someone who goes looking.
   */
  pc: boolean;
  /**
   * Out of the fight entirely — not dealt an Action Card, not in anybody's
   * initiative list, not offered as a target.
   *
   * For the Marshal who prepares one large map with five rooms on it. Every
   * encounter is placed before the session starts, and without this a single
   * "Deal round" deals forty cards, exhausts the deck twice over and buries the
   * six people actually in the room.
   *
   * **Not the same as hidden**, and the two are deliberately separate controls:
   * Owlbear's eye decides who the players can *see*, this decides who is in the
   * fight at all. An invisible villain and a reinforcement waiting off-stage are
   * both hidden and both very much in the fight — they hold cards and take
   * turns, which is the whole reason the eye could not do this job on its own.
   *
   * Per sheet, so it is one click for a creature type rather than one per mook;
   * the eye is the per-token half. Absent means in the fight, so the flag costs
   * room storage only for the ones parked, and nothing changes for a table that
   * never touches it.
   */
  parked?: boolean;
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
  /**
   * Deadlands Reloaded's Charisma, which SWADE does not have.
   *
   * Recorded and displayed, never used in arithmetic. Every human stat block in
   * Coffin Rock carries one and it was being dropped on import; the party's own
   * cards have none, because they are a different edition of the game. Showing
   * it is how an imported NPC stops quietly losing a line it was written with.
   */
  charisma?: number;
  /**
   * How many wounds this character takes before going down, when it is not the
   * one `wildCard` implies.
   *
   * The case is Coffin Rock's **Henchman**: *"Blood Men get a Wild Die as though
   * they were Wild Cards"* — the wild die without the wound track. `wildCard`
   * was one boolean deciding three things (the wild die, the wound track, and
   * Benny eligibility), and rather than split it, this overrides the one that
   * differs. Benny eligibility needs no help: `bennyBank` already filters on
   * `wildCard && pc`, so an NPC Henchman draws none either way.
   *
   * Absent means the default for this character's Wild Card status.
   */
  maxWounds?: number;
  /**
   * Where the character came from, so a roster can be filtered by book.
   *
   * The `edition` is the load-bearing half. Coffin Rock is Deadlands Reloaded
   * and the party's cards are SWADE — different skills, different Fear rules —
   * so `Guts` on a Reloaded sheet is correct and the same skill on a SWADE sheet
   * is a conversion error. Nothing else on a sheet records which game it is
   * written in.
   *
   * An id, resolved through `sourceOf`. See `SOURCES` for why not the object.
   */
  source?: string;

  hindrances: NamedEntry[];
  edges: NamedEntry[];
  /** Who this is: flavour, notes, whatever the GM wants to remember. */
  description?: string;
  /** Free text on the card, deliberately not parsed into items. */
  gear?: string;
  advances?: string;
  /**
   * The POWERS block: powers, Power Points, Backlash. Blessed and Hucksters have one.
   *
   * !! This field means two different things depending on how the sheet was
   * made: arcane powers when it came from a PC card, monster special abilities
   * when it came from a stat block. Splitting it needs a migration with no total
   * function — nothing records which path filled an existing sheet — and nothing
   * is built on either meaning, so both are displayed as text and the split is
   * deferred. See MECHANICS-INVENTORY.md §4.4. !!
   */
  powers?: NamedEntry[];
  /**
   * A stat block's `Powers:` line, verbatim — "Armor, bolt, dispel …; 20 PP".
   *
   * Separate from `powers` precisely because that field is already overloaded.
   * A stat block that has both — Reverend Cheval has arcane powers *and* special
   * abilities — needs somewhere to put the second one, and this is the half that
   * was being discarded entirely.
   */
  powerNotes?: string;
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
  return {
    id,
    name,
    wildCard: true,
    pc: false,
    attributes: {},
    skills: {},
    hindrances: [],
    edges: [],
  };
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
  const parsed = JSON.parse(text) as Partial<Sheet> & { private?: boolean };
  if (!parsed || typeof parsed.id !== 'string' || typeof parsed.name !== 'string') {
    throw new Error('not a character sheet: missing id or name');
  }
  // `private` was what `pc` is now, stated backwards. Rooms and exported rosters
  // from before the change still carry it, so it is read here and nowhere else:
  // a sheet that never had either field was visible to players, which is what a
  // PC is. Getting this the wrong way round would hide a whole party at once.
  const { private: wasPrivate, ...rest } = parsed;
  return {
    wildCard: true,
    attributes: {},
    skills: {},
    hindrances: [],
    edges: [],
    ...rest,
    pc: parsed.pc ?? !wasPrivate,
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
