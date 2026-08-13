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
import {
  ROLL_CHANNEL,
  RollLog,
  forBroadcast,
  isRollEntry,
  newRollId,
  type RollEntry,
} from '../../src/obr/rollLog.js';
import { newCharacter, pruneEmptyEntries } from '../../src/rules/sheetEdit.js';
import {
  duplicateWildCard,
  readBinding,
  tokensForSheet,
  type TokenLike,
  type TokenState,
} from '../../src/obr/binding.js';
import {
  FATIGUE_NAMES,
  MAX_FATIGUE,
  describeStatus,
  isIncapacitated,
  maxWounds,
  setFatigue,
  setShaken,
  setWounds,
  traitPenalty,
} from '../../src/rules/status.js';
import { renderBadges } from './badges.js';
import { renderEditor } from './editor.js';
import {
  autoBind,
  bindToken,
  characterTokens,
  roomStore,
  unbindToken,
  updateTokenState,
} from './backends.js';

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

const log = new RollLog();
let me = 'someone';
let secretRolls = false;
let editing = false;
let tokens: (TokenLike & { imageUrl?: string; position: { x: number; y: number } })[] = [];
let selectedTokenId: string | undefined;
/** Set while we are saving our own change, so the resulting onChange is ignored. */
let saving = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

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
 * Record a roll locally and, unless it is secret, tell everyone else.
 *
 * A secret roll is never broadcast — filtering it at the receiving end would mean
 * every client had the result and merely agreed not to show it, which is not a GM
 * screen. Keeping it local works because the person hiding the roll is the one
 * making it.
 */
function publish(partial: Omit<RollEntry, 'id' | 'at' | 'by'>): void {
  const entry: RollEntry = {
    ...partial,
    id: newRollId(),
    at: Date.now(),
    by: me,
    ...(secretRolls ? { secret: true } : {}),
  };
  log.add(entry);
  renderLog();
  if (!entry.secret) {
    // REMOTE: everyone but us, since we have already added it ourselves.
    void OBR.broadcast
      .sendMessage(ROLL_CHANNEL, forBroadcast(entry), { destination: 'REMOTE' })
      .catch((error: unknown) => notify(`could not share that roll: ${describe(error)}`));
  }
}

/**
 * The engine returns Discord markdown (`**8**`). Render the bold rather than
 * showing the asterisks, and via textContent rather than innerHTML — these
 * strings arrive from other clients.
 */
function renderLog(): void {
  logEl.replaceChildren(
    ...log.list().map((entry) => {
      const line = document.createElement('div');
      if (entry.secret) line.classList.add('secret');

      const who = document.createElement('span');
      who.className = 'who';
      const subject = entry.character ?? entry.by;
      who.textContent = entry.label ? `${subject} — ${entry.label} ` : `${subject} `;
      who.title = entry.character ? `rolled by ${entry.by}` : '';
      line.append(who);

      for (const [i, part] of entry.explained.split('**').entries()) {
        const span = document.createElement('span');
        span.textContent = part;
        if (i % 2 === 1) span.className = 'total';
        line.append(span);
      }
      return line;
    }),
  );
}

function showSaved(state: 'saving' | 'saved' | ''): void {
  const el2 = el('saved');
  el2.textContent = state === 'saving' ? 'saving…' : state === 'saved' ? '✓ saved' : '';
  el2.className = state;
}

/**
 * Debounced save. Writes go through VerifiedStore, which reads back and throws
 * rather than letting a dropped write look like success — so a visible tick is
 * a real one.
 */
function scheduleSave(sheet: Sheet): void {
  sheets = sheets.map((s) => (s.id === sheet.id ? sheet : s));
  renderSheetArea();
  showSaved('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void (async () => {
      saving = true;
      try {
        await roster.save(pruneEmptyEntries(sheet));
        showSaved('saved');
        setTimeout(() => showSaved(''), 1500);
      } catch (error) {
        showSaved('');
        notify(`could not save: ${describe(error)}`);
      } finally {
        saving = false;
        await showBudget();
      }
    })();
  }, 400);
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

