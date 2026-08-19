/**
 * What a character's edges, hindrances and special abilities actually *do* —
 * and, far more often, what they do not.
 *
 * ## Why this is a note and not an engine
 *
 * Read against the real material (MECHANICS-INVENTORY.md), of the party's 24
 * edges exactly **2½ are a plain "+N to a named skill"**. The rest scope
 * themselves to a purpose the app cannot see — *"Notice rolls made to spot
 * clues"*, *"Stealth rolls made in the wild"*, *"Spirit rolls made to resist
 * Fear"* — or grant a reroll, which a player performs by rerolling.
 *
 * So the test this module applies is not "can we compute it?" but:
 *
 *   > **Does the app commit an answer the player cannot adjust?**
 *
 * If the player can dial a modifier or roll again, the app does not need the
 * rule. It needs to *remind* them, and that is what this produces: a mark
 * against the affected trait, with the wording in the tooltip, which the player
 * reads and applies with the modifier dial that already exists.
 *
 * Nothing here changes a roll. That is the point — it is presentation, and it
 * cost no roll-path machinery at all.
 *
 * ## The three classes
 *
 * - `note` — has a number and a trait to hang it on. Marked with an asterisk on
 *   that trait's row.
 * - `wired` — the app already does this one, so nobody should dial it in a
 *   second time. Level Headed and Quick are the whole list.
 * - `text` — no mechanical effect the app can name. Shown as it always was,
 *   but *visibly* inert, which is what stops the guessing: today a sheet showing
 *   Trademark Weapon and a sheet showing Level Headed look identical and only
 *   one of them does anything.
 */
import { ATTRIBUTES, type NamedEntry, type Sheet } from './sheet.js';
import { formatMod } from './modifiers.js';

export type AbilityClass = 'wired' | 'note' | 'text';

export interface AbilityEffect {
  /** Which trait row this hangs on: a skill name, an attribute, or a derived stat. */
  trait: string;
  /** The number to dial, when the wording gives one. */
  value?: number;
  /** When it applies — the words from the card, kept verbatim. */
  when?: string;
}

export interface AbilityNote {
  entry: NamedEntry;
  /** `edge`, `hindrance`, or `ability` for a stat block's Special Abilities. */
  kind: 'edge' | 'hindrance' | 'ability';
  klass: AbilityClass;
  effects: AbilityEffect[];
  /** Why it is classed the way it is, for the tooltip. */
  note: string;
}

/**
 * The effects the app performs itself.
 *
 * Deliberately tiny, and it should stay that way. Each of these exists because
 * the app *draws the cards* — a player cannot redraw their own initiative — so
 * there was no way to leave it to them.
 *
 * `initiative.ts` is the implementation; this list only has to agree with it
 * about the names, so that a wired edge is not also marked for hand-application.
 */
const WIRED = /^(quick|level[\s-]?headed|improved level[\s-]?headed|hesitant)\b/i;

/**
 * Traits a name might be talking about, longest first so "Com. Knowledge" wins
 * over "Knowledge".
 *
 * Only used to decide which row an asterisk hangs on. Getting it wrong shows a
 * note in a slightly odd place; it never changes a number, which is the whole
 * reason a heuristic is acceptable here.
 */
const DERIVED = ['Parry', 'Toughness', 'Pace', 'Charisma'];

/**
 * Rows that are not traits but are still somewhere to hang a note.
 *
 * Damage earns its place: Father Jed's Champion is *"+2 to damage rolls versus
 * supernaturally evil creatures"* and Coffin Rock's Weakness (Head) is *"+2
 * damage"*. Both have a number and both had nowhere to go, so they were classed
 * inert — which is exactly the wrong answer for the one PC edge that changes a
 * fight.
 *
 * Unlike `DERIVED` these are *not* already in a printed number: a weapon's `2d6`
 * does not include Champion.
 */
const EXTRA = ['Damage'];

function traitsIn(sheet: Sheet, text: string): string[] {
  const names = [
    ...Object.keys(sheet.skills),
    ...ATTRIBUTES.map((a) => a[0]!.toUpperCase() + a.slice(1)),
    ...DERIVED,
    ...EXTRA,
  ].sort((a, b) => b.length - a.length);
  const found: string[] = [];
  for (const name of names) {
    // Word-bounded, so "Notice" does not match inside another word, and skipped
    // once a longer name has already claimed this stretch of the sentence.
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(text) && !found.some((f) => f.toLowerCase().includes(name.toLowerCase()))) {
      found.push(name);
    }
  }
  return found;
}

/**
 * The number an entry's text offers, if it offers one plainly.
 *
 * `+2 to Healing rolls` and `subtracts 1 from Pace` both count. Anything more
 * involved is left alone: a wrong number in a tooltip is worse than no number,
 * because the tooltip is the thing the player is going to trust.
 */
