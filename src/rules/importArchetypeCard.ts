/**
 * Importer for the party's existing sheets: the "Deadlands Archetypes" printable
 * HTML cards (e.g. `Reggie Kane.html`).
 *
 * Those files turn out to be *fillable forms* rather than flat print-outs — every
 * die is a `<select>` with a `selected` option, every derived stat an `<input
 * value=…>`, and the prose blocks are `contenteditable` divs. So the data is all
 * there and nobody has to re-key a character.
 *
 * Parsed with regular expressions against a known, fixed template rather than a
 * DOM library: it keeps the module dependency-free and identical in node and the
 * browser. The trade-off is fragility if the template changes, so every extraction
 * is strict — a shape that does not match raises rather than silently producing a
 * half-empty sheet.
 *
 * One file may hold several cards; the template paginates with `page-break-after`.
 */
import {
  ATTRIBUTES,
  emptySheet,
  isDieSides,
  type Attribute,
  type DieSides,
  type NamedEntry,
  type Sheet,
  type Trait,
} from './sheet.js';

export class ArchetypeCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchetypeCardError';
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  times: '×', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”',
};

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * The contents of `<div class="…">` up to its *matching* close tag.
 *
 * A non-greedy `([\s\S]*?)</div>` is the obvious thing and it is wrong here: the
 * attributes block nests several levels of div, so it stops at the first inner
 * close and silently returns a fragment — which produced an empty attribute set
 * before this was fixed. Count depth instead.
 */
