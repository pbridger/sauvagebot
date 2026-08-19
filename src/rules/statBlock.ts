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

/**
 * `d8`, `d12+2`, `d6-1` — and `d6 (A)`, which is how every bestiary in Savage
 * Worlds marks animal intelligence.
 *
 * The `(A)` was the expensive one. This pattern is end-anchored, so `Smarts d6
 * (A)` matched nothing at all and the attribute was dropped — **110 of the 219
 * creatures we ship**, half the bestiary, imported with no Smarts. It is not a
 * cosmetic loss either: a missing attribute is a missing trait roll, and Vigor's
 * absence would silently change `derivedToughness`.
 *
 * The marker is consumed rather than stored. Animal intelligence changes what a
 * creature can be *asked* to do, not what its Smarts die rolls, and there is
 * nowhere on `Sheet` that would make it mean anything yet.
 */
const TRAIT = /^(.*?)\s+d(\d+)\s*([+-]\s*\d+)?\s*(?:\(\s*A\s*\))?$/i;

function parseTrait(text: string): { name: string; trait: Trait } | undefined {
  const match = TRAIT.exec(text.trim());
  if (!match) return undefined;
  const die = Number(match[2]);
  if (!isDieSides(die)) return undefined;
  const mod = match[3] ? Number(match[3].replace(/\s+/g, '')) : 0;
  const name = match[1]!.trim();
  if (!name) return undefined;
  // A name cannot contain a die. Without this guard the pattern is happy to read
  // `Smarts d4 Spirit d4 Strength d6` as one trait called "Smarts d4 Spirit d4
  // Strength" — which is how three of Crawlin' Dead's attributes disappeared even
  // after the wrapped line was rejoined. Failing here is what hands the part to
  // `parseTraits` to be split properly.
  if (/\bd\d+/i.test(name)) return undefined;
  return { name, trait: mod ? { die, mod } : { die } };
}

/**
 * The traits in one comma-separated part.
 *
 * Normally one — `Fighting d8` — but real books drop commas, and a stat block
 * transcribed from a PDF drops more of them: Coffin Rock prints
 * `Attributes: Agility d6, Smarts d4 Spirit d4 Strength d6, Vigor d6`, where
 * three attributes share a part. Reading only the last one lost Smarts and
 * Spirit without a word.
 *
 * So a part is cut before each `Name dN` that follows a completed one. The names
 * themselves may hold spaces and brackets — `Knowledge (Occult) d8`, `Com.
 * Knowledge d6` — which is why this splits on the *die* and keeps whatever came
 * before it, rather than trying to recognise a name.
 */
function parseTraits(part: string): { name: string; trait: Trait }[] {
  const single = parseTrait(part);
  if (single) return [single];
  // Strip the animal marker before splitting, or `Smarts d4(A) Spirit d4` would
  // cut after the die and leave "(A) Spirit" as the next trait's name.
  const pieces: string[] = [];
  let current = '';
  for (const word of part.replace(/\(\s*A\s*\)/gi, ' ').trim().split(/\s+/)) {
    current = current ? `${current} ${word}` : word;
    // A die ends a trait unless a modifier or an `(A)` is still to come.
    if (/d\d+(?:\s*[+-]\s*\d+)?$/i.test(current)) {
      pieces.push(current);
      current = '';
    }
  }
  if (current.trim()) pieces.push(current);
  const traits = pieces.map(parseTrait).filter((t): t is { name: string; trait: Trait } => !!t);
  // All or nothing: a part that only half-parses is more likely to be prose than
  // a run-on trait list, and half a stat line is worse than none.
  return traits.length === pieces.length ? traits : [];
}

/**
 * Split on commas — and semicolons — that are not inside brackets.
 *
 * The semicolon is not pedantry: the bestiary's Rabbit is written
 * `Skills: Fighting d6, Notice d10; Stealth d6`, and on commas alone that read
 * as one trait named "Notice d10; Stealth". Both skills were wrong, and only one
 * of them was visibly so.
 */