function valueIn(text: string): number | undefined {
  const explicit = /(?:^|[\s(])([+−–—-]\s?\d+)\b/.exec(text);
  if (explicit) return Number(explicit[1]!.replace(/[−–—]/g, '-').replace(/\s+/g, ''));
  const worded = /\b(?:add|adds|gain|gains|grant|grants|granting)\s+(\d+)\b/i.exec(text);
  if (worded) return Number(worded[1]);
  const negative = /\b(?:subtract|subtracts|suffers?)\s+(\d+)\b/i.exec(text);
  if (negative) return -Number(negative[1]);
  return undefined;
}

/** Wording that says the player rerolls, which is a reminder and never a number. */
const REROLL = /\brerolls?\b|\bre-rolls?\b|\breroll\b/i;

/**
 * Classify one entry.
 *
 * An entry with no text at all is `text`: a stat block that names an edge
 * without restating it — which is every edge in Coffin Rock — genuinely gives
 * the app nothing to work with, and saying so is more useful than guessing at
 * the rule from the name.
 */
export function classify(sheet: Sheet, entry: NamedEntry, kind: AbilityNote['kind']): AbilityNote {
  if (WIRED.test(entry.name)) {
    return {
      entry,
      kind,
      klass: 'wired',
      effects: [],
      note: 'Applied automatically when initiative is dealt — do not add it by hand.',
    };
  }

  const text = entry.text ?? '';
  if (!text.trim()) {
    return {
      entry,
      kind,
      klass: 'text',
      effects: [],
      note: 'Named without its rules text, so the app has nothing to show. Look it up.',
    };
  }

  if (REROLL.test(text)) {
    return {
      entry,
      kind,
      klass: 'note',
      effects: traitsIn(sheet, text).map((trait) => ({ trait, when: text })),
      note: 'Grants a reroll — roll again yourself when it applies.',
    };
  }

  // A number and a trait only belong together if they were written together.
  //
  // Coffin Rock's Construct is the case that forces this: *"+2 to recover from
  // being Shaken. Arrows, Bolts, firearms and Piercing attacks do half damage."*
  // Read whole, that pairs the +2 with "damage" and offers the Marshal a bonus
  // nobody wrote. Clause by clause it offers nothing, which is right — Construct
  // is precisely what the damage adjustment is for.
  const effects: AbilityEffect[] = [];
  for (const clause of text.split(/(?<=[.;])\s+/)) {
    const clauseValue = valueIn(clause);
    if (clauseValue === undefined) continue;
    for (const trait of traitsIn(sheet, clause)) {
      if (!effects.some((e) => e.trait === trait)) {
        effects.push({ trait, value: clauseValue, when: clause.trim() });
      }
    }
  }

  if (!effects.length) {
    return {
      entry,
      kind,
      klass: 'text',
      effects: [],
      note: 'No number the app can name — read it and judge it.',
    };
  }

  const derived = effects.map((e) => e.trait).filter((t) => DERIVED.includes(t));
  return {
    entry,
    kind,
    klass: 'note',
    effects,
    note: derived.length
      ? // Rule 2 of the plan, and the reason it is a rule: Sir Ed's card already
        // reads `Agility d6-1` — Elderly applied at authoring time — so anything
        // that "wired up" a derived-stat effect would count it twice.
        `Already included in the printed ${derived.join(' and ')} — do not apply it again.`
      : `Add ${effects.map((e) => formatMod(e.value ?? 0)).join('/')} yourself when it applies.`,
  };
}

/** Every entry on a sheet, classified. */
export function abilityNotes(sheet: Sheet): AbilityNote[] {
  return [
    ...sheet.edges.map((e) => classify(sheet, e, 'edge')),
    ...sheet.hindrances.map((h) => classify(sheet, h, 'hindrance')),
    ...(sheet.powers ?? []).map((p) => classify(sheet, p, 'ability')),
  ];
}

/**
 * The notes hanging on one trait row, so the sheet can put an asterisk there.
 *
 * Derived-stat notes are excluded: they are already in the printed number, and
 * an asterisk offering a bonus the sheet has already taken is worse than none.
 */
export function notesForTrait(notes: readonly AbilityNote[], trait: string): AbilityNote[] {
  return notes.filter(
    (note) =>
      note.klass === 'note' &&
      !note.note.startsWith('Already included') &&
      note.effects.some((e) => e.trait.toLowerCase() === trait.toLowerCase()),
  );
}

/** "Woodsman +2 — Stealth rolls made in the wild". One line per note. */
export function describeNote(note: AbilityNote, trait: string): string {
  const effect = note.effects.find((e) => e.trait.toLowerCase() === trait.toLowerCase());
  const value = effect?.value === undefined ? '' : ` ${formatMod(effect.value)}`;
  return `${note.entry.name}${value} — ${effect?.when ?? note.note}`;
}
