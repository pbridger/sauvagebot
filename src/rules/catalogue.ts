/**
 * The Edge and Hindrance catalogue, extracted from the rulebook.
 *
 * Built by `scripts/extract-catalogue.py` from the player extract; regenerate it
 * rather than editing the JSON. It exists so the extension can offer canonical
 * names and rules text instead of relying on whatever the character's card
 * happened to print — and so that mechanical hooks (Level Headed, Quick, Luck)
 * key off something stable.
 *
 * Names are matched loosely on purpose. A card writes `LEVEL-HEADED`, the book
 * `LEVEL HEADED`; a card writes `ARCANE BACKGROUND (BLESSED)`, the book
 * `ARCANE BACKGROUND`; a hindrance carries its severity in the name. All three
 * resolve to the same entry.
 */
import data from './catalogue.json' with { type: 'json' };

export interface CatalogueEntry {
  name: string;
  /** The full printed entry: flavour, then the mechanics, then the exceptions. */
  text: string;
  /**
   * The book's own one-line version, from its Edge and Hindrance summary tables.
   *
   * The designers' precis rather than anything synthesised here — it leads with
   * the mechanic and drops the colour, which is exactly what a character sheet
   * wants. 215 of the 280 entries have one; the rest are setting-specific Edges
   * documented only in their own chapters, and fall back to the full text.
   */
  summary?: string;
  /** Edges only. */
  requirements?: string;
  /** Hindrances only: Minor, Major, or "Minor or Major". */
  severity?: string;
}

export const EDGES: CatalogueEntry[] = data.edges;
export const HINDRANCES: CatalogueEntry[] = data.hindrances;
export const CATALOGUE_SOURCE = data.source;

/**
 * Reduce a name to something comparable: case, punctuation and the parenthetical
 * qualifiers the cards add all fall away.
 */
export function normaliseName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\((?:MINOR|MAJOR)(?:\/(?:MINOR|MAJOR))?\)/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * Names the book writes as alternatives — `HOLY/UNHOLY WARRIOR` — are one entry
 * covering two Edges, and a card names only the one the character took. Register
 * both forms so `HOLY WARRIOR` resolves.
 */
function aliases(name: string): string[] {
  const match = /^([A-Za-z']+)\/([A-Za-z']+)\s+(.+)$/.exec(name);
  const both = match
    ? [name, `${match[1]} ${match[3]}`, `${match[2]} ${match[3]}`]
    : [name];
  return both.flatMap((form) => [form, ...improvedForms(form)]);
}

/**
 * The book writes an upgraded Edge two ways and the shipped catalogue does both:
 * ten entries read `LEVEL HEADED (IMP)` and eight read `IMPROVED RAPID RECHARGE`.
 * A character card may use either, and until now whichever one it did not use
 * simply failed to resolve.
 *
 * That was not only a missing tooltip. `initiativeEdges` matched
 * `IMPROVED LEVEL HEADED` and the catalogue's name is `LEVEL HEADED (IMP)`, so
 * the Edge fell through to plain Level Headed and dealt two cards instead of
 * three — reported from the table, 2026-08-26.
 *
 * Registered as aliases rather than normalised into one spelling, so the entry
 * keeps whatever name the book gave it and both forms find it.
 */
export function improvedForms(name: string): string[] {
  const bracketed = /^(.*?)\s*\((?:IMP|IMPROVED)\.?\)\s*$/i.exec(name);
  if (bracketed) return [`Improved ${bracketed[1]}`];
  const prefixed = /^IMPROVED\s+(.+)$/i.exec(name);
  if (prefixed) return [`${prefixed[1]} (Imp)`];
  return [];
}

function index(entries: readonly CatalogueEntry[]): Map<string, CatalogueEntry> {
  const map = new Map<string, CatalogueEntry>();
  for (const entry of entries) {
    for (const alias of aliases(entry.name)) {
      const key = normaliseName(alias);
      if (!map.has(key)) map.set(key, entry);
    }
  }
  return map;
}

const edgeIndex = index(EDGES);
const hindranceIndex = index(HINDRANCES);

function lookup(map: Map<string, CatalogueEntry>, name: string): CatalogueEntry | undefined {
  const key = normaliseName(name);
  const exact = map.get(key);
  if (exact) return exact;

  // `ARCANE BACKGROUND (BLESSED)` and `TRADE (JOURNALISM)` name a variant of a
  // catalogue entry, so fall back to the part before the bracket.
  const base = normaliseName(name.replace(/\s*\([^)]*\)\s*$/, ''));
  return base && base !== key ? map.get(base) : undefined;
}

export function findEdge(name: string): CatalogueEntry | undefined {
  return lookup(edgeIndex, name);
}

export function findHindrance(name: string): CatalogueEntry | undefined {
  return lookup(hindranceIndex, name);
}

/** Either kind, for a sheet entry whose sort is not known up front. */
export function findEntry(name: string): CatalogueEntry | undefined {
  return findEdge(name) ?? findHindrance(name);
}

/** Names starting with, or containing, what has been typed — for autocomplete. */
export function suggest(
  query: string,
  kind: 'edges' | 'hindrances',
  limit = 8,
): CatalogueEntry[] {
  const entries = kind === 'edges' ? EDGES : HINDRANCES;
  const key = normaliseName(query);
  if (!key) return entries.slice(0, limit);
  const starts = entries.filter((e) => normaliseName(e.name).startsWith(key));
  const contains = entries.filter(
    (e) => !normaliseName(e.name).startsWith(key) && normaliseName(e.name).includes(key),
  );
  return [...starts, ...contains].slice(0, limit);
}
