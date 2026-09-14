/**
 * The equipment catalogue, extracted from the rulebook.
 *
 * Built by `scripts/extract-gear.py`; regenerate rather than editing the JSON.
 *
 * Deliberately smaller than the Edge catalogue and deliberately incomplete: the
 * extractor only keeps rows whose columns it can identify by shape, so a few
 * tables come through thin. Fewer correct weapon stats beat more invented ones,
 * and anything missing can still be typed by hand.
 */
import data from './gear-catalogue.json' with { type: 'json' };

export interface GearEntry {
  name: string;
  category: string;
  range?: string;
  damage?: string;
  ap?: string;
  rof?: string;
  shots?: string;
  minStr?: string;
  armor?: string;
  weight?: string;
  cost?: string;
  notes?: string;
  /** A second firing mode, as on the LeMat's underslung shotgun. */
  modes?: GearEntry[];
}

export const GEAR: GearEntry[] = data.items as GearEntry[];
export const GEAR_SOURCE = data.source;

/** Drop the calibre and any bracketed qualifier, then compare loosely. */
export function normaliseGearName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[’']/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const index = new Map<string, GearEntry>();
for (const item of GEAR) {
  const key = normaliseGearName(item.name);
  if (!index.has(key)) index.set(key, item);
}

/**
 * Find a weapon by the name a card uses.
 *
 * Cards write "Colt Rainmaker"; the book writes "Colt Rainmaker (.32)". They
 * also reverse compound names — "Bowie knife" against the book's "Knife, Bowie"
 * — so a comma-swapped form is tried too.
 */
export function findGear(name: string): GearEntry | undefined {
  const key = normaliseGearName(name);
  const direct = index.get(key);
  if (direct) return direct;

  const words = key.split(' ');
  for (let i = 1; i < words.length; i++) {
    const swapped = [...words.slice(i), ...words.slice(0, i)].join(' ');
    const found = index.get(swapped);
    if (found) return found;
  }
  return undefined;
}

/**
 * "Knife, Bowie" -> "Bowie Knife".
 *
 * The book files weapons by family so they sort together, but a gear line is
 * comma-separated: written as-is, that entry becomes two items — a Knife with no
 * stats and a Bowie carrying them. Reversing the pair keeps one item and reads
 * the way a character would say it.
 */
export function uncomma(name: string): string {
  const parts = name.split(',').map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return name;
  // Not a qualifier in brackets, and not something with its own comma sense.
  if (/^\(/.test(parts[1])) return name;
  return `${parts[1]} ${parts[0]}`;
}

export function suggestGear(query: string, limit = 10): GearEntry[] {
  const key = normaliseGearName(query);
  if (!key) return GEAR.slice(0, limit);
  const starts = GEAR.filter((g) => normaliseGearName(g.name).startsWith(key));
  const contains = GEAR.filter(
    (g) => !normaliseGearName(g.name).startsWith(key) && normaliseGearName(g.name).includes(key),
  );
  return [...starts, ...contains].slice(0, limit);
}

/**
 * The other ways a weapon on a sheet can be used — thrown, or the second barrel.
 *
 * Damian, from the first session: *"some weapons can be thrown or melee, and this
 * should mean they have two lines with a throw and a fighting button."* The book
 * agrees and files them twice, under Melee Weapons and again under Other Ranged
 * Weapons, because its tables are organised by how you attack rather than by what
 * is in your hand. The extractor now folds the second row into `modes`, and this
 * is what puts it in front of a player.
 *
 * **Display only.** Nothing is written to the sheet: the gear line still says
 * "tomahawk", and the thrown row is the catalogue answering a question about it.
 * Discrete items (§22) are what would make this a thing you own rather than a
 * thing we look up, and they are a different piece of work.
 *
 * Whichever form the sheet already carries is dropped, and the others are offered
 * — in both directions. See the note inside on the bestiary's thrown knives.
 */
export function weaponModes(weapon: { name: string; range?: string }): {
  name: string;
  range?: string;
  damage?: string;
  rof?: number;
  ap?: number;
  notes?: string;
}[] {
  const found = findGear(weapon.name);
  if (!found?.modes?.length) return [];

  // Which of the weapon's forms the sheet is already showing, matched on range —
  // the one field that differs between a swing and a throw. A weapon written with
  // no range is the melee form, which is how every character card writes it.
  const sheetHasMode = found.modes.some((mode) => mode.range === weapon.range);

  const rows = found.modes
    .filter((mode) => mode.range !== weapon.range)
    .map((mode) => asWeapon(weapon.name, mode.name, mode));

  /**
   * The melee form, when the sheet is carrying the thrown one.
   *
   * The filter above is one-directional on its own, and the direction it misses is
   * real: the bestiary writes `Knives (Range: 3/6/12, Damage Str+1d4)`, which is
   * the *thrown* row. `findGear` returns the melee primary, the thrown mode gets
   * dropped as a duplicate of what the sheet already has, and the character is
   * left with a Throw button and no way to swing the thing at all.
   *
   * Only for a melee primary — one with no range of its own. A sheet carrying the
   * LeMat's shotgun barrel and wanting the pistol back is not a case any card
   * produces, and offering it would mean inventing a name for "the ordinary way to
   * use this gun" that the book never writes down.
   */
  if (sheetHasMode && !found.range) {
    rows.push(asWeapon(weapon.name, 'Melee', found));
  }
  return rows;
}

/** One row of the weapons table, built from a catalogue entry. */
function asWeapon(
  weaponName: string,
  form: string,
  entry: GearEntry,
): { name: string; range?: string; damage?: string; rof?: number; ap?: number; notes?: string } {
  return {
    // "tomahawk (Thrown)" — the weapon it is, then what this row does with it.
    // The name is what the roll is logged under, so it has to say both.
    name: `${weaponName} (${form})`,
    ...(entry.range ? { range: entry.range } : {}),
    ...(entry.damage ? { damage: entry.damage } : {}),
    ...(entry.rof ? { rof: Number(entry.rof) } : {}),
    ...(entry.ap ? { ap: Number(entry.ap) } : {}),
    ...(entry.notes ? { notes: entry.notes } : {}),
  };
}

/** The gear line a card would print for this item. */
export function describeGear(item: GearEntry): string {
  const bits = stats(item);
  return bits.length ? `${item.name} (${bits.join(', ')})` : item.name;
}

function stats(item: GearEntry): string[] {
  const bits: string[] = [];
  if (item.range) bits.push(`Range ${item.range}`);
  if (item.damage) bits.push(`damage ${item.damage}`);
  if (item.rof) bits.push(`RoF ${item.rof}`);
  if (item.ap) bits.push(`AP ${item.ap}`);
  if (item.shots) bits.push(`Shots ${item.shots}`);
  if (item.armor) bits.push(`+${item.armor.replace(/^\+/, '')}`);
  return bits;
}

/**
 * The item written the way a character card writes gear, ready to be appended
 * to a sheet's gear line.
 *
 * The calibre is dropped from the name on purpose. The book writes "Colt
 * Peacemaker (.45)", and leaving that in would produce two bracketed groups in
 * a row — which our own gear parser reads as one malformed item, losing the
 * stats. Round-tripping through `parseGear` is tested for every weapon in the
 * catalogue.
 */
export function gearLine(item: GearEntry): string {
  const name = uncomma(item.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || item.name);
  const bits = stats(item);
  return bits.length ? `${name} (${bits.join(', ')})` : name;
}
