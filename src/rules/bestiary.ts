/**
 * Creature presets, from more than one book.
 *
 * Each creature is stored as the raw stat-block text it was published with, and
 * read by the same `parseStatBlock` the GM's paste box uses. One parser, one set
 * of tests, and a preset that behaves exactly like something typed in by hand.
 *
 * Two collections now, and every creature says which it came from — so the
 * picker can be filtered, and, more importantly, so a sheet records which
 * *edition* its numbers were written under:
 *
 *   - **Savage Free Bestiary** — a free, fan-made collection, credited in the
 *     data file. Predates SWADE and shows it, most obviously in the Guts skill.
 *   - **Coffin Rock** — the adventure being played. Deadlands Reloaded, which is
 *     a different edition again from the party's own SWADE cards: Guts,
 *     Charisma, Knowledge (X), inches. See MECHANICS-INVENTORY.md §2.0.
 *
 * Neither is Deadlands: The Weird West. Both import cleanly and are a good
 * starting point, but a Marshal should expect to adjust them.
 */
import data from './bestiary.json' with { type: 'json' };
import coffinRock from './coffin-rock.json' with { type: 'json' };
import { parseStatBlock } from './statBlock.js';
import type { Sheet } from './sheet.js';

export interface Creature {
  name: string;
  category: string;
  description?: string;
  /** The stat block as published. */
  block: string;
  /**
   * Wild Card, where the collection said so with a ★ after the name.
   *
   * It used to be exactly that: a glyph on the end of the name. That made the
   * name wrong everywhere it was shown — in the picker, on the sheet, on the
   * token — and, worse, it was load-bearing without looking it. `parseStatBlock`
   * decides Wild Card by looking for the words "wild card" in the block, and 66
   * of the 69 starred blocks never say them, so the star was the only signal
   * those creatures had. Deleting it would have quietly demoted all 66 to Extras.
   *
   * **Coffin Rock marks its Wild Cards with a joker figure beside the heading**,
   * and that figure is an image rather than text — so it survives no amount of
   * text extraction, and the words "wild card" appear nowhere in the adventure
   * except the Blood Men's Henchman ability.
   *
   * The eleven were read off the rendered pages, one at a time. That was worth
   * doing rather than guessing from the names: a first pass marked the unique,
   * named NPCs and got **five of them wrong in both directions** — Dorothy's
   * ghost, Deacon Plume, Jonah Thurgood, Laughs At Darkness and the Summoned
   * Demon are all Extras despite being named, while the *nameless* Ghost Miners
   * carry a joker.
   *
   * The twelfth is the Blood Men, who have no joker and should not: they are
   * Henchmen, which is `wildCard` for the wild die with `maxWounds: 0` for the
   * wound track they do not get.
   */
  wildCard?: boolean;
  /**
   * A wound track that is not the one `wildCard` implies.
   *
   * Coffin Rock's Blood Men are Henchmen — *"Blood Men get a Wild Die as though
   * they were Wild Cards"* — so they are `wildCard: true, maxWounds: 0`: the
   * wild die without a Wild Card's three wounds. See `woundLimit`.
   */
  maxWounds?: number;
  /** Which collection this came from. Set by the loader, not by the data file. */
  source?: string;
}

export const SAVAGE_FREE_BESTIARY = 'savage-free-bestiary';
export const COFFIN_ROCK = 'coffin-rock';

/** Every creature from every collection, each stamped with where it came from. */
export const BESTIARY: Creature[] = [
  ...(data.creatures as Creature[]).map((c) => ({ ...c, source: SAVAGE_FREE_BESTIARY })),
  ...(coffinRock.creatures as Creature[]).map((c) => ({ ...c, source: COFFIN_ROCK })),
];

export const BESTIARY_SOURCE = data.source;
export const COFFIN_ROCK_SOURCE = coffinRock.source;

/** The collections a creature can come from, for the picker's filter. */
export const BESTIARY_SOURCES = [SAVAGE_FREE_BESTIARY, COFFIN_ROCK] as const;

export const BESTIARY_CATEGORIES = [...new Set(BESTIARY.map((c) => c.category))].sort();

/** Skills this collection uses that SWADE does not have. */
export const OUTDATED_SKILLS = ['Guts', 'Knowledge', 'Lockpicking', 'Streetwise', 'Throwing'];

export function findCreature(name: string, source?: string): Creature | undefined {
  const key = name.trim().toLowerCase();
  return BESTIARY.find(
    (c) => c.name.toLowerCase() === key && (source === undefined || c.source === source),
  );
}

/**
 * Search, optionally within one collection.
 *
 * The filter matters now there are two books in here: a Marshal running Coffin
 * Rock wants Coffin Rock's Deputies, not the fan bestiary's, and 219 animals
 * between them and the thing they are looking for.
 */
export function searchCreatures(query: string, limit = 25, source?: string): Creature[] {
  const pool = source ? BESTIARY.filter((c) => c.source === source) : BESTIARY;
  const key = query.trim().toLowerCase();
  if (!key) return pool.slice(0, limit);
  const starts = pool.filter((c) => c.name.toLowerCase().startsWith(key));
  const contains = pool.filter(
    (c) => !c.name.toLowerCase().startsWith(key) && c.name.toLowerCase().includes(key),
  );
  return [...starts, ...contains].slice(0, limit);
}

/** A sheet for a preset, with its description carried across. */
export function creatureSheet(creature: Creature): Sheet {
  const sheet = parseStatBlock(creature.block, creature.name);
  if (creature.description) sheet.description = creature.description;
  // The collection's own ★, now a field. Only ever promotes: a block that says
  // "Wild Card" in the text is one whatever the index thought.
  if (creature.wildCard) sheet.wildCard = true;
  if (creature.maxWounds !== undefined) sheet.maxWounds = creature.maxWounds;
  if (creature.source) sheet.source = creature.source;
  return sheet;
}

/** Which of this sheet's skills are not part of SWADE. */
export function outdatedSkills(sheet: Sheet): string[] {
  return Object.keys(sheet.skills).filter((name) => OUTDATED_SKILLS.includes(name));
}