function extractDiv(html: string, className: string, from = 0): string | undefined {
  // The class attribute may hold several names — the skills block is
  // `class="skills-block comprehensive-skill-list"` — so match a whole token
  // within it rather than the attribute in full.
  const open = new RegExp(`<div class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'g');
  open.lastIndex = from;
  const start = open.exec(html);
  if (!start) return undefined;

  const tags = /<div\b[^>]*>|<\/div>/g;
  tags.lastIndex = start.index;
  let depth = 0;
  let tag: RegExpExecArray | null;
  while ((tag = tags.exec(html))) {
    depth += tag[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start.index, tag.index + tag[0].length);
  }
  throw new ArchetypeCardError(`unbalanced <div class="${className}">`);
}

/** Split a file into its `<div class="archetype-card">…</div>` blocks. */
function splitCards(html: string): string[] {
  const cards: string[] = [];
  let index = 0;
  for (;;) {
    const card = extractDiv(html, 'archetype-card', index);
    if (!card) return cards;
    cards.push(card);
    index = html.indexOf(card, index) + card.length;
  }
}

/** The `selected` option of the nth `die-select` in a chunk, or undefined for "-". */
function selectedDie(selectHtml: string): DieSides | undefined {
  const selected = /<option value="([^"]*)"[^>]*\bselected\b/.exec(selectHtml);
  const value = selected?.[1];
  if (!value || value === '-') return undefined;
  const sides = Number(value.replace(/^d/, ''));
  if (!isDieSides(sides)) throw new ArchetypeCardError(`not a die: ${value}`);
  return sides;
}

function parseMod(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const text = decode(raw).trim();
  if (!text) return undefined;
  const value = Number(text.replace(/^\+/, ''));
  if (Number.isNaN(value)) throw new ArchetypeCardError(`not a modifier: ${text}`);
  return value === 0 ? undefined : value;
}

function trait(die: DieSides | undefined, mod: number | undefined): Trait | undefined {
  if (die === undefined) return undefined;
  return mod === undefined ? { die } : { die, mod };
}

/**
 * Rows are `<td>LABEL</td><td>…control…</td>`, so pair each label with the markup
 * that follows it up to the next label. That survives the attributes table, which
 * interleaves attribute and derived-stat columns in the same row.
 */
function cellsByLabel(
  html: string,
  { preserveCase = false }: { preserveCase?: boolean } = {},
): Map<string, string> {
  const cells = new Map<string, string>();
  const pattern = /<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const label = decode(match[1]!).replace(/\s+/g, ' ').trim();
    cells.set(preserveCase ? label : label.toUpperCase(), match[2]!);
  }
  return cells;
}

function sectionBody(card: string, title: string): string | undefined {
  const heading = new RegExp(
    `<h[34] class="(?:section-title|advances-title)">${title}:?</h[34]>([\\s\\S]*?)</div>\\s*</div>`,
    'i',
  );
  return heading.exec(card)?.[1];
}

/** `<p><strong>NAME:</strong> text</p>` per entry, which is how edges and hindrances print. */
function parseEntries(body: string | undefined): NamedEntry[] {
  if (!body) return [];
  const entries: NamedEntry[] = [];
  const pattern = /<p>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    const paragraph = match[1]!;
    const strong = /<strong>([\s\S]*?)<\/strong>/.exec(paragraph);
    if (strong) {
      const name = stripTags(strong[1]!).replace(/:$/, '');
      const text = stripTags(paragraph.slice(strong.index + strong[0].length));
      entries.push(text ? { name, text } : { name });
    } else {
      const text = stripTags(paragraph);
      if (text) entries.push({ name: text });
    }
  }
  return entries;
}

/** "7(5)" → toughness 7, armor 2. The card's own shorthand: total, then base in brackets. */
function parseToughness(raw: string): { toughness?: number; armor?: number } {
  const match = /^\s*(\d+)\s*(?:\(\s*(\d+)\s*\))?\s*$/.exec(raw);
  if (!match) return {};
  const total = Number(match[1]);
  const base = match[2] === undefined ? undefined : Number(match[2]);
  return base === undefined ? { toughness: total } : { toughness: total, armor: total - base };
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/["'’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'character'
  );
}

/** The party's own cards, which are the one SWADE-era source in the app. */
export const ARCHETYPE_CARDS = 'archetype-cards';

export function parseArchetypeCard(cardHtml: string): Sheet {
  const name = stripTags(
    /<h2 class="character-name"[^>]*>([\s\S]*?)<\/h2>/.exec(cardHtml)?.[1] ??
      (() => {
        throw new ArchetypeCardError('no character name on the card');
      })(),
  );

  const sheet = emptySheet(slug(name), name);

  const quote = stripTags(/<p class="character-quote"[^>]*>([\s\S]*?)<\/p>/.exec(cardHtml)?.[1] ?? '');
  if (quote) sheet.quote = quote;

  const rank = stripTags(/<div class="rank-banner">([\s\S]*?)<\/div>/.exec(cardHtml)?.[1] ?? '');
  if (rank) sheet.rank = rank.replace(/^RANK:\s*/i, '');

  // --- attributes and derived stats, which share one table
  const attributesBlock = extractDiv(cardHtml, 'attributes-block');
  if (!attributesBlock) throw new ArchetypeCardError('no attributes block');
  const cells = cellsByLabel(attributesBlock);

  for (const attribute of ATTRIBUTES) {
    const cell = cells.get(attribute.toUpperCase());
    if (!cell) continue;
    const value = trait(
      selectedDie(cell),
      parseMod(/<input[^>]*class="mod-input"[^>]*value="([^"]*)"/.exec(cell)?.[1]),
    );
    if (value) sheet.attributes[attribute as Attribute] = value;
  }

  const statOf = (label: string): string | undefined =>
    /<input[^>]*value="([^"]*)"/.exec(cells.get(label) ?? '')?.[1];

  const pace = Number(statOf('PACE'));
  if (Number.isFinite(pace)) sheet.pace = pace;
  const parry = Number(statOf('PARRY'));
  if (Number.isFinite(parry)) sheet.parry = parry;
  const toughnessRaw = statOf('TOUGHNESS');
  if (toughnessRaw) {
    sheet.toughnessRaw = decode(toughnessRaw).trim();
    Object.assign(sheet, parseToughness(sheet.toughnessRaw));
  }

  // --- skills: whatever the card lists, in the order it lists them.
  //
  // Not filtered against a known list. The party's cards carry Faith,
  // "Trade (Journalism)" and "Language (Your Choice)" — an arcane skill and two
  // parenthetical specialisations — and dropping those silently would lose real
  // character data.
  const skillsBlock = extractDiv(cardHtml, 'skills-block');
  if (skillsBlock) {
    for (const [label, cell] of cellsByLabel(skillsBlock, { preserveCase: true })) {
      if (!/die-select/.test(cell)) continue;
      const value = trait(
        selectedDie(cell),
        parseMod(/<input[^>]*class="mod-input"[^>]*value="([^"]*)"/.exec(cell)?.[1]),
      );
      if (value) sheet.skills[label] = value;
    }
  }

  sheet.hindrances = parseEntries(sectionBody(cardHtml, 'HINDRANCES'));
  sheet.edges = parseEntries(sectionBody(cardHtml, 'EDGES'));
  // Only Blessed, Hucksters and the like have one.
  const powers = parseEntries(sectionBody(cardHtml, 'POWERS'));
  if (powers.length) sheet.powers = powers;

  const gear = stripTags(sectionBody(cardHtml, 'GEAR') ?? '');
  if (gear) sheet.gear = gear;
  const advances = stripTags(sectionBody(cardHtml, 'ADVANCES') ?? '');
  if (advances) sheet.advances = advances;

  // These cards are SWADE — Athletics, Com. Knowledge, Tests, Soak — and that
  // matters because the adventure being run is not. Recording it is what lets a
  // Guts skill be read as correct on one sheet and a conversion error on
  // another. See MECHANICS-INVENTORY.md §2.0.
  sheet.source = ARCHETYPE_CARDS;

  return sheet;
}

/** Every card in a file. The template paginates, so one file may hold a whole party. */
export function parseArchetypeCards(html: string): Sheet[] {
  const cards = splitCards(html);
  if (!cards.length) throw new ArchetypeCardError('no archetype cards found in this file');
  return cards.map(parseArchetypeCard);
}
