/**
 * Reading a Savage Worlds stat block.
 *
 * The player extract has no bestiary — the three creatures in it are summoned
 * allies, not mooks — so there is nothing to ship as a preset list. What there
 * *is* is a format:
 *
 *     BODYGUARD
 *     Attributes: Agility d8, Smarts d4, Spirit d6, Strength d6, Vigor d6
 *     Skills: Athletics d6, Fighting d6, Intimidation d6, Notice d4
 *     Pace: 6; Parry: 5; Toughness: 7 (2)
 *     Edges: First Strike
 *     Gear: Melee attack (Str+d6).
 *     Special Abilities:
 *       Armor +2: Hardened skin.
 *
 * Every NPC in every Savage Worlds book is written this way, so parsing it turns
 * "add a mook" into pasting one in. That is worth more than any list I could
 * ship, and it does not require inventing stats the book does not give.
 *
 * Derived stats are computed when a block omits them, using the formulas on
 * p11: Parry is 2 plus half the Fighting die (2 with no Fighting), and Toughness
 * is 2 plus half Vigor, plus armour. Both are checked against the three real
 * blocks in the extract.
 */
import { emptySheet, isDieSides, type DieSides, type Sheet, type Trait } from './sheet.js';

const ATTRIBUTE_NAMES: Record<string, keyof Sheet['attributes']> = {
  agility: 'agility',
  smarts: 'smarts',
  spirit: 'spirit',
  strength: 'strength',
  vigor: 'vigor',
  vigour: 'vigor',
};

/** `d8`, `d12+2`, `d6-1`. */
const TRAIT = /^(.*?)\s+d(\d+)\s*([+-]\s*\d+)?$/;

function parseTrait(text: string): { name: string; trait: Trait } | undefined {
  const match = TRAIT.exec(text.trim());
  if (!match) return undefined;
  const die = Number(match[2]);
  if (!isDieSides(die)) return undefined;
  const mod = match[3] ? Number(match[3].replace(/\s+/g, '')) : 0;
  const name = match[1]!.trim();
  if (!name) return undefined;
  return { name, trait: mod ? { die, mod } : { die } };
}

/** Split on commas that are not inside brackets. */
function splitList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else current += char;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

export function halfDie(die: DieSides): number {
  return die / 2;
}

/** p11: 2 plus half the Fighting die type, or 2 with no Fighting. */
export function derivedParry(sheet: Sheet): number {
  const fighting = sheet.skills['Fighting'];
  return 2 + (fighting ? halfDie(fighting.die) : 0);
}

/** p11: 2 plus half Vigor, plus armour. Size shifts it too, when a block says so. */
export function derivedToughness(sheet: Sheet, size = 0): number {
  const vigor = sheet.attributes.vigor;
  return 2 + (vigor ? halfDie(vigor.die) : 0) + (sheet.armor ?? 0) + size;
}

export class StatBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatBlockError';
  }
}

/**
 * Parse one stat block.
 *
 * Anything the block does not say is left absent rather than guessed, except
 * Parry and Toughness, which are computed from the formulas when missing —
 * those two are needed for the panel to be any use and are not a matter of
 * opinion.
 */
export function parseStatBlock(text: string, fallbackName = 'New Extra'): Sheet {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) throw new StatBlockError('nothing to read');

  const labelled = (label: string): string | undefined => {
    const found = lines.find((line) => new RegExp(`^${label}\\s*:`, 'i').test(line));
    return found?.slice(found.indexOf(':') + 1).trim();
  };

  // A name is the first line that is not a labelled field.
  const first = lines[0]!;
  const name = /^[a-z ]+:/i.test(first) ? fallbackName : first.replace(/[.:]$/, '').trim();

  const sheet = emptySheet(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'extra',
    name,
  );
  // A stat block describes an Extra unless it says otherwise; Wild Cards are
  // marked as such in the books.
  sheet.wildCard = /wild card/i.test(text);

  for (const part of splitList(labelled('Attributes') ?? '')) {
    const parsed = parseTrait(part);
    const key = parsed && ATTRIBUTE_NAMES[parsed.name.toLowerCase()];
    if (parsed && key) sheet.attributes[key] = parsed.trait;
  }

  for (const part of splitList(labelled('Skills') ?? '')) {
    const parsed = parseTrait(part);
    if (parsed) sheet.skills[parsed.name] = parsed.trait;
  }

  for (const [label, list] of [
    ['Edges', sheet.edges],
    ['Hindrances', sheet.hindrances],
  ] as const) {
    for (const entry of splitList(labelled(label) ?? '')) {
      list.push({ name: entry.replace(/\.$/, '').trim() });
    }
  }

  const gear = labelled('Gear');
  if (gear) sheet.gear = gear;

  // Special Abilities run to the end of the block, one per line.
  const abilitiesAt = lines.findIndex((line) => /^special abilities\s*:/i.test(line));
  if (abilitiesAt >= 0) {
    const powers = lines
      .slice(abilitiesAt + 1)
      .filter((line) => !/^[a-z ]+:/i.test(line) || line.includes(':'))
      .map((line) => {
        const colon = line.indexOf(':');
        return colon > 0
          ? { name: line.slice(0, colon).trim(), text: line.slice(colon + 1).trim() }
          : { name: line.replace(/\.$/, '') };
      })
      .filter((entry) => entry.name);
    if (powers.length) sheet.powers = powers;
  }

  // "Pace: 6; Parry: 5; Toughness: 7 (2)" — one line, semicolon separated.
  const derived = lines.find((line) => /pace\s*:/i.test(line)) ?? '';
  const pace = /pace\s*:\s*(\d+)/i.exec(derived);
  if (pace) sheet.pace = Number(pace[1]);
  const parry = /parry\s*:\s*(\d+)/i.exec(derived);
  const toughness = /toughness\s*:\s*(\d+)\s*(?:\((\d+)\))?/i.exec(derived);

  if (toughness) {
    sheet.toughness = Number(toughness[1]);
    if (toughness[2]) {
      sheet.armor = Number(toughness[2]);
      sheet.toughnessRaw = `${toughness[1]}(${toughness[2]})`;
    }
  }
  // Armour may instead be declared as a Special Ability: "Armor +2: …".
  const armour = /armor\s*\+(\d+)/i.exec(text);
  if (armour && sheet.armor === undefined) sheet.armor = Number(armour[1]);

  sheet.parry = parry ? Number(parry[1]) : derivedParry(sheet);
  if (sheet.toughness === undefined) sheet.toughness = derivedToughness(sheet);

  if (!Object.keys(sheet.attributes).length && !Object.keys(sheet.skills).length) {
    throw new StatBlockError('no attributes or skills found — is this a stat block?');
  }
  return sheet;
}

/** Split a pasted page into blocks, so a whole gang imports at once. */
export function parseStatBlocks(text: string): Sheet[] {
  // A new block starts at a line followed by an Attributes line.
  const lines = text.split(/\r?\n/);
  const starts: number[] = [];
  lines.forEach((line, i) => {
    if (/^\s*attributes\s*:/i.test(line) && i > 0) starts.push(i - 1);
  });
  if (starts.length <= 1) return [parseStatBlock(text)];

  return starts.map((start, i) =>
    parseStatBlock(lines.slice(start, starts[i + 1] ?? lines.length).join('\n')),
  );
}
