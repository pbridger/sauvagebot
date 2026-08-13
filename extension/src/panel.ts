/**
 * The sheet panel.
 *
 * Deliberately thin: every decision worth testing lives in `src/rules` and
 * `src/obr`, which run in node. This file does DOM and OBR, and nothing else.
 *
 * Rolls go through the same conformance-verified engine the Discord bot uses, so
 * a Shooting roll in Owlbear and `~s8` in Discord cannot drift apart.
 */
import OBR from '@owlbear-rodeo/sdk';
import { ATTRIBUTES, SKILLS, type Attribute, type Sheet, type Skill } from '../../src/rules/sheet.js';
import { parseArchetypeCards } from '../../src/rules/importArchetypeCard.js';
import { damageExpression, parseGear } from '../../src/rules/gear.js';
import { CommandContext } from '../../src/dice/evaluator.js';
import { RollInterpreter } from '../../src/dice/interpreter.js';
import { JavaRandom } from '../../src/dice/javaRandom.js';
import { parse } from '../../src/dice/parser.js';
import { rollAttribute, rollSkill } from '../../src/rules/traitRoll.js';
import { Roster } from '../../src/obr/roster.js';
import { roomStore } from './backends.js';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const bar = { who: el<HTMLSelectElement>('who'), file: el<HTMLInputElement>('file') };
const sheetEl = el('sheet');
const logEl = el('log');
const noticeEl = el('notice');
const budgetEl = el('budget');

let roster: Roster;
let store = roomStore();
let sheets: Sheet[] = [];
let selectedId: string | undefined;

// ---------------------------------------------------------------- chrome

function notify(message: string | undefined): void {
  noticeEl.textContent = message ?? '';
  noticeEl.hidden = !message;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/**
 * The engine returns Discord markdown (`**8**`). Render the bold rather than
 * showing the asterisks, without putting engine output through innerHTML.
 */
function logRoll(label: string, explained: string): void {
  const line = document.createElement('div');
  const strong = document.createElement('span');
  strong.textContent = `${label} `;
  strong.style.fontWeight = '700';
  line.append(strong);

  for (const [i, part] of explained.split('**').entries()) {
    const span = document.createElement('span');
    span.textContent = part;
    if (i % 2 === 1) span.className = 'total';
    line.append(span);
  }
  logEl.prepend(line);
  while (logEl.childElementCount > 40) logEl.lastElementChild?.remove();
}

async function showBudget(): Promise<void> {
  const { used, capacity, fraction } = await store.usage();
  budgetEl.textContent = `roster storage ${used}/${capacity} chars (${Math.round(fraction * 100)}%)`;
  budgetEl.classList.toggle('warn', fraction > 0.8);
}

// ---------------------------------------------------------------- rendering

function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  return h;
}

function traitButton(label: string, dieText: string, untrained: boolean, roll: () => void): HTMLElement {
  const button = document.createElement('button');
  button.className = untrained ? 'trait untrained' : 'trait';
  const name = document.createElement('span');
  name.textContent = label;
  const die = document.createElement('span');
  die.className = 'die';
  die.textContent = dieText;
  button.append(name, die);
  button.addEventListener('click', roll);
  return button;
}

function dieLabel(die: number, mod?: number): string {
  if (!mod) return `d${die}`;
  return `d${die}${mod > 0 ? '+' : ''}${mod}`;
}

function entryList(entries: Sheet['edges']): HTMLElement {
  const dl = document.createElement('dl');
  dl.className = 'entries';
  for (const entry of entries) {
    const dt = document.createElement('dt');
    dt.textContent = entry.name;
    dl.append(dt);
    if (entry.text) {
      const dd = document.createElement('dd');
      dd.textContent = entry.text;
      dl.append(dd);
    }
  }
  return dl;
}

