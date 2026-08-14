/**
 * Creature presets from the Savage Free Bestiary — a free, fan-made collection
 * for Savage Worlds, credited in the data file.
 *
 * Each creature is stored as the raw stat-block text it was published with, and
 * read by the same `parseStatBlock` the GM's paste box uses. One parser, one set
 * of tests, and a preset that behaves exactly like something typed in by hand.
 *
 * **These are not Deadlands: The Weird West stat blocks.** The collection
 * predates SWADE and shows it — most obviously in the Guts skill, which SWADE
 * folded into Spirit. They import cleanly and are a good starting point, but a
 * Marshal should expect to adjust them.
 */
import data from './bestiary.json' with { type: 'json' };
import { parseStatBlock } from './statBlock.js';
import type { Sheet } from './sheet.js';

export interface Creature {
  name: string;
  category: string;
  description?: string;
  /** The stat block as published. */
  block: string;
}

export const BESTIARY: Creature[] = data.creatures as Creature[];
export const BESTIARY_SOURCE = data.source;

export const BESTIARY_CATEGORIES = [...new Set(BESTIARY.map((c) => c.category))].sort();

/** Skills this collection uses that SWADE does not have. */
export const OUTDATED_SKILLS = ['Guts', 'Knowledge', 'Lockpicking', 'Streetwise', 'Throwing'];

export function findCreature(name: string): Creature | undefined {
  const key = name.trim().toLowerCase();
  return BESTIARY.find((c) => c.name.toLowerCase() === key);
}

export function searchCreatures(query: string, limit = 25): Creature[] {
  const key = query.trim().toLowerCase();
  if (!key) return BESTIARY.slice(0, limit);
  const starts = BESTIARY.filter((c) => c.name.toLowerCase().startsWith(key));
  const contains = BESTIARY.filter(
    (c) => !c.name.toLowerCase().startsWith(key) && c.name.toLowerCase().includes(key),
  );
  return [...starts, ...contains].slice(0, limit);
}

/** A sheet for a preset, with its description carried across. */
export function creatureSheet(creature: Creature): Sheet {
  const sheet = parseStatBlock(creature.block, creature.name);
  if (creature.description) sheet.description = creature.description;
  return sheet;
}

/** Which of this sheet's skills are not part of SWADE. */
export function outdatedSkills(sheet: Sheet): string[] {
  return Object.keys(sheet.skills).filter((name) => OUTDATED_SKILLS.includes(name));
}
