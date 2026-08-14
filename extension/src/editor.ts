/**
 * Edit mode.
 *
 * A separate mode rather than always-editable, because in play a trait is a
 * button you click to roll — making that same control also change the value is
 * how you end up with a d12 Fighting nobody meant to set.
 *
 * The rules of editing live in `src/rules/sheetEdit.ts` and are tested in node.
 * This file is the form that drives them.
 */
import {
  ALL_ATTRIBUTES,
  addEntry,
  parseDie,
  parseMod,
  removeEntry,
  setAttribute,
  setDerived,
  setSkill,
  setText,
  setWildCard,
  updateEntry,
  type DerivedField,
  type EntryList,
} from '../../src/rules/sheetEdit.js';
import { skillNames, type Sheet } from '../../src/rules/sheet.js';
import { EDGES, HINDRANCES, findEdge, findHindrance } from '../../src/rules/catalogue.js';
import { GEAR, findGear, gearLine } from '../../src/rules/gearCatalogue.js';

const DICE = [4, 6, 8, 10, 12] as const;

/**
 * A datalist of every name in the book, so the editor offers the real thing
 * while still accepting anything typed — homebrew and variants have to remain
 * possible, and three of the party's own entries are variants already.
 */
function catalogueList(kind: EntryList): HTMLDataListElement {
  const id = `catalogue-${kind}`;
  const existing = document.getElementById(id);
  if (existing) return existing as HTMLDataListElement;

  const list = document.createElement('datalist');
  list.id = id;
  for (const entry of kind === 'edges' ? EDGES : HINDRANCES) {
    const option = document.createElement('option');
    option.value = entry.name;
    // Requirements for an Edge, severity for a Hindrance — the thing you want
    // to know while picking one.
    option.label = entry.requirements ?? entry.severity ?? '';
    list.append(option);
  }
  document.body.append(list);
  return list;
}

export interface EditorHooks {
  /** Called with the new sheet on every change; the caller debounces and saves. */
  onChange: (sheet: Sheet) => void;
  onDelete: () => void;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

function textInput(value: string, placeholder: string, onInput: (v: string) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  // On change rather than input: commit when the user has finished typing, so a
  // half-typed name is never what gets written.
  input.addEventListener('change', () => onInput(input.value));
  return input;
}

function numberInput(
  value: number | undefined,
  onInput: (v: number | undefined) => void,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'num';
  input.value = value === undefined ? '' : String(value);
  input.addEventListener('change', () =>
    onInput(input.value.trim() === '' ? undefined : Number(input.value)),
  );
  return input;
}

/** Die picker with a "—" option, which is how a skill is removed. */
function diePicker(die: number | undefined, onPick: (die: string) => void): HTMLSelectElement {
  const select = document.createElement('select');
  for (const value of ['—', ...DICE.map((d) => `d${d}`)]) {
    const option = document.createElement('option');
    option.value = value === '—' ? '' : value;
    option.textContent = value;
    option.selected = die === undefined ? value === '—' : value === `d${die}`;
    select.append(option);
  }
  select.addEventListener('change', () => onPick(select.value));
  return select;
}

function traitRow(
  label: string,
  trait: { die: number; mod?: number } | undefined,
  onChange: (die: string, mod: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'edit-trait';

  const name = document.createElement('span');
  name.textContent = label;

  const modInput = document.createElement('input');
  modInput.type = 'text';
  modInput.className = 'mod';
  modInput.placeholder = '±';
  modInput.value = trait?.mod ? (trait.mod > 0 ? `+${trait.mod}` : String(trait.mod)) : '';

  const die = diePicker(trait?.die, (value) => onChange(value, modInput.value));
  modInput.addEventListener('change', () => onChange(die.value, modInput.value));

  row.append(name, die, modInput);
  return row;
}

function entryEditor(
  sheet: Sheet,
  list: EntryList,
  title: string,
  hooks: EditorHooks,
): HTMLElement {
  const block = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = title;
  block.append(heading);

  sheet[list].forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'edit-entry';

    const text = document.createElement('textarea');
    text.rows = 2;
    text.value = entry.text ?? '';
    text.placeholder = 'Rules text';
    text.addEventListener('change', () =>
      hooks.onChange(updateEntry(sheet, list, index, { text: text.value })),
    );

    const name = textInput(entry.name, 'Name', (value) => {
      // Picking a name from the book fills in its rules text, but only into an
      // empty box — silently overwriting text someone had edited would be worse
      // than leaving it stale.
      const known = list === 'edges' ? findEdge(value) : findHindrance(value);
      const patch: { name: string; text?: string } = { name: value };
      if (known && !text.value.trim()) patch.text = known.text;
      hooks.onChange(updateEntry(sheet, list, index, patch));
    });
    name.setAttribute('list', catalogueList(list).id);
    row.append(name, text);

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = '✕';
    remove.title = `Remove ${entry.name || 'entry'}`;
    remove.addEventListener('click', () => hooks.onChange(removeEntry(sheet, list, index)));
    row.append(remove);

    block.append(row);
  });

  const add = document.createElement('button');
  add.className = 'add';
  add.textContent = `+ Add ${title.replace(/s$/, '').toLowerCase()}`;
  add.addEventListener('click', () => hooks.onChange(addEntry(sheet, list, { name: '' })));
  block.append(add);

  return block;
}

/**
 * Add an item from the book to the gear line.
 *
 * Gear stays a single free-text field rather than becoming a structured list.
 * That is deliberate: it is what the cards carry, what the importer produces and
 * what the export round-trips, and restructuring it would risk mangling gear
 * somebody wrote by hand for the sake of a tidier model. The picker appends;
 * the text remains yours to edit.
 */