function renderSheetArea(): void {
  const sheet = sheets.find((s) => s.id === selectedId);
  if (editing && sheet) {
    sheetEl.replaceChildren(
      renderEditor(sheet, {
        onChange: scheduleSave,
        onDelete: () => void deleteCharacter(sheet),
      }),
    );
    return;
  }
  render();
}

async function deleteCharacter(sheet: Sheet): Promise<void> {
  if (!confirm(`Delete ${sheet.name}? This cannot be undone — export first if unsure.`)) return;
  await roster.remove(sheet.id);
  selectedId = undefined;
  setEditing(false);
  await reload();
}

function setEditing(on: boolean): void {
  editing = on;
  const button = el('edit');
  button.setAttribute('aria-pressed', String(on));
  button.textContent = on ? 'Done' : 'Edit';
  document.body.classList.toggle('editing', on);
  renderSheetArea();
}

/**
 * The token's artwork, shown live from the bound token rather than copied onto
 * the sheet. Storing the URL would put a room-specific asset reference inside a
 * sheet that has to survive being exported into Damian's room.
 */
function portrait(sheet: Sheet): HTMLElement | undefined {
  const bound = tokensForSheet(tokens, sheet.id)[0] as (typeof tokens)[number] | undefined;
  if (!bound?.imageUrl) return undefined;
  const img = document.createElement('img');
  img.className = 'portrait';
  img.src = bound.imageUrl;
  img.alt = '';
  // The asset is served by OBR, not by us; if it will not load, drop it quietly
  // rather than leaving a broken-image icon in the middle of the card.
  img.addEventListener('error', () => img.remove());
  return img;
}

/**
 * The bound token for this sheet, and its state.
 *
 * For an Extra many tokens share one sheet, so "the" token is whichever is
 * selected — otherwise clicking a wound would damage an arbitrary bandit.
 */
function activeToken(sheet: Sheet): { token: TokenLike; state: TokenState } | undefined {
  const bound = tokensForSheet(tokens, sheet.id);
  const token = bound.find((t) => t.id === selectedTokenId) ?? bound[0];
  const state = token && readBinding(token.metadata);
  return token && state ? { token, state } : undefined;
}

/** The penalty the sheet's trait rolls currently carry. */
function statusPenalty(sheet: Sheet): number {
  const active = activeToken(sheet);
  return active ? traitPenalty(active.state) : 0;
}

function pips(
  count: number,
  filled: number,
  title: (n: number) => string,
  onPick: (n: number) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pips';
  for (let n = 1; n <= count; n++) {
    const pip = document.createElement('button');
    pip.className = n <= filled ? 'pip on' : 'pip';
    pip.title = title(n);
    // Clicking the pip you are already on steps back, so the track is reversible
    // without hunting for a separate minus button.
    pip.addEventListener('click', () => onPick(filled === n ? n - 1 : n));
    wrap.append(pip);
  }
  return wrap;
}

/**
 * Wounds, fatigue and Shaken — always live, never behind the Edit toggle.
 *
 * Edit mode is for changing who a character *is*; this is for using them. The
 * payoff is that the trait buttons pick the penalty up automatically.
 */
