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
import {
  ATTRIBUTES,
  skillNames,
  type Attribute,
  type Sheet,
} from '../../src/rules/sheet.js';
import { parseArchetypeCards } from '../../src/rules/importArchetypeCard.js';
import {
  damageExpression,
  isRollableDamage,
  parseGear,
  weaponSkill,
} from '../../src/rules/gear.js';
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
  isApplicable,
  isRollEntry,
  newRollId,
  totalOf,
  type RollEntry,
} from '../../src/obr/rollLog.js';
import { applyDamage } from '../../src/rules/damage.js';
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
import { BennyBank } from '../../src/obr/bennyBank.js';
import { BENNY_USES, NoBenniesError } from '../../src/rules/bennies.js';
import { soak, soakedWounds } from '../../src/rules/damage.js';
import { rollAttribute as rollAttr, rollTrait } from '../../src/rules/traitRoll.js';
import { renderEditor } from './editor.js';
import { combatants, displayName, renderInitiative } from './initiativePanel.js';
import {
  dealRound,
  initiativeEdges,
  type Draw,
  type InitiativeState,
} from '../../src/rules/initiative.js';
import { cardToString, type Card } from '../../src/game/cards.js';
import {
  autoBind,
  bindToken,
  characterTokens,
  freshInitiative,
  readInitiative,
  roomStore,
  setCards,
  unbindToken,
  updateTokenState,
  writeInitiative,
} from './backends.js';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const bar = { who: el<HTMLSelectElement>('who'), file: el<HTMLInputElement>('file') };
const sheetEl = el('sheet');
const logEl = el('log');
const noticeEl = el('notice');
const budgetEl = el('budget');

let roster: Roster;
let bank: BennyBank;
let bennies = new Map<string, number>();
/** The most recent damage per token, so a Soak knows how much it may undo. */
const lastDamage = new Map<string, number>();
let store = roomStore();
let sheets: Sheet[] = [];
let selectedId: string | undefined;

