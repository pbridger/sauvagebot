/**
 * Gear parsing.
 *
 * The cards write gear as one comma-separated sentence:
 *
 *   Colt Rainmaker (Range 12/24/48, damage 2d6, RoF 1, AP 1), knife (Str+d4),
 *   spare Gatling drum, armored vest (+2; subtract 2 …), disguise kit, $135.
 *
 * That is readable on paper and useless at the table, where what you want is the
 * weapon's range and damage without reading a paragraph. This pulls the line
 * apart into weapons, armour, plain items and money.
 *
 * It is a *presentation* aid, and treated as one: anything it fails to recognise
 * falls through to a plain item with its text intact, so no gear is ever lost to
 * a parse it did not anticipate. The raw line stays on the sheet regardless.
 */

export interface Weapon {
  name: string;
  /** As written, e.g. "12/24/48". */
  range?: string;
  /** As written, e.g. "2d6" or "Str+d4" — a rollable expression either way. */
  damage?: string;
  rof?: number;
  ap?: number;
  /** Anything in the brackets that was not one of the recognised stats. */
  notes?: string;
}

export interface GearItem {
  name: string;
  detail?: string;
}

export interface Gear {
  weapons: Weapon[];
  armor: GearItem[];
  items: GearItem[];
  /** e.g. "$135". */
  money?: string;
}

/** Split on commas that are not inside brackets. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim().replace(/\.$/, '').trim()).filter(Boolean);
}

const DAMAGE = /\b(?:damage|dmg)\s+((?:\d+)?d\d+(?:[+-]\d+)?|str\s*\+\s*d\d+)/i;
/** A bare damage expression as the whole bracket, as in "knife (Str+d4)". */
const BARE_DAMAGE = /^((?:\d+)?d\d+(?:[+-]\d+)?|str\s*\+\s*d\d+)$/i;
const RANGE = /\brange\s+(\d+\/\d+\/\d+)/i;
const ROF = /\brof\s+(\d+)/i;
const AP = /\bap\s+(\d+)/i;

function tidyDamage(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/^str/i, 'Str');
}

function parseEntry(entry: string): { kind: 'weapon' | 'armor' | 'item' | 'money'; value: unknown } {
  if (/^\$[\d,]+$/.test(entry)) return { kind: 'money', value: entry };

  const bracket = /^(.*?)\s*\(([\s\S]*)\)\s*$/.exec(entry);
  if (!bracket) return { kind: 'item', value: { name: entry } };

  const name = bracket[1]!.trim();
  const detail = bracket[2]!.trim();

  // Armour is written as a *standalone* bonus: "armored vest (+2; subtract 2 …)".
  // The bonus must not be followed by a word, or "Agency badge (+1 Persuasion to
  // lawful types)" reads as armour — which it did, before this was tightened.
  if (/^\+\d+\s*(?:[;,.]|$)/.test(detail)) return { kind: 'armor', value: { name, detail } };

  const range = RANGE.exec(detail)?.[1];
  const damage = DAMAGE.exec(detail)?.[1] ?? (BARE_DAMAGE.test(detail) ? detail : undefined);
  if (!range && !damage) return { kind: 'item', value: { name, detail } };

  const weapon: Weapon = { name };
  if (range) weapon.range = range;
  if (damage) weapon.damage = tidyDamage(damage);
  const rof = ROF.exec(detail)?.[1];
  if (rof) weapon.rof = Number(rof);
  const ap = AP.exec(detail)?.[1];
  if (ap) weapon.ap = Number(ap);

  // Whatever is left once the recognised stats are removed — "must fire full RoF"
  // and the like, which matters at the table and must not be dropped.
  const notes = splitTopLevel(detail)
    .filter((part) => !RANGE.test(part) && !DAMAGE.test(part) && !ROF.test(part) && !AP.test(part))
    .filter((part) => !BARE_DAMAGE.test(part))
    .join(', ');
  if (notes) weapon.notes = notes;

  return { kind: 'weapon', value: weapon };
}

export function parseGear(text: string | undefined): Gear {
  const gear: Gear = { weapons: [], armor: [], items: [] };
  if (!text) return gear;

  for (const entry of splitTopLevel(text)) {
    const { kind, value } = parseEntry(entry);
    if (kind === 'weapon') gear.weapons.push(value as Weapon);
    else if (kind === 'armor') gear.armor.push(value as GearItem);
    else if (kind === 'money') gear.money = value as string;
    else gear.items.push(value as GearItem);
  }
  return gear;
}

/**
 * Turn a card's damage notation into something the dice engine can roll.
 *
 * Two things happen here:
 *
 * 1. SWADE writes melee damage as `Str+d4`, meaning the wielder's Strength die
 *    plus a d4 — so it cannot be rolled without knowing whose hand it is in.
 * 2. **Damage dice ace.** Every die in a damage roll explodes, so `2d6` on the
 *    card is `2d6!` to the engine. Rolling it unexploded silently caps damage
 *    and quietly removes the best thing about Savage Worlds combat.
 */
export function damageExpression(damage: string, strengthDie: number | undefined): string {
  const withStrength = !/^str\b/i.test(damage)
    ? damage
    : strengthDie === undefined
      ? damage.replace(/^str\s*\+\s*/i, '')
      : damage.replace(/^str/i, `d${strengthDie}`);
  return explodeDice(withStrength);
}

/** Mark every die group as open-ended, leaving any already marked alone. */
export function explodeDice(expression: string): string {
  return expression.replace(/(\d*d\d+)(!?)/gi, (_, dice: string) => `${dice}!`);
}

/**
 * Which skill swings this weapon.
 *
 * A weapon with a range is shot; anything else is swung. Crude, but it matches
 * how the cards are written, and the button says which skill it is rolling so a
 * wrong guess is visible rather than silent.
 */
export function weaponSkill(weapon: Weapon): 'Shooting' | 'Fighting' {
  if (weapon.range) return 'Shooting';
  if (weapon.damage && /^str/i.test(weapon.damage)) return 'Fighting';
  // No leading word boundary: "scattergun" and "handgun" are one word, and a
  // Deadlands gear list is full of them.
  return /(?:bow|rifle|pistol|gun|derringer|carbine|revolver|repeater)\b/i.test(weapon.name)
    ? 'Shooting'
    : 'Fighting';
}