function statusStrip(sheet: Sheet): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'status';

  const active = activeToken(sheet);
  if (!active) {
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Bind a token to track wounds';
    strip.append(hint);
    return strip;
  }

  const { token, state } = active;
  const change = (next: TokenState): void => {
    void updateTokenState(token.id, () => next).then(refreshTokens);
  };

  const woundMax = maxWounds(sheet.wildCard);
  if (woundMax > 0) {
    strip.append(
      labelled(
        'Wounds',
        pips(
          woundMax,
          Math.min(state.wounds, woundMax),
          (n) => `${n} wound${n === 1 ? '' : 's'} — ${-n} to every trait roll`,
          (n) => change(setWounds(state, n, sheet.wildCard)),
        ),
      ),
    );
  }
  strip.append(
    labelled(
      'Fatigue',
      pips(
        MAX_FATIGUE,
        Math.min(state.fatigue, MAX_FATIGUE),
        (n) => `${FATIGUE_NAMES[n] ?? `Fatigue ${n}`} — ${-n} to every trait roll`,
        (n) => change(setFatigue(state, n)),
      ),
    ),
  );

  strip.append(
    labelled(
      'Shaken',
      pips(
        1,
        state.shaken ? 1 : 0,
        () => (state.shaken ? 'Shaken — click to clear' : 'Mark Shaken (no penalty to the roll)'),
        (n) => change(setShaken(state, n > 0)),
      ),
    ),
  );

  // An Extra has no wound track, so Incapacitated needs its own control.
  const out = isIncapacitated(state, sheet.wildCard);
  const down = document.createElement('button');
  down.className = out ? 'toggle on danger-toggle' : 'toggle';
  down.textContent = out ? 'Incapacitated' : 'Down';
  down.title = out ? 'Bring back up' : 'Mark Incapacitated';
  down.addEventListener('click', () =>
    change(setWounds(state, out ? 0 : woundMax + 1, sheet.wildCard)),
  );
  strip.append(down);

  // No status sentence: the trait buttons already show the penalty where it is
  // actually used, so a line repeating it is clutter. The detail lives in the
  // pip tooltips, and a single chip appears only when there is a penalty at all.
  const penalty = traitPenalty(state);
  if (penalty) {
    const chip = document.createElement('span');
    chip.className = 'penalty';
    chip.textContent = String(penalty);
    chip.title = `${describeStatus(state, sheet.wildCard)} — ${penalty} to every trait roll`;
    strip.append(chip);
  }

  return strip;
}

