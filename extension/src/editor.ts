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
  entriesIn,
  parseDie,
  parseMod,
  removeEntry,
  setAttribute,
  setDerived,
  setSkill,
  setText,
  setMaxWounds,
  setWildCard,
  updateEntry,
  type DerivedField,
  type EntryList,
} from '../../src/rules/sheetEdit.js';
import { DICE_COLOURS, diceColourOf, skillNames, type Sheet } from '../../src/rules/sheet.js';
import { maxWounds } from '../../src/rules/status.js';
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
  // Powers get an empty list on purpose. The catalogue is Edges and Hindrances;
  // offering it here would suggest "POWER POINTS, the Edge" for a Powers block
  // line that means "20 of them", which is the bug this section exists to let
  // Damian fix by hand.
  for (const entry of kind === 'edges' ? EDGES : kind === 'hindrances' ? HINDRANCES : []) {
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
  /** Marshal-only controls, chief among them marking a sheet private. */
  isGM?: boolean;
  /**
   * Animated dice: whether this *machine* has them on, and the switch.
   *
   * Passed in rather than read here because it is not part of the sheet — see the
   * comment on the control itself. Absent leaves the row out entirely.
   */
  dice?: {
    animate: boolean;
    onToggle: () => void;
  };
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

/** The five ranks, in order of advancement. */
const RANKS = ['Novice', 'Seasoned', 'Veteran', 'Heroic', 'Legendary'] as const;

/**
 * Rank as a picker rather than free text — there are five of them and they are
 * fixed. An imported card carrying something else keeps it as an extra option,
 * so a value is never silently replaced by the nearest match.
 */
function rankPicker(sheet: Sheet, onPick: (rank: string) => void): HTMLSelectElement {
  const select = document.createElement('select');
  const current = (sheet.rank ?? '').trim();
  const known = RANKS.find((r) => r.toLowerCase() === current.toLowerCase());
  const options = [
    '',
    ...RANKS,
    ...(current && !known ? [current] : []),
  ];
  for (const rank of options) {
    const option = document.createElement('option');
    option.value = rank;
    option.textContent = rank || '—';
    option.selected = known ? rank === known : rank === current;
    select.append(option);
  }
  select.addEventListener('change', () => onPick(select.value));
  return select;
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

  entriesIn(sheet, list).forEach((entry, index) => {
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
      const known =
        list === 'edges' ? findEdge(value) : list === 'hindrances' ? findHindrance(value) : undefined;
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
    field('Rank', rankPicker(sheet, (v) => change(setText(sheet, 'rank', v)))),
    field('Quote', textInput(sheet.quote ?? '', '', (v) => change(setText(sheet, 'quote', v)))),
  );

  const description = document.createElement('textarea');
  description.rows = 3;
  description.value = sheet.description ?? '';
  description.placeholder = 'Who is this? Flavour, notes, anything worth remembering.';
  description.addEventListener('change', () =>
    change(setText(sheet, 'description', description.value)),
  );
  identity.append(field('About', description));

  const wildCard = document.createElement('input');
  wildCard.type = 'checkbox';
  wildCard.checked = sheet.wildCard;
  wildCard.addEventListener('change', () => change(setWildCard(sheet, wildCard.checked)));
  identity.append(field('Wild Card', wildCard));

  // Wild Card decides three things at once — the wild die, the wound track, and
  // Benny eligibility — and Coffin Rock has creatures that want the first
  // without the second. The Blood Men's **Henchman** ability is exactly that:
  // "a Wild Die as though they were Wild Cards", on an Extra's one-wound track.
  // Rather than split the flag, the track it implies can be overridden here.
  const wounds = document.createElement('select');
  const fallback = maxWounds(sheet.wildCard);
  for (const value of ['', '0', '1', '2', '3', '4', '5'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === '' ? `Default (${fallback})` : value;
    if (value === (sheet.maxWounds === undefined ? '' : String(sheet.maxWounds))) {
      option.selected = true;
    }
    wounds.append(option);
  }
  wounds.title =
    'How many wounds before Incapacitated. Default follows Wild Card — 3 for one, 0 for an ' +
    'Extra. Set it to 0 on a Wild Card for a Henchman: the wild die, without the wound track.';
  wounds.addEventListener('change', () =>
    change(setMaxWounds(sheet, wounds.value === '' ? undefined : Number(wounds.value))),
  );
  identity.append(field('Wounds', wounds));

  // Only the Marshal gets the switch: a player unticking it on their own sheet
  // would hide their character from themselves, and ticking it on one of the
  // Marshal's would hand themselves the stat block. The same field is a column in
  // the Table tab's roster, which is where you set a batch of them at once; this
  // is for the one you already have open.
  if (hooks.isGM) {
    const pc = document.createElement('input');
    pc.type = 'checkbox';
    pc.checked = sheet.pc;
    pc.title =
      "A player's character: in their picker, their sheet view and their initiative " +
      'by name. Unticked it is one of yours. A screen, not a lock: room data is ' +
      'readable by every client in the room.';
    pc.addEventListener('change', () => change({ ...sheet, pc: pc.checked }));
    identity.append(field('Player character', pc));
  }
  // Deleting used to live at the very bottom, past Advances, on the reasoning
  // that a destructive control should be hard to reach. In practice that made the
  // *common* case — clearing out tonight's mooks — a scroll to the end of every
  // sheet, and the protection it bought was never the distance: it was the
  // confirm. `onDelete` decides how much of one is warranted.
  const danger = document.createElement('button');
  danger.className = 'danger top';
  danger.textContent = 'Delete';
  danger.title = `Delete ${sheet.name}`;
  danger.addEventListener('click', hooks.onDelete);
  const dangerRow = document.createElement('div');
  dangerRow.className = 'danger-row';
  dangerRow.append(danger);
  // Above the identity block rather than inside it: inside, it lands under seven
  // rows of fields, which is most of the scroll it was moved to avoid.
  out.append(dangerRow, identity);

  // --- dice
  //
  // The colour belongs to the character and is saved on the sheet: the Marshal rolls
  // for six of them in a fight, and a colour per player would make all six the same.
  // Every character starts on a colour derived from its id, so a fresh roster is
  // already distinguishable without anyone choosing anything.
  //
  // The switch beside it is a different kind of thing and says so: it is per machine,
  // not per character, and turning it off on Doc's sheet turns off animation for
  // everything this browser draws. It sits here because this is where the dice are
  // set up, and mislabelling it would be worse than the extra word.
  const diceBlock = document.createElement('div');
  diceBlock.className = 'edit-block';

  const colour = document.createElement('select');
  colour.className = 'dice-colour';
  const current = diceColourOf(sheet);
  for (const { name, hex } of DICE_COLOURS) {
    const option = document.createElement('option');
    option.value = hex;
    option.textContent = name;
    // The swatch is the option's own background, so the list reads as colours and
    // the names are there for anyone the colours do not work for.
    option.style.background = hex;
    colour.append(option);
  }
  colour.value = current;
  colour.style.borderColor = current;
  colour.addEventListener('change', () => {
    colour.style.borderColor = colour.value;
    change({ ...sheet, diceColour: colour.value });
  });
  diceBlock.append(field('Dice colour', colour));

  if (hooks.dice) {
    const animate = document.createElement('input');
    animate.type = 'checkbox';
    animate.checked = hooks.dice.animate;
    animate.title =
      'Animated 3D dice over the map, for this browser only — not a property of ' +
      'this character. Off means results go straight to the log.';
    animate.addEventListener('change', () => hooks.dice?.onToggle());
    diceBlock.append(field('Animate (this device)', animate));
  }
  out.append(diceBlock);

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
  // Always offered, even on a sheet with no Powers block: Damian's ask was "not
  // just for PCs", and a Marshal giving an NPC a power needs somewhere to start.
  out.append(entryEditor(sheet, 'powers', 'Powers', hooks));

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

  return out;
}