function render(): void {
  sheetEl.replaceChildren();
  const sheet = sheets.find((s) => s.id === selectedId);
  if (!sheet) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No characters yet. Import an archetype card to start.';
    sheetEl.append(empty);
    return;
  }

  if (sheet.rank) {
    const rank = document.createElement('div');
    rank.className = 'rank';
    rank.textContent = sheet.rank;
    sheetEl.append(rank);
  }
  const h1 = document.createElement('h1');
  h1.textContent = sheet.name;
  sheetEl.append(h1);

  if (sheet.quote) {
    const quote = document.createElement('p');
    quote.className = 'quote';
    quote.textContent = sheet.quote;
    sheetEl.append(quote);
  }

  const derived = document.createElement('div');
  derived.className = 'derived';
  const stats: [string, string | number | undefined][] = [
    ['Pace', sheet.pace],
    ['Parry', sheet.parry],
    ['Toughness', sheet.toughnessRaw ?? sheet.toughness],
  ];
  for (const [label, value] of stats) {
    if (value === undefined) continue;
    const wrap = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = String(value);
    const span = document.createElement('span');
    span.textContent = ` ${label}`;
    wrap.append(b, span);
    derived.append(wrap);
  }
  if (derived.childElementCount) sheetEl.append(derived);

  sheetEl.append(section('Attributes'));
  const attributes = document.createElement('div');
  attributes.className = 'traits';
  for (const attribute of ATTRIBUTES) {
    const trait = sheet.attributes[attribute];
    if (!trait) continue;
    const label = attribute[0]!.toUpperCase() + attribute.slice(1);
    attributes.append(
      traitButton(label, dieLabel(trait.die, trait.mod), false, () => {
        const { explained } = rollAttribute(sheet, attribute as Attribute);
        logRoll(`${sheet.name} — ${label}`, explained);
      }),
    );
  }
  sheetEl.append(attributes);

  sheetEl.append(section('Skills'));
  const skills = document.createElement('div');
  skills.className = 'traits';
  for (const skill of SKILLS) {
    const trait = sheet.skills[skill];
    // Untrained skills are shown too — rolling one at d4−2 is a normal thing to do.
    skills.append(
      traitButton(skill, trait ? dieLabel(trait.die, trait.mod) : 'd4−2', !trait, () => {
        const { explained } = rollSkill(sheet, skill as Skill);
        logRoll(`${sheet.name} — ${skill}`, explained);
      }),
    );
  }
  sheetEl.append(skills);

  if (sheet.hindrances.length) {
    sheetEl.append(section('Hindrances'), entryList(sheet.hindrances));
  }
  if (sheet.edges.length) {
    sheetEl.append(section('Edges'), entryList(sheet.edges));
  }
  renderGear(sheet);

  if (sheet.advances) {
    const p = document.createElement('p');
    p.className = 'prose';
    p.textContent = sheet.advances;
    sheetEl.append(section('Advances'), p);
  }
}

/**
 * Gear as a weapons table plus a bulleted list, rather than the card's one long
 * sentence. Damage is a button: a weapon's damage is the roll you make right
 * after the attack that the sheet already rolls for you.
 */
function renderGear(sheet: Sheet): void {
  const gear = parseGear(sheet.gear);
  if (!sheet.gear) return;

  if (gear.weapons.length) {
    sheetEl.append(section('Weapons'));
    const table = document.createElement('table');
    table.className = 'weapons';

    const head = document.createElement('tr');
    for (const label of ['', 'Range', 'Damage', 'RoF', 'AP']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.append(th);
    }
    table.append(head);

    for (const weapon of gear.weapons) {
      const row = document.createElement('tr');
      const cells = [weapon.name, weapon.range ?? '—'];
      for (const value of cells) {
        const td = document.createElement('td');
        td.textContent = value;
        row.append(td);
      }

      const damageCell = document.createElement('td');
      if (weapon.damage) {
        // "Str+d4" needs the wielder's Strength die substituted before it parses.
        const expression = damageExpression(weapon.damage, sheet.attributes.strength?.die);
        const button = document.createElement('button');
        button.className = 'dmg';
        button.textContent = weapon.damage;
        button.title = `Roll ${expression}`;
        button.addEventListener('click', () => rollFreeform(expression, `${weapon.name} damage`));
        damageCell.append(button);
      } else {
        damageCell.textContent = '—';
      }
      row.append(damageCell);

      for (const value of [weapon.rof, weapon.ap]) {
        const td = document.createElement('td');
        td.className = 'num';
        td.textContent = value === undefined ? '—' : String(value);
        row.append(td);
      }
      table.append(row);

      if (weapon.notes) {
        const noteRow = document.createElement('tr');
        noteRow.className = 'note';
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = weapon.notes;
        noteRow.append(td);
        table.append(noteRow);
      }
    }
    sheetEl.append(table);
  }

  const rest = [...gear.armor, ...gear.items];
  if (rest.length || gear.money) {
    sheetEl.append(section('Gear'));
    if (rest.length) {
      const list = document.createElement('ul');
      list.className = 'gear';
      for (const item of rest) {
        const li = document.createElement('li');
        li.textContent = item.name;
        if (item.detail) {
          const detail = document.createElement('span');
          detail.className = 'detail';
          detail.textContent = ` — ${item.detail}`;
          li.append(detail);
        }
        list.append(li);
      }
      sheetEl.append(list);
    }
    if (gear.money) {
      const money = document.createElement('p');
      money.className = 'money';
      money.textContent = gear.money;
      sheetEl.append(money);
    }
  }
}