function splitList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if ((char === ',' || char === ';') && depth === 0) {
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

/**
 * The labelled fields a stat block uses, for deciding where a wrapped line ends.
 *
 * `Special Abilities` is here as a terminator even though it is not read by
 * `labelled()`: a block that ends `Gear: Club (d6+d4)` followed by
 * `Special Abilities` must not swallow the header into the gear line.
 */
const LABELS =
  /^(attributes|skills|edges|hindrances|gear|powers|charisma|pace|parry|toughness|quote|quotes|special abilities|description)\b/i;

/**
 * Put wrapped continuation lines back on the line they belong to.
 *
 * A stat block in a book is typeset in a narrow column, so every field of any
 * length wraps — and `labelled()` reads one line, so it was silently truncating
 * them. Coffin Rock prints
 *
 *     Edges: Charismatic, Command, Snakeoil
 *     Salesman, Very Attractive
 *
 * and Belle imported with three edges, the third of them called "Snakeoil".
 *
 * A line continues the one before it when it does not start a new labelled
 * field, does not start a bulleted ability, and there is a labelled field open
 * to continue. That last condition is what keeps a creature's prose description
 * from being glued onto its Gear line.
 */
export function joinWrapped(lines: readonly string[]): string[] {
  const out: string[] = [];
  let open = false;
  let inAbilities = false;
  for (const line of lines) {
    const starts = LABELS.test(line);
    const bullet = /^[*•·]\s/.test(line);
    if (!starts && !bullet && open && out.length) {
      out[out.length - 1] = `${out[out.length - 1]} ${line}`;
      continue;
    }
    out.push(line);
    if (/^special abilities/i.test(line)) {
      // The header itself takes no continuation — the next line is the first
      // ability, not more header.
      inAbilities = true;
      open = false;
    } else if (bullet) {
      // Inside the list, a bullet opens an ability and the unbulleted lines
      // after it are that ability's wrapped text.
      open = true;
    } else {
      // Outside it, only a labelled field wraps. Anything else — a creature's
      // prose description, a page number — must not glue onto the Gear line.
      open = starts && !inAbilities;
    }
  }
  return out;
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
  const lines = joinWrapped(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
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
    for (const parsed of parseTraits(part)) {
      const key = ATTRIBUTE_NAMES[parsed.name.toLowerCase()];
      if (key) sheet.attributes[key] = parsed.trait;
    }
  }

  for (const part of splitList(labelled('Skills') ?? '')) {
    for (const parsed of parseTraits(part)) sheet.skills[parsed.name] = parsed.trait;
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
  //
  // The colon is optional, and that is not a nicety: Coffin Rock writes the
  // header bare on most of its blocks, so requiring one meant every special
  // ability in the adventure was dropped in silence. Crawlin' Dead arrived with
  // no Claws, no Fear, no Fearless and no Undead.
  const abilitiesAt = lines.findIndex((line) => /^special abilities\s*:?\s*$|^special abilities\s*:/i.test(line));
  if (abilitiesAt >= 0) {
    const powers = lines
      .slice(abilitiesAt + 1)
      .filter((line) => !/^[a-z ]+:/i.test(line) || line.includes(':'))
      .map((line) => {
        // Books bullet these, and the bullet is not part of the name: without
        // this an ability was called "* Armor +1", which reads wrong on the
        // sheet and would defeat any later attempt to recognise it by name.
        const entry = line.replace(/^[*•·]\s*/, '');
        const colon = entry.indexOf(':');
        return colon > 0
          ? { name: entry.slice(0, colon).trim(), text: entry.slice(colon + 1).trim() }
          : { name: entry.replace(/\.$/, '') };
      })
      .filter((entry) => entry.name);
    if (powers.length) sheet.powers = powers;
  }

  // A `Powers:` line is a different thing from Special Abilities — arcane
  // powers, with a Power Point figure after them:
  //
  //   Powers: Armor, bolt, dispel, fear, puppet, smite; 20 PP
  //
  // It was not read at all, so Reverend Cheval — the adventure's antagonist —
  // imported with none of his seven powers. Kept as the line it was written on
  // rather than parsed into entries: nothing downstream is built on the
  // individual powers yet, and the wording is what the Marshal reads.
  const powerLine = labelled('Powers');
  if (powerLine) sheet.powerNotes = powerLine;

  // Deadlands Reloaded gives every human block a Charisma. SWADE has no such
  // stat, so this is recorded and shown rather than used — see the edition note
  // in MECHANICS-INVENTORY.md §2.0.
  // A book prints a minus as an en dash — `Charisma: –6` — so all four of the
  // dashes it might use are normalised before the number is read.
  const charisma = /charisma\s*:\s*([+\-−–—]?\s*\d+)/i.exec(text);
  if (charisma) sheet.charisma = Number(charisma[1]!.replace(/[−–—]/g, '-').replace(/\s+/g, ''));

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
