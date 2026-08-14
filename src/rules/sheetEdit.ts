/**
 * Sheet mutations.
 *
 * All immutable — every function returns a new sheet. That suits a store with
 * last-write-wins semantics, where you want to build the next value and write it
 * whole rather than mutate something another client may also hold.
 *
 * Kept out of the panel so the rules of editing are testable in node: that
 * clearing a trait removes it rather than storing a zero, that renaming does not
 * orphan the storage key, and that a blank entry cannot be saved.
 */
import {
  ATTRIBUTES,
  BASE_SKILLS,
  emptySheet,
  isDieSides,
  type Attribute,
  type DieSides,
  type NamedEntry,
  type Sheet,
} from './sheet.js';

export type EntryList = 'edges' | 'hindrances';
export type DerivedField = 'pace' | 'parry' | 'toughness' | 'armor';

type Traits = Record<string, { die: DieSides; mod?: number }>;

function withTrait<T extends Traits>(current: T, key: string, die: DieSides | undefined, mod: number | undefined): T {
  const next: Traits = { ...current };
  if (die === undefined) {
    // Absent, not zero: an untrained skill rolls d4−2, which is not the same as
    // "has this skill at 0" — a distinction the whole sheet depends on.
    delete next[key];
    return next as T;
  }
  next[key] = mod ? { die, mod } : { die };
  return next as T;
}

export function setAttribute(
  sheet: Sheet,
  attribute: Attribute,
  die: DieSides | undefined,
  mod?: number,
): Sheet {
  return { ...sheet, attributes: withTrait(sheet.attributes, attribute, die, mod) };
}

export function setSkill(
  sheet: Sheet,
  skill: string,
  die: DieSides | undefined,
  mod?: number,
): Sheet {
  return { ...sheet, skills: withTrait(sheet.skills, skill, die, mod) };
}

/** Blank clears the field rather than storing NaN or 0. */
export function setDerived(sheet: Sheet, field: DerivedField, value: number | undefined): Sheet {
  const next = { ...sheet };
  if (value === undefined || Number.isNaN(value)) delete next[field];
  else next[field] = value;

  // The card's "7(5)" shorthand is only meaningful as imported; once either
  // number is edited by hand it is stale, so drop it rather than show a lie.
  if (field === 'toughness' || field === 'armor') delete next.toughnessRaw;
  return next;
}

export function setText(
  sheet: Sheet,
  field: 'name' | 'quote' | 'rank' | 'gear' | 'advances' | 'description',
  value: string,
): Sheet {
  const next = { ...sheet };
  const trimmed = value.trim();
  // `name` is required; the others vanish when emptied.
  if (field === 'name') {
    if (trimmed) next.name = trimmed;
    return next;
  }
  if (trimmed) next[field] = trimmed;
  else delete next[field];
  return next;
}

export function setWildCard(sheet: Sheet, wildCard: boolean): Sheet {
  return { ...sheet, wildCard };
}

export function addEntry(sheet: Sheet, list: EntryList, entry: NamedEntry): Sheet {
  return { ...sheet, [list]: [...sheet[list], entry] };
}

export function updateEntry(
  sheet: Sheet,
  list: EntryList,
  index: number,
  patch: Partial<NamedEntry>,
): Sheet {
  const entries = sheet[list].map((entry, i) => {
    if (i !== index) return entry;
    const merged: NamedEntry = { ...entry, ...patch };
    if (merged.text !== undefined && !merged.text.trim()) delete merged.text;
    merged.name = merged.name.trim();
    return merged;
  });
  return { ...sheet, [list]: entries };
}

export function removeEntry(sheet: Sheet, list: EntryList, index: number): Sheet {
  return { ...sheet, [list]: sheet[list].filter((_, i) => i !== index) };
}

/** Drop entries with no name — the state an added-but-unfilled row is in. */
export function pruneEmptyEntries(sheet: Sheet): Sheet {
  return {
    ...sheet,
    edges: sheet.edges.filter((e) => e.name.trim()),
    hindrances: sheet.hindrances.filter((e) => e.name.trim()),
  };
}

/**
 * A new character.
 *
 * The id is derived from the name once, at creation, and never again — see
 * `setText`. Regenerating it on rename would write to a new storage key and leave
 * the old one behind as a duplicate.
 */
export function newCharacter(name = 'New Character', existing: readonly Sheet[] = []): Sheet {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'character';
  let id = base;
  for (let n = 2; existing.some((s) => s.id === id); n++) id = `${base}-${n}`;
  return emptySheet(id, name);
}

export function parseDie(value: string): DieSides | undefined {
  const sides = Number(value.replace(/^d/i, ''));
  return isDieSides(sides) ? sides : undefined;
}

/** Blank, "+0" and nonsense all mean no modifier. */
export function parseMod(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed.replace(/^\+/, ''));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
}

export const ALL_ATTRIBUTES = ATTRIBUTES;
export const ALL_SKILLS = BASE_SKILLS;