function renderRoster(): void {
  bar.who.replaceChildren(
    ...sheets.map((sheet) => {
      const option = document.createElement('option');
      option.value = sheet.id;
      option.textContent = sheet.name;
      option.selected = sheet.id === selectedId;
      return option;
    }),
  );
  bar.who.disabled = sheets.length === 0;
}

async function reload(): Promise<void> {
  sheets = await roster.listFull();
  if (!sheets.some((s) => s.id === selectedId)) selectedId = sheets[0]?.id;
  renderRoster();
  render();
  await showBudget();
}

// ---------------------------------------------------------------- free rolls

/**
 * Roll an arbitrary expression through the same engine as everything else.
 *
 * However complete the sheet gets there will always be something it does not
 * cover — an opposed roll, a random table, damage from something not on the
 * card — so this is permanent furniture rather than a stopgap.
 */
function rollFreeform(expression: string, label = expression): void {
  const trimmed = expression.trim();
  if (!trimmed) return;
  try {
    const explained = new RollInterpreter(new CommandContext(new JavaRandom()))
      .run(parse([trimmed]))
      .trim();
    logRoll(label === trimmed ? '' : `${label} —`, explained);
  } catch (error) {
    logRoll('', `${trimmed}: ${describe(error)}`);
  }
}

// ---------------------------------------------------------------- import / export

async function importFiles(files: FileList): Promise<void> {
  const imported: string[] = [];
  for (const file of Array.from(files)) {
    const text = await file.text();
    try {
      if (file.name.endsWith('.json')) {
        const sheets = await roster.import(text);
        imported.push(...sheets.map((s) => s.name));
      } else {
        for (const sheet of parseArchetypeCards(text)) {
          await roster.save(sheet);
          imported.push(sheet.name);
        }
      }
    } catch (error) {
      notify(`${file.name}: ${describe(error)}`);
      return;
    }
  }
  notify(imported.length ? `Imported ${imported.join(', ')}` : 'Nothing to import');
  selectedId = undefined;
  await reload();
}

async function exportRoster(): Promise<void> {
  const data = await roster.export();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `deadlands-roster-${data.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  notify(`Exported ${data.sheets.length} character(s)`);
}

// ---------------------------------------------------------------- wiring

OBR.onReady(async () => {
  store = roomStore(notify);
  roster = new Roster(store, notify);

  bar.who.addEventListener('change', () => {
    selectedId = bar.who.value;
    render();
  });
  el('import').addEventListener('click', () => bar.file.click());
  bar.file.addEventListener('change', () => {
    if (bar.file.files?.length) void importFiles(bar.file.files);
    bar.file.value = '';
  });
  el('export').addEventListener('click', () => void exportRoster());

  const expr = el<HTMLInputElement>('expr');
  el<HTMLFormElement>('freeform').addEventListener('submit', (event) => {
    event.preventDefault();
    rollFreeform(expr.value);
    expr.select();
  });

  // Another player editing their own sheet must show up here without a reload.
  OBR.room.onMetadataChange(() => void reload());

  await reload();
});