function labelled(label: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'statgroup';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

/** Bind / unbind for whatever is selected on the map. */
function bindBar(sheet: Sheet): HTMLElement | undefined {
  const bound = tokensForSheet(tokens, sheet.id);
  const bar = document.createElement('div');
  bar.className = 'bindbar';

  if (bound.length) {
    const label = document.createElement('span');
    const clash = duplicateWildCard(tokens, sheet);
    label.textContent = clash
      ? `Bound to ${bound.length} tokens — a Wild Card should have one, wounds are shared`
      : bound.length === 1
        ? `Bound to "${bound[0]!.name}"`
        : `Shared by ${bound.length} tokens`;
    if (clash) label.className = 'warn';

    const unbind = document.createElement('button');
    unbind.textContent = 'Unbind';
    unbind.addEventListener('click', () => {
      void (async () => {
        for (const token of bound) await unbindToken(token.id);
        await refreshTokens();
      })();
    });
    bar.append(label, unbind);
    return bar;
  }

  if (!selectedTokenId) return undefined;
  const target = tokens.find((t) => t.id === selectedTokenId);
  if (!target) return undefined;

  const bind = document.createElement('button');
  bind.textContent = `Bind to "${target.name}"`;
  bind.addEventListener('click', () => {
    void (async () => {
      await bindToken(target.id, sheet.id);
      await refreshTokens();
    })();
  });
  bar.append(bind);
  return bar;
}

async function refreshTokens(): Promise<void> {
  tokens = await characterTokens();
  renderSheetArea();
  await renderBadges(tokens, sheets);
}

/**
 * Selecting a bound token switches the panel to that character — the reason
 * binding exists at all, once there are six PCs and a dozen mooks.
 */
async function onSelectionChange(): Promise<void> {
  const selection = await OBR.player.getSelection();
  selectedTokenId = selection?.[0];
  if (!selectedTokenId) return renderSheetArea();

  tokens = await characterTokens();
  const binding = readBinding(tokens.find((t) => t.id === selectedTokenId)?.metadata);
  if (binding && sheets.some((s) => s.id === binding.sheetId)) {
    selectedId = binding.sheetId;
    renderRoster();
  }
  renderSheetArea();
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

  const head = document.createElement('div');
  head.className = 'cardhead';

  // Portrait and rank stack together on the left; the rank is a caption for the
  // picture rather than a line pushing the name down.
  const image = portrait(sheet);
  if (image || sheet.rank) {
    const column = document.createElement('div');
    column.className = 'portrait-col';
    if (image) column.append(image);
    if (sheet.rank) {
      const rank = document.createElement('div');
      rank.className = 'rank';
      rank.textContent = sheet.rank;
      column.append(rank);
    }
    head.append(column);
  }
  const headText = document.createElement('div');
  head.append(headText);

  const h1 = document.createElement('h1');
  h1.textContent = sheet.name;
  headText.append(h1);

  if (sheet.quote) {
    const quote = document.createElement('p');
    quote.className = 'quote';
    quote.textContent = sheet.quote;
    headText.append(quote);
  }
  sheetEl.append(head);

  const bind = bindBar(sheet);
  if (bind) sheetEl.append(bind);
  sheetEl.append(statusStrip(sheet));

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

  const penalty = statusPenalty(sheet);
  const withPenalty = (mod: number | undefined): string => {
    const total = (mod ?? 0) + penalty;
    return total ? (total > 0 ? `+${total}` : String(total)) : '';
  };

  sheetEl.append(section('Attributes'));
  const attributes = document.createElement('div');
  attributes.className = 'traits';
  for (const attribute of ATTRIBUTES) {
    const trait = sheet.attributes[attribute];
    if (!trait) continue;
    const label = attribute[0]!.toUpperCase() + attribute.slice(1);
    attributes.append(
      traitButton(label, `d${trait.die}${withPenalty(trait.mod)}`, false, () => {
        const { expression, explained } = rollAttribute(sheet, attribute as Attribute, penalty);
        publish({ character: sheet.name, label, expression, explained });
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
      traitButton(
        skill,
        trait ? `d${trait.die}${withPenalty(trait.mod)}` : `d4${withPenalty(-2)}`,
        !trait,
        () => {
          const { expression, explained } = rollSkill(sheet, skill as Skill, penalty);
          publish({ character: sheet.name, label: skill, expression, explained });
        },
      ),
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
        button.addEventListener('click', () =>
          rollFreeform(expression, `${weapon.name} damage`, sheet.name),
        );
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
  renderSheetArea();
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
function rollFreeform(expression: string, label?: string, character?: string): void {
  const trimmed = expression.trim();
  if (!trimmed) return;
  try {
    const explained = new RollInterpreter(new CommandContext(new JavaRandom()))
      .run(parse([trimmed]))
      .trim();
    publish({
      expression: trimmed,
      explained,
      ...(label ? { label } : {}),
      ...(character ? { character } : {}),
    });
  } catch (error) {
    // A typo is not worth broadcasting; show it to whoever typed it.
    log.add({
      id: newRollId(),
      at: Date.now(),
      by: me,
      expression: trimmed,
      explained: `${trimmed}: ${describe(error)}`,
      secret: true,
    });
    renderLog();
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
  me = await OBR.player.getName();

  const secretToggle = el<HTMLInputElement>('secret');
  secretToggle.checked = secretRolls;
  secretToggle.addEventListener('change', () => {
    secretRolls = secretToggle.checked;
  });
  // Available to everyone, not just the GM: a player rolling quietly is normal,
  // and the roll never leaves this machine either way.

  OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
    if (!isRollEntry(event.data)) return;
    // `secret` is meaningless on the wire; never honour a claim of it.
    const { secret, ...entry } = event.data;
    void secret;
    if (log.add(entry)) renderLog();
  });

  OBR.player.onChange((player) => {
    me = player.name;
    void onSelectionChange();
  });

  // Bindings live in item metadata, which is per-scene — so every new map starts
  // unbound, and the party would have to be re-bound by hand without this.
  OBR.scene.onReadyChange((ready) => {
    if (!ready) return;
    void (async () => {
      const count = await autoBind(sheets);
      if (count) notify(`Bound ${count} token(s) to characters by name`);
      await refreshTokens();
    })();
  });
  OBR.scene.items.onChange(() => void refreshTokens());

  bar.who.addEventListener('change', () => {
    selectedId = bar.who.value;
    renderSheetArea();
  });
  el('edit').addEventListener('click', () => setEditing(!editing));
  el('new').addEventListener('click', () => {
    void (async () => {
      const sheet = newCharacter('New Character', sheets);
      await roster.save(sheet);
      selectedId = sheet.id;
      await reload();
      setEditing(true);
    })();
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
  // Our own writes are skipped: re-rendering mid-edit would blow away focus.
  OBR.room.onMetadataChange(() => {
    if (!saving) void reload();
  });

  await reload();
  if (await OBR.scene.isReady()) {
    const count = await autoBind(sheets);
    if (count) notify(`Bound ${count} token(s) to characters by name`);
  }
  await onSelectionChange();
});