const log = new RollLog();
let me = 'someone';
/** Set only for the duration of one roll, by the Secret button. */
let secretRolls = false;
let editing = false;
let tab: 'sheet' | 'initiative' = 'sheet';
let initiative: InitiativeState | undefined;
/** What each token drew this round, so the panel can show the discarded cards. */
let lastDraws: Map<string, Draw> = new Map();
/** Who has taken a turn this round; cleared on each deal. */
let acted = new Set<string>();
/** Show every skill, or only the ones this character actually has. */
let showAllSkills = false;
let tokens: Awaited<ReturnType<typeof characterTokens>> = [];
let selectedTokenId: string | undefined;
/** The whole selection, so a gang of mooks can be bound to one sheet at once. */
let selectedTokenIds: string[] = [];
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
  const total = partial.total ?? totalOf(partial.explained);
  const entry: RollEntry = {
    ...partial,
    id: newRollId(),
    at: Date.now(),
    by: me,
    ...(total === undefined ? {} : { total }),
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

      if (entry.ap) {
        const ap = document.createElement('span');
        ap.className = 'ap';
        ap.textContent = ` AP ${entry.ap}`;
        ap.title = `Ignores ${entry.ap} point(s) of armour`;
        line.append(ap);
      }

      const target = damageTarget();
      if (target && isApplicable(entry)) {
        const apply = document.createElement('button');
        apply.className = 'apply';
        apply.textContent = `→ ${target.sheet.name}`;
        apply.title =
          `Apply ${entry.total} damage to ${target.token.name}` +
          (entry.ap ? `, ignoring ${entry.ap} armour` : '');
        apply.addEventListener('click', () => void applyToTarget(entry));
        line.append(apply);
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

/**
 * Only shown once the budget is worth worrying about. A permanent readout of a
 * number that is fine 99% of the time is noise, and noise is what you stop
 * reading before the one time it matters.
 */
async function showBudget(): Promise<void> {
  const { used, capacity, fraction } = await store.usage();
  const crowded = fraction > 0.8;
  budgetEl.textContent = crowded
    ? `roster storage ${Math.round(fraction * 100)}% full (${used}/${capacity} chars)`
    : '';
  budgetEl.classList.toggle('warn', crowded);
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
  if (tab === 'initiative') {
    sheetEl.replaceChildren(
      renderInitiative(initiative, combatants(tokens, sheets), {
        onDeal: () => void deal(),
        onClear: () => void endFight(),
        onSelect: (tokenId) => void takeTurn(tokenId),
        onOpenSheet: (tokenId) => void openSheetFor(tokenId),
        acted,
        ...(selectedTokenId ? { selectedTokenId } : {}),
      }, lastDraws),
    );
    return;
  }
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

/**
 * Deal a round to everyone bound in this scene.
 *
 * No leader election: dealing is a deliberate button press by one person, not a
 * reaction every client runs. Two people dealing at once is a table problem.
 */
async function deal(): Promise<void> {
  const table = combatants(tokens, sheets);
  if (!table.length) return;
  const state = initiative ?? (await freshInitiative());

  const result = dealRound(
    state,
    table.map((c) => ({
      tokenId: c.tokenId,
      edges: initiativeEdges(c.sheet),
      out: isIncapacitated(c.state, c.sheet.wildCard),
    })),
    new JavaRandom(),
  );

  // A new round is a clean slate: everyone acts again.
  acted = new Set();
  // Anyone out of the fight loses their card as well, so the map is not showing
  // a card for a body.
  const assignments = new Map(table.map((c) => [c.tokenId, undefined as Card | undefined]));
  for (const [id, draw] of result.draws) assignments.set(id, draw.card);
  await setCards(assignments);
  await writeInitiative(result.state);
  initiative = result.state;
  lastDraws = result.draws;

  const dealt = [...result.draws]
    .map(([id, draw]) => {
      // The character's name, as everywhere else — a token called
      // "Npc Linguist 4" says nothing about who just drew a king.
      const combatant = table.find((c) => c.tokenId === id);
      const who = combatant ? displayName(combatant, table) : '?';
      return `${who} ${cardToString(draw.card)}`;
    })
    .join(', ');
  publish({
    label: `Round ${result.state.round}`,
    expression: 'initiative',
    explained: dealt + (result.jokerDealt ? ' — **joker!**' : ''),
  });

  // Joker's Wild: one Benny to every Wild Card, once, however many Jokers came
  // up. It follows from the deal, so it happens rather than being remembered.
  if (result.jokerDealt) {
    const lucky = await bank.jokersWild(sheets);
    bennies = await bank.all();
    if (lucky.length) {
      publish({
        label: "Joker's Wild",
        expression: 'benny',
        explained: `a Benny each for ${lucky.join(', ')}`,
      });
    }
  }

  await refreshTokens();
}

/**
 * Select a combatant and mark their turn taken.
 *
 * Clicking an already-marked row un-marks it, which is the escape hatch for the
 * inevitable mis-click in the middle of a fight.
 */
async function takeTurn(tokenId: string): Promise<void> {
  if (acted.has(tokenId)) acted.delete(tokenId);
  else acted.add(tokenId);
  renderSheetArea();
  await OBR.player.select([tokenId]);
}

/** Jump to a combatant's sheet: who is next, and what can they do. */
async function openSheetFor(tokenId: string): Promise<void> {
  const binding = readBinding(tokens.find((t) => t.id === tokenId)?.metadata);
  if (binding) {
    selectedId = binding.sheetId;
    renderRoster();
  }
  setTab('sheet');
  await OBR.player.select([tokenId]);
}

async function endFight(): Promise<void> {
  await setCards(new Map(tokens.map((token) => [token.id, undefined])));
  await writeInitiative(undefined);
  initiative = undefined;
  lastDraws = new Map();
  acted = new Set();
  await refreshTokens();
}

function setTab(next: 'sheet' | 'initiative'): void {
  tab = next;
  for (const name of ['sheet', 'initiative'] as const) {
    el(`tab-${name}`).setAttribute('aria-selected', String(name === next));
  }
  // The character picker, Edit, Import and Export are all sheet-scoped; on the
  // Initiative tab they are just a row of controls that do nothing useful.
  el('bar').hidden = next !== 'sheet';
  renderSheetArea();
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

/**
 * @param tone matches the colour of the corresponding token badge, so the sheet
 *             and the map read as the same information rather than two schemes.
 */
function pips(
  count: number,
  filled: number,
  title: (n: number) => string,
  onPick: (n: number) => void,
  tone: 'wound' | 'fatigue' | 'shaken',
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pips';
  for (let n = 1; n <= count; n++) {
    const pip = document.createElement('button');
    pip.className = n <= filled ? `pip on ${tone}` : 'pip';
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
          'wound',
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
        'fatigue',
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
        'shaken',
      ),
    ),
  );

  // The cumulative penalty sits with the wounds and fatigue that cause it. No
  // status sentence: the trait buttons already show the effect where it is used,
  // and the detail is in the pip tooltips.
  const penalty = traitPenalty(state);
  if (penalty) {
    const chip = document.createElement('span');
    chip.className = 'penalty';
    chip.textContent = String(penalty);
    chip.title = `${describeStatus(state, sheet.wildCard)} — ${penalty} to every trait roll`;
    strip.append(chip);
  }

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

  const soakable = lastDamage.get(token.id) ?? 0;
  if (soakable > 0 && sheet.wildCard) {
    const button = document.createElement('button');
    button.className = 'toggle soak';
    button.textContent = `Soak ${soakable}`;
    button.title = `Spend a Benny and roll Vigor to shrug off ${soakable} wound(s)`;
    button.disabled = (bennies.get(sheet.id) ?? 0) === 0;
    button.addEventListener('click', () => void attemptSoak(sheet, token.id, state, soakable));
    strip.append(button);
  }

  strip.append(bennyGroup(sheet));
  return strip;
}

/**
 * Bennies: a count, a way to spend one on something in particular, and a way to
 * hand one out.
 *
 * Shown for Wild Cards only — Extras do not have Bennies — and outside the Edit
 * toggle like the rest of the status strip, because spending one is play.
 */
function bennyGroup(sheet: Sheet): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'statgroup bennies';
  if (!sheet.wildCard) return wrap;

  const label = document.createElement('span');
  label.textContent = 'Bennies';
  wrap.append(label);

  const count = bennies.get(sheet.id) ?? 0;

  // Actual tokens rather than a number: a stash you can see at a glance is how
  // Bennies work at the table, where they sit in front of you in a little pile.
  const stack = document.createElement('div');
  stack.className = 'benny-stack';
  if (count === 0) {
    const none = document.createElement('span');
    none.className = 'benny-none';
    none.textContent = 'none';
    stack.append(none);
  }
  for (let n = 1; n <= count; n++) {
    const token = document.createElement('span');
    token.className = 'benny';
    // A stack past about six reads as a pile rather than a count, so they
    // overlap — the same way chips do when you have too many to lay out.
    if (count > 6) token.classList.add('tight');
    token.title = `${count} Benny${count === 1 ? '' : 's'}`;
    stack.append(token);
  }
  wrap.append(stack);

  // A menu rather than a bare minus: what a Benny was spent on is the
  // interesting part, and it goes in the log where the table can see it.
  const spend = document.createElement('select');
  spend.className = 'spend';
  spend.disabled = count === 0;
  const first = document.createElement('option');
  first.textContent = 'Spend…';
  first.value = '';
  spend.append(first);
  for (const use of BENNY_USES) {
    const option = document.createElement('option');
    option.value = use;
    option.textContent = use;
    spend.append(option);
  }
  spend.addEventListener('change', () => {
    const use = spend.value;
    spend.value = '';
    if (use) void spendBenny(sheet, use);
  });
  wrap.append(spend);

  const give = document.createElement('button');
  give.className = 'toggle';
  give.textContent = '+';
  give.title = 'Award a Benny';
  give.addEventListener('click', () => void awardBenny(sheet));
  wrap.append(give);

  return wrap;
}

/**
 * Soak: spend a Benny, roll Vigor, remove a wound per success and raise.
 *
 * The Vigor roll deliberately ignores the wounds just taken — "don't count the
 * Wound modifiers they're about to suffer when making this roll" (p150) — so it
 * uses the penalty from the state *before* the hit. Earlier wounds still count.
 */
async function attemptSoak(
  sheet: Sheet,
  tokenId: string,
  state: TokenState,
  wounds: number,
): Promise<void> {
  try {
    const left = await bank.spend(sheet.id, 'Soak Rolls');
    bennies.set(sheet.id, left);

    const before = { ...state, wounds: Math.max(0, state.wounds - wounds) };
    const { expression, explained } = rollAttr(sheet, 'vigor', traitPenalty(before));
    const total = totalOf(explained) ?? 0;
    const removed = Math.min(soakedWounds(total), wounds);

    const next = soak(state, total, wounds);
    await updateTokenState(tokenId, () => next);
    if (removed >= wounds) lastDamage.delete(tokenId);
    else lastDamage.set(tokenId, wounds - removed);

    publish({
      character: sheet.name,
      label: 'Soak',
      expression,
      explained: `${explained} — ${removed === 0 ? 'no wounds soaked' : `soaked ${removed} of ${wounds}`}`,
    });
    await refreshTokens();
  } catch (error) {
    notify(error instanceof NoBenniesError ? `${sheet.name} has no Bennies left` : describe(error));
  }
}

async function spendBenny(sheet: Sheet, use: string): Promise<void> {
  try {
    const left = await bank.spend(sheet.id, use);
    bennies.set(sheet.id, left);
    renderSheetArea();
    publish({
      character: sheet.name,
      label: 'spends a Benny',
      expression: 'benny',
      explained: `${use} — **${left}** left`,
    });
  } catch (error) {
    notify(error instanceof NoBenniesError ? `${sheet.name} has no Bennies left` : describe(error));
  }
}

async function awardBenny(sheet: Sheet): Promise<void> {
  const total = await bank.award(sheet.id);
  bennies.set(sheet.id, total);
  renderSheetArea();
  publish({
    character: sheet.name,
    label: 'gets a Benny',
    expression: 'benny',
    explained: `now has **${total}**`,
  });
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

  const label = document.createElement('span');
  const clash = duplicateWildCard(tokens, sheet);
  label.textContent = clash
    ? `${bound.length} tokens — a Wild Card should have one, wounds are shared`
    : bound.length === 0
      ? 'Not on the map'
      : bound.length === 1
        ? `Bound to "${bound[0]!.name}"`
        : `Shared by ${bound.length} tokens`;
  if (clash) label.className = 'warn';
  bar.append(label);

  // Anything selected that is not already this character. Offered even when the
  // sheet is already bound, because an Extra is a stat block a whole gang
  // shares — five bandits on one Bandit sheet is the normal case, and the
  // earlier UI only ever let you bind the first.
  const boundHere = new Set(bound.map((t) => t.id));
  // Only character tokens we know about: a selection can include props, notes
  // or drawings, and counting those made the button promise one more than it
  // would actually bind.
  const known = new Set(tokens.map((t) => t.id));
  const toBind = selectedTokenIds.filter((id) => known.has(id) && !boundHere.has(id));
  if (toBind.length) {
    const bind = document.createElement('button');
    const first = tokens.find((t) => t.id === toBind[0]);
    bind.textContent =
      toBind.length === 1 ? `Bind "${first?.name ?? 'token'}"` : `Bind ${toBind.length} tokens`;
    bind.title = sheet.wildCard
      ? 'A Wild Card should be on one token'
      : 'Each token keeps its own wounds';
    bind.addEventListener('click', () => {
      void (async () => {
        for (const id of toBind) await bindToken(id, sheet.id);
        await refreshTokens();
      })();
    });
    bar.append(bind);
  }

  if (bound.length) {
    // Unbind what is selected if any of it is bound here, otherwise all of it —
    // so one bandit can be detached without dissolving the gang.
    const selectedBound = selectedTokenIds.filter((id) => boundHere.has(id));
    const targets = selectedBound.length ? selectedBound : bound.map((t) => t.id);
    const unbind = document.createElement('button');
    unbind.textContent =
      selectedBound.length && bound.length > selectedBound.length
        ? `Unbind ${selectedBound.length}`
        : 'Unbind all';
    unbind.addEventListener('click', () => {
      void (async () => {
        for (const id of targets) await unbindToken(id);
        await refreshTokens();
      })();
    });
    bar.append(unbind);
  }

  return bar.childElementCount > 1 ? bar : undefined;
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
  selectedTokenIds = selection ?? [];
  selectedTokenId = selection?.[0];
  if (!selectedTokenId) {
    renderSheetArea();
    renderLog();
    return;
  }

  tokens = await characterTokens();
  const binding = readBinding(tokens.find((t) => t.id === selectedTokenId)?.metadata);
  if (binding && sheets.some((s) => s.id === binding.sheetId)) {
    selectedId = binding.sheetId;
    renderRoster();
  }
  renderSheetArea();
  renderLog();
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

  const image = portrait(sheet);
  if (image) head.append(image);
  const headText = document.createElement('div');
  head.append(headText);

  if (sheet.rank) {
    const rank = document.createElement('div');
    rank.className = 'rank';
    rank.textContent = sheet.rank;
    headText.append(rank);
  }
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

  const all = skillNames(sheet);
  const untrained = all.filter((skill) => !sheet.skills[skill]);
  const shown = showAllSkills ? all : all.filter((skill) => sheet.skills[skill]);

  const skillHead = section('Skills');
  const toggle = document.createElement('button');
  toggle.className = 'section-toggle';
  toggle.textContent = showAllSkills ? 'Trained only' : `Show all (${all.length})`;
  toggle.title = showAllSkills
    ? 'Hide the skills this character has not trained'
    : 'Show every skill, trained or not';
  toggle.addEventListener('click', () => {
    showAllSkills = !showAllSkills;
    renderSheetArea();
  });
  skillHead.append(toggle);
  sheetEl.append(skillHead);

  const skills = document.createElement('div');
  skills.className = 'traits';
  for (const skill of shown) {
    const trait = sheet.skills[skill];
    skills.append(
      traitButton(
        skill,
        trait ? `d${trait.die}${withPenalty(trait.mod)}` : `d4${withPenalty(-2)}`,
        !trait,
        () => {
          const { expression, explained } = rollSkill(sheet, skill, penalty);
          publish({ character: sheet.name, label: skill, expression, explained });
        },
      ),
    );
  }

  // With the untrained hidden there is no button for them, and rolling one is a
  // normal thing to do — so offer the whole lot at once. They all roll the same
  // d4−2, so a single roll answers "did anyone manage it" for any of them.
  if (!showAllSkills && untrained.length) {
    const rest = document.createElement('button');
    rest.className = 'trait untrained roll-untrained';
    const label = document.createElement('span');
    label.textContent = `Untrained (${untrained.length})`;
    const die = document.createElement('span');
    die.className = 'die';
    die.textContent = `d4${withPenalty(-2)}`;
    rest.append(label, die);
    rest.title = 'Roll d4−2 for any untrained skill';
    rest.addEventListener('click', () => {
      const { expression, explained } = rollTrait(
        { die: 4, mod: -2 + penalty, wildCard: sheet.wildCard },
        new JavaRandom(),
      );
      publish({ character: sheet.name, label: 'untrained skill', expression, explained });
    });
    skills.append(rest);
  }
  sheetEl.append(skills);

  if (sheet.hindrances.length) {
    sheetEl.append(section('Hindrances'), entryList(sheet.hindrances));
  }
  if (sheet.edges.length) {
    sheetEl.append(section('Edges'), entryList(sheet.edges));
  }
  if (sheet.powers?.length) {
    sheetEl.append(section('Powers'), entryList(sheet.powers));
  }
  renderGear(sheet, penalty);

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
function renderGear(sheet: Sheet, penalty: number): void {
  const gear = parseGear(sheet.gear);
  if (!sheet.gear) return;

  if (gear.weapons.length) {
    sheetEl.append(section('Weapons'));
    const table = document.createElement('table');
    table.className = 'weapons';

    const head = document.createElement('tr');
    for (const label of ['', 'Roll', 'Range', 'Damage', 'RoF', 'AP']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.append(th);
    }
    table.append(head);

    for (const weapon of gear.weapons) {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = weapon.name;
      row.append(nameCell);

      // The attack itself, not just its damage — the two halves of using a
      // weapon should be next to each other rather than one here and one in a
      // list of 26 skills.
      const skill = weaponSkill(weapon);
      const attackCell = document.createElement('td');
      const attack = document.createElement('button');
      attack.className = 'atk';
      attack.textContent = skill;
      attack.title = `Roll ${skill}${penalty ? ` (${penalty})` : ''}`;
      attack.addEventListener('click', () => {
        const { expression, explained } = rollSkill(sheet, skill, penalty);
        publish({ character: sheet.name, label: `${weapon.name} — ${skill}`, expression, explained });
      });
      attackCell.append(attack);
      row.append(attackCell);

      const rangeCell = document.createElement('td');
      rangeCell.textContent = weapon.range ?? '—';
      row.append(rangeCell);

      const damageCell = document.createElement('td');
      if (weapon.damage && !isRollableDamage(weapon.damage)) {
        // A shotgun's "1–3d6" depends on the range to the target, which the
        // sheet cannot know. Show it rather than guess which third is right.
        damageCell.textContent = weapon.damage;
        damageCell.title = 'Dice depend on range — roll it in the box below';
      } else if (weapon.damage) {
        // "Str+d4" needs the wielder's Strength die substituted before it parses.
        const expression = damageExpression(weapon.damage, sheet.attributes.strength?.die);
        const button = document.createElement('button');
        button.className = 'dmg';
        button.textContent = weapon.damage;
        button.title = `Roll ${expression}`;
        button.addEventListener('click', () =>
          rollFreeform(expression, `${weapon.name} damage`, sheet.name, weapon.ap),
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
        td.colSpan = 6;
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
  bennies = await bank.all();
  if (!sheets.some((s) => s.id === selectedId)) selectedId = sheets[0]?.id;
  renderRoster();
  renderSheetArea();
  await showBudget();
}

/**
 * What a rolled total would be applied to: whatever token is selected on the map.
 *
 * Deliberately the *selection*, not the sheet on screen. Damage is something you
 * do to a target, and in play the GM has the target selected — reading the
 * dropdown instead would quietly hit the wrong character.
 */
function damageTarget(): { token: (typeof tokens)[number]; state: TokenState; sheet: Sheet } | undefined {
  if (!selectedTokenId) return undefined;
  const token = tokens.find((t) => t.id === selectedTokenId);
  const state = token && readBinding(token.metadata);
  const sheet = state && sheets.find((s) => s.id === state.sheetId);
  return token && state && sheet ? { token, state, sheet } : undefined;
}

/**
 * Resolve a rolled total as damage against the selected token.
 *
 * Takes the whole entry rather than just the number so the weapon's AP travels
 * with it — the sheet already knew the Colt ignores a point of armour, and
 * making the GM remember that at the moment of applying would waste it.
 */
async function applyToTarget(entry: RollEntry): Promise<void> {
  const target = damageTarget();
  if (!target || entry.total === undefined) return;
  const outcome = applyDamage(target.sheet, target.state, {
    damage: entry.total,
    ...(entry.ap ? { ap: entry.ap } : {}),
  });
  await updateTokenState(target.token.id, () => outcome.state);
  if (outcome.wounds > 0) lastDamage.set(target.token.id, outcome.wounds);
  await refreshTokens();
  // No `total`: this line is the *outcome* of applying damage, and offering to
  // apply it again to whoever is selected next would only ever be a mistake.
  publish({
    character: target.sheet.name,
    label: 'takes damage',
    expression: `${entry.total}`,
    explained: outcome.description,
  });
}

// ---------------------------------------------------------------- free rolls

/**
 * Roll an arbitrary expression through the same engine as everything else.
 *
 * However complete the sheet gets there will always be something it does not
 * cover — an opposed roll, a random table, damage from something not on the
 * card — so this is permanent furniture rather than a stopgap.
 */
function rollFreeform(
  expression: string,
  label?: string,
  character?: string,
  ap?: number,
): void {
  const trimmed = expression.trim();
  if (!trimmed) return;
  try {
    const explained = new RollInterpreter(new CommandContext(new JavaRandom()))
      .run(parse([trimmed]))
      .trim();
    publish({
      expression: trimmed,
      explained,
      // The only things that may be applied as damage: a weapon's damage roll
      // and anything typed into the box.
      applicable: true,
      ...(label ? { label } : {}),
      ...(character ? { character } : {}),
      ...(ap ? { ap } : {}),
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
  bank = new BennyBank(store);
  me = await OBR.player.getName();
  // Set at runtime as well as in the manifest: OBR caches the manifest, so a
  // height change there alone would not reach an already-installed extension.
  await OBR.action.setHeight(900);


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
  el('tab-sheet').addEventListener('click', () => setTab('sheet'));
  el('tab-initiative').addEventListener('click', () => setTab('initiative'));
  OBR.scene.onMetadataChange(() => {
    void readInitiative().then((state) => {
      initiative = state;
      renderSheetArea();
    });
  });
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
  el('session').addEventListener('click', () => {
    void (async () => {
      if (!confirm('Start a new session? Every Wild Card goes back to 3 Bennies.')) return;
      await bank.newSession(sheets);
      bennies = await bank.all();
      renderSheetArea();
      publish({
        label: 'New session',
        expression: 'benny',
        explained: 'every Wild Card back to **3** Bennies',
      });
    })();
  });

  // Two buttons rather than a checkbox plus Roll: rolling in secret is one
  // click, and there is no sticky mode to forget you left on. Available to
  // everyone, not just the GM — a player rolling quietly is normal, and the
  // roll never leaves this machine either way.
  const expr = el<HTMLInputElement>('expr');
  const rollTyped = (secret: boolean): void => {
    secretRolls = secret;
    rollFreeform(expr.value);
    secretRolls = false;
    expr.select();
  };
  el<HTMLFormElement>('freeform').addEventListener('submit', (event) => {
    event.preventDefault();
    rollTyped(false);
  });
  el('roll-secret').addEventListener('click', () => rollTyped(true));

  // Another player editing their own sheet must show up here without a reload.
  // Our own writes are skipped: re-rendering mid-edit would blow away focus.
  OBR.room.onMetadataChange(() => {
    if (!saving) void reload();
  });

  initiative = await readInitiative();
  await reload();
  if (await OBR.scene.isReady()) {
    const count = await autoBind(sheets);
    if (count) notify(`Bound ${count} token(s) to characters by name`);
  }
  await onSelectionChange();
});