function gearPicker(
  sheet: Sheet,
  area: HTMLTextAreaElement,
  change: (sheet: Sheet) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'gear-picker';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Add from the rulebook…';
  input.setAttribute('list', 'catalogue-gear');

  if (!document.getElementById('catalogue-gear')) {
    const list = document.createElement('datalist');
    list.id = 'catalogue-gear';
    for (const item of GEAR) {
      const option = document.createElement('option');
      option.value = item.name;
      option.label = [item.category, item.cost].filter(Boolean).join(' · ');
      list.append(option);
    }
    document.body.append(list);
  }

  const add = document.createElement('button');
  add.className = 'add';
  add.textContent = '+ Add';
  const commit = (): void => {
    const found = findGear(input.value);
    if (!found) return;
    const existing = area.value.trim().replace(/\.$/, '');
    // Cards end the gear line with a full stop; keep that shape.
    area.value = existing ? `${existing}, ${gearLine(found)}.` : `${gearLine(found)}.`;
    input.value = '';
    change(setText(sheet, 'gear', area.value));
  };
  add.addEventListener('click', commit);
  input.addEventListener('change', commit);

  row.append(input, add);
  return row;
}

export function renderEditor(sheet: Sheet, hooks: EditorHooks): DocumentFragment {
  const out = document.createDocumentFragment();
  const change = hooks.onChange;

  // --- identity
  const identity = document.createElement('div');
  identity.className = 'edit-block';
  identity.append(
    field('Name', textInput(sheet.name, 'Name', (v) => change(setText(sheet, 'name', v)))),
    field('Rank', textInput(sheet.rank ?? '', 'Novice', (v) => change(setText(sheet, 'rank', v)))),
    field('Quote', textInput(sheet.quote ?? '', '', (v) => change(setText(sheet, 'quote', v)))),
  );

  const wildCard = document.createElement('input');
  wildCard.type = 'checkbox';
  wildCard.checked = sheet.wildCard;
  wildCard.addEventListener('change', () => change(setWildCard(sheet, wildCard.checked)));
  identity.append(field('Wild Card', wildCard));
  out.append(identity);

  // --- derived
  const derived = document.createElement('div');
  derived.className = 'edit-block derived-edit';
  const stats: [string, DerivedField][] = [
    ['Pace', 'pace'],
    ['Parry', 'parry'],
    ['Toughness', 'toughness'],
    ['Armor', 'armor'],
  ];
  for (const [label, key] of stats) {
    derived.append(field(label, numberInput(sheet[key], (v) => change(setDerived(sheet, key, v)))));
  }
  out.append(derived);

  // --- traits
  const attributes = document.createElement('div');
  const attrHeading = document.createElement('h2');
  attrHeading.textContent = 'Attributes';
  attributes.append(attrHeading);
  for (const attribute of ALL_ATTRIBUTES) {
    const label = attribute[0]!.toUpperCase() + attribute.slice(1);
    attributes.append(
      traitRow(label, sheet.attributes[attribute], (die, mod) =>
        change(setAttribute(sheet, attribute, parseDie(die), parseMod(mod))),
      ),
    );
  }
  out.append(attributes);

  const skills = document.createElement('div');
  const skillHeading = document.createElement('h2');
  skillHeading.textContent = 'Skills';
  skills.append(skillHeading);
  // `skillNames` includes anything this character has beyond the printed list —
  // Faith, "Trade (Journalism)" and so on — so an imported skill stays editable
  // rather than being invisible here and silently preserved.
  for (const skill of skillNames(sheet)) {
    skills.append(
      traitRow(skill, sheet.skills[skill], (die, mod) =>
        change(setSkill(sheet, skill, parseDie(die), parseMod(mod))),
      ),
    );
  }

  const addSkill = document.createElement('button');
  addSkill.className = 'add';
  addSkill.textContent = '+ Add skill';
  addSkill.addEventListener('click', () => {
    const name = prompt('Skill name (e.g. Faith, Trade (Journalism))')?.trim();
    if (name) change(setSkill(sheet, name, 4));
  });
  skills.append(addSkill);
  out.append(skills);

  out.append(entryEditor(sheet, 'hindrances', 'Hindrances', hooks));
  out.append(entryEditor(sheet, 'edges', 'Edges', hooks));

  // --- gear: still one free-text line, with the book behind a picker
  const gearHeading = document.createElement('h2');
  gearHeading.textContent = 'Gear';
  const gearArea = document.createElement('textarea');
  gearArea.rows = 4;
  gearArea.value = sheet.gear ?? '';
  gearArea.placeholder = 'Colt Rainmaker (Range 12/24/48, damage 2d6, RoF 1, AP 1), knife…';
  gearArea.addEventListener('change', () => change(setText(sheet, 'gear', gearArea.value)));
  out.append(gearHeading, gearArea, gearPicker(sheet, gearArea, change));

  const advHeading = document.createElement('h2');
  advHeading.textContent = 'Advances';
  const advArea = document.createElement('textarea');
  advArea.rows = 3;
  advArea.value = sheet.advances ?? '';
  advArea.addEventListener('change', () => change(setText(sheet, 'advances', advArea.value)));
  out.append(advHeading, advArea);

  const danger = document.createElement('button');
  danger.className = 'danger';
  danger.textContent = 'Delete this character';
  danger.addEventListener('click', hooks.onDelete);
  out.append(danger);

  return out;
}
