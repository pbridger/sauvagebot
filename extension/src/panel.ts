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
import { parseStatBlocks } from '../../src/rules/statBlock.js';
import {
  BESTIARY_SOURCE,
  creatureSheet,
  outdatedSkills,
  searchCreatures,
} from '../../src/rules/bestiary.js';
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
  rollBreakdown,
  setFatigue,
  setShaken,
  setWounds,
  traitPenalty,
  type RollBreakdown,
} from '../../src/rules/status.js';
import {
  MANUAL_RANGE,
  SITUATIONS,
  clearModifiers,
  describeMods,
  formatMod,
  hasCondition,
  setManualMod,
  situationsOf,
  toggleCondition,
} from '../../src/rules/modifiers.js';
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
import { cardLabel, type Card } from '../../src/game/cards.js';
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
type Tab = 'sheet' | 'initiative' | 'table';
let tab: Tab = 'sheet';
let isGM = false;
let initiative: InitiativeState | undefined;
/** What each token drew this round, so the panel can show the discarded cards. */
let lastDraws: Map<string, Draw> = new Map();
/** Who has taken a turn this round; cleared on each deal. */
let acted = new Set<string>();
/** Show every skill, or only the ones this character actually has. */
let showAllSkills = false;
/** True while the paste-a-stat-block form is up. */
let pasting = false;
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
 * The name a roll goes out under.
 *
 * A private sheet does not broadcast its character's name: the roll would
 * otherwise announce exactly what the Marshal just marked hidden, and unlike the
 * picker nobody has to go looking for it — it arrives in everyone's log. The
 * token's name goes instead, which the players can already read off the map.
 */
function rollerName(sheet: Sheet): string | undefined {
  if (!sheet.private) return sheet.name;
  return activeToken(sheet)?.token.name;
}

/** `{ character }` for a published line, absent for a private sheet with no token. */
function named(sheet: Sheet): { character?: string } {
  const who = rollerName(sheet);
  return who ? { character: who } : {};
}

/** Publish a roll made off a sheet, with its modifier breakdown attached. */
function publishTrait(
  sheet: Sheet,
  label: string,
  result: { expression: string; explained: string },
  mods: RollBreakdown,
): void {
  const who = rollerName(sheet);
  publish({
    ...(who ? { character: who } : {}),
    label,
    expression: result.expression,
    explained: result.explained,
    ...(mods.parts.length ? { mods: mods.parts } : {}),
  });
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
      line.className = 'entry';
      if (entry.secret) line.classList.add('secret');

      // Two lines: who and what on the first, the dice and the answer on the
      // second. One line held a name, a label, an expression, every die and a
      // total, and the part you were looking for was never in the same place.
      const head = document.createElement('div');
      head.className = 'head';
      const who = document.createElement('b');
      who.className = 'who';
      who.textContent = entry.character ?? entry.by;
      who.title = entry.character ? `rolled by ${entry.by}` : '';
      head.append(who);
      if (entry.label) {
        const what = document.createElement('b');
        what.className = 'what';
        what.textContent = entry.label;
        head.append(what);
      }

      // Compact modifier pills, in the sheet's two colours: 2W, 1F, -4. The full
      // wording is in the tooltip.
      for (const mod of entry.mods ?? []) {
        const chip = document.createElement('span');
        chip.className = `rollmod ${mod.kind}`;
        chip.textContent = mod.short ?? `${mod.label} ${formatMod(mod.value)}`;
        chip.title = `${mod.label} ${formatMod(mod.value)}`;
        head.append(chip);
      }
      line.append(head);

      const body = document.createElement('div');
      body.className = 'body';
      for (const [i, part] of entry.explained.split('**').entries()) {
        const span = document.createElement('span');
        span.textContent = part;
        if (i % 2 === 1) span.className = 'total';
        body.append(span);
      }

      if (entry.ap) {
        const ap = document.createElement('span');
        ap.className = 'ap';
        ap.textContent = ` AP ${entry.ap}`;
        ap.title = `Ignores ${entry.ap} point(s) of armour`;
        body.append(ap);
      }

      const target = damageTarget();
      if (target && isApplicable(entry)) {
        const apply = document.createElement('button');
        apply.className = 'apply';
        apply.textContent = `\u2192 ${rollerName(target.sheet) ?? target.token.name}`;
        apply.title =
          `Apply ${entry.total} damage to ${target.token.name}` +
          (entry.ap ? `, ignoring ${entry.ap} armour` : '');
        apply.addEventListener('click', () => void applyToTarget(entry));
        body.append(apply);
      }
      line.append(body);
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
 * The footer warns only when the budget is worth worrying about — a permanent
 * readout of a number that is fine 99% of the time is noise, and noise is what
 * you stop reading before the one time it matters. The exact figure lives in the
 * GM's Table pane, where someone has gone looking for it.
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

function traitButton(
  label: string,
  die: HTMLElement,
  untrained: boolean,
  roll: () => void,
): HTMLElement {
  const button = document.createElement('button');
  button.className = untrained ? 'trait untrained' : 'trait';
  const name = document.createElement('span');
  name.textContent = label;
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
  if (tab === 'table') {
    sheetEl.replaceChildren(pasting ? renderPaste() : renderTable());
    return;
  }
  if (tab === 'initiative') {
    sheetEl.replaceChildren(
      renderInitiative(initiative, combatants(tokens, sheets), {
        revealPrivate: isGM,
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
  if (editing && sheet && maySee(sheet)) {
    sheetEl.replaceChildren(
      renderEditor(sheet, {
        onChange: scheduleSave,
        onDelete: () => void deleteCharacter(sheet),
        isGM,
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
      // The published line goes to everyone, so a private character is named by
      // its token there whoever is dealing.
      const who = combatant ? displayName(combatant, table, false) : '?';
      return `${who} ${cardLabel(draw.card)}`;
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
  if (binding && maySee(sheets.find((s) => s.id === binding.sheetId))) {
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

function setTab(next: Tab): void {
  tab = next;
  pasting = false;
  // A notice is about what just happened here; leaving it up on another tab is
  // stale by definition.
  notify(undefined);
  for (const name of ['sheet', 'initiative', 'table'] as const) {
    el(`tab-${name}`).setAttribute('aria-selected', String(name === next));
  }
  // The picker and Edit are character-scoped; on the other tabs they are a row
  // of controls that do nothing useful.
  el('bar').hidden = next !== 'sheet';
  renderSheetArea();
}

/**
 * The GM's pane: everything that acts on the table rather than on a character.
 *
 * Split out because those are a different kind of work — done between fights,
 * not during one — and because they were crowding a toolbar that a player has
 * no use for. Hidden from players, which is a guard rail rather than a
 * permission: anyone can still write the metadata, but nobody hits "New
 * session" by accident and wipes the party's Bennies with no undo.
 */
function renderTable(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'table-pane';

  const roster = document.createElement('div');
  roster.className = 'pane-block';
  roster.append(paneHeading('Roster', `${sheets.length} character(s)`));
  roster.append(
    paneButtons([
      ['New character', 'A blank sheet to fill in by hand', () => void addBlank()],
      ['Paste stat blocks…', 'Add NPCs from any book', () => {
        pasting = true;
        renderSheetArea();
      }],
      ['Import…', 'Archetype cards, or a roster JSON', () => bar.file.click()],
      ['Export', 'Download the whole roster', () => void exportRoster()],
    ]),
  );
  wrap.append(roster);
  wrap.append(privateBlock());
  wrap.append(bestiaryBlock());

  const session = document.createElement('div');
  session.className = 'pane-block';
  session.append(
    paneHeading('Session', 'Unused Bennies are lost when a session ends'),
  );
  session.append(
    paneButtons([
      [
        'New session',
        'Every Wild Card back to 3 Bennies',
        () => {
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
        },
      ],
    ]),
  );
  wrap.append(session);

  const storage = document.createElement('p');
  storage.className = 'pane-note';
  storage.id = 'pane-storage';
  void store.usage().then(({ used, capacity, fraction }) => {
    storage.textContent = `Roster storage: ${used} of ${capacity} chars (${Math.round(fraction * 100)}%)`;
  });
  wrap.append(storage);

  return wrap;
}

/**
 * Which characters the players cannot see, in one place.
 *
 * The per-sheet tick is in the editor, but "what have I hidden?" is a question
 * about the table rather than about a character — and a mook left private after
 * the reveal is a small, silent annoyance. So the list lives here, with the
 * switch next to each name.
 */
function privateBlock(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pane-block';
  const hidden = sheets.filter((sheet) => sheet.private);
  wrap.append(
    paneHeading(
      "Marshal's characters",
      hidden.length
        ? `${hidden.length} hidden from players' pickers, sheets and initiative names. ` +
          'A screen, not a lock — room data is readable by every client.'
        : 'Nothing hidden. Tick "Marshal\'s only" while editing a sheet to hide it.',
    ),
  );

  if (!hidden.length) return wrap;

  const list = document.createElement('div');
  list.className = 'creature-list';
  for (const sheet of hidden) {
    const row = document.createElement('div');
    row.className = 'creature';

    const open = document.createElement('button');
    open.className = 'creature-name';
    open.textContent = sheet.name;
    open.title = 'Open this sheet';
    open.addEventListener('click', () => {
      selectedId = sheet.id;
      renderRoster();
      setTab('sheet');
    });
    row.append(open);

    const reveal = document.createElement('button');
    reveal.className = 'creature-add';
    reveal.textContent = 'Reveal';
    reveal.title = 'Let the players see this sheet';
    reveal.addEventListener('click', () => {
      void (async () => {
        await roster.save({ ...sheet, private: false });
        await reload();
        renderSheetArea();
      })();
    });
    row.append(reveal);
    list.append(row);
  }
  wrap.append(list);
  return wrap;
}

/**
 * The creature presets: search, see what you would get, add it.
 *
 * A preset is added exactly as a pasted block would be, because it *is* one —
 * the same parser reads both, so there is no second code path to keep honest.
 */
function bestiaryBlock(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pane-block';
  wrap.append(paneHeading('Bestiary', `${BESTIARY_SOURCE}. Written for an older edition — expect to adjust.`));

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search creatures…';
  wrap.append(search);

  const results = document.createElement('div');
  results.className = 'creature-list';
  wrap.append(results);

  const show = (): void => {
    results.replaceChildren();
    for (const creature of searchCreatures(search.value, 12)) {
      const row = document.createElement('div');
      row.className = 'creature';

      const name = document.createElement('button');
      name.className = 'creature-name';
      name.textContent = creature.name;
      const sheet = creatureSheet(creature);
      const stale = outdatedSkills(sheet);
      name.title =
        `Pace ${sheet.pace ?? '—'}, Parry ${sheet.parry}, Toughness ${sheet.toughness}` +
        (stale.length ? `\nOlder-edition skills: ${stale.join(', ')}` : '');
      name.addEventListener('click', () => void addCreature(creature.name));
      row.append(name);

      const meta = document.createElement('span');
      meta.className = 'creature-meta';
      meta.textContent = `${creature.category} · T${sheet.toughness} P${sheet.parry}`;
      row.append(meta);

      results.append(row);
    }
  };
  search.addEventListener('input', show);
  show();
  return wrap;
}

async function addCreature(name: string): Promise<void> {
  const creature = searchCreatures(name, 1)[0];
  if (!creature) return;
  const sheet = creatureSheet(creature);
  // NPCs the Marshal adds start private: a mook's stat block is the one thing at
  // the table the players are meant to find out by being shot at. One tick in
  // the editor makes it public.
  await roster.save({ ...sheet, id: newCharacter(sheet.name, sheets).id, private: true });
  const stale = outdatedSkills(sheet);
  publish({
    label: 'Added',
    expression: 'roster',
    explained:
      `**${sheet.name}**` +
      (stale.length ? ` — note ${stale.join(', ')} predates this edition` : ''),
  });
  await reload();
}

function paneHeading(title: string, note: string): HTMLElement {
  const wrap = document.createElement('div');
  const h = document.createElement('h2');
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'pane-note';
  p.textContent = note;
  wrap.append(h, p);
  return wrap;
}

function paneButtons(items: [string, string, () => void][]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'pane-buttons';
  for (const [label, title, onClick] of items) {
    const button = document.createElement('button');
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', onClick);
    row.append(button);
  }
  return row;
}

async function addBlank(): Promise<void> {
  const sheet = newCharacter('New Character', sheets);
  await roster.save(sheet);
  selectedId = sheet.id;
  await reload();
  setTab('sheet');
  setEditing(true);
}

/**
 * Add NPCs by pasting their stat blocks.
 *
 * There is no preset list to ship: the player extract has no bestiary, and the
 * three creatures it does contain are summoned allies. Inventing a set of
 * "standard mooks" would mean making up stats and presenting them as the game's.
 * Every Savage Worlds NPC is printed in one format, so reading that format turns
 * any book, including the Marshal's, into the preset list.
 */
function renderPaste(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'paste-block';

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'Paste one or more stat blocks. Pace, Parry and Toughness are worked out from the rules if a block leaves them out.';
  wrap.append(hint);

  const area = document.createElement('textarea');
  area.placeholder = `BODYGUARD
Attributes: Agility d8, Smarts d4, Spirit d6, Strength d6, Vigor d6
Skills: Athletics d6, Fighting d6, Notice d4, Shooting d4
Pace: 6; Parry: 5; Toughness: 7 (2)
Edges: First Strike
Gear: Melee attack (Str+d6).`;
  wrap.append(area);

  const preview = document.createElement('pre');
  const review = (): void => {
    if (!area.value.trim()) {
      preview.textContent = '';
      return;
    }
    try {
      preview.textContent = parseStatBlocks(area.value)
        .map(
          (s) =>
            `${s.name} — Pace ${s.pace ?? '—'}, Parry ${s.parry}, Toughness ${s.toughness}` +
            `${s.armor ? ` (${s.armor})` : ''}, ${Object.keys(s.skills).length} skills`,
        )
        .join('\n');
    } catch (error) {
      preview.textContent = describe(error);
    }
  };
  area.addEventListener('input', review);
  wrap.append(preview);

  const row = document.createElement('div');
  row.className = 'row';
  const add = document.createElement('button');
  add.textContent = 'Add';
  add.addEventListener('click', () => {
    void (async () => {
      try {
        const parsed = parseStatBlocks(area.value);
        for (const sheet of parsed) {
          await roster.save({ ...sheet, id: newCharacter(sheet.name, sheets).id, private: true });
        }
        notify(`Added ${parsed.map((s) => s.name).join(', ')}`);
        pasting = false;
        selectedId = undefined;
        await reload();
      } catch (error) {
        notify(describe(error));
      }
    })();
  });
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    pasting = false;
    renderSheetArea();
  });
  row.append(add, cancel);
  wrap.append(row);
  return wrap;
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

/**
 * Everything modifying this sheet's trait rolls: wounds and Fatigue in red,
 * whatever the Marshal has called in green.
 *
 * Returned whole rather than as a number so a button's label and the expression
 * it rolls come from the same place. They used to come from two, which is the
 * sort of disagreement nobody notices until a roll is wrong.
 */
function modsFor(sheet: Sheet): RollBreakdown {
  return rollBreakdown(activeToken(sheet)?.state);
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
  const block = document.createElement('div');
  block.className = 'status-block';
  const strip = document.createElement('div');
  strip.className = 'status';
  block.append(strip);
  // Bennies first, inside the same panel: a resource you decide to spend, and
  // deciding comes before the arithmetic of what the roll is at.
  strip.append(bennyGroup(sheet));
  // Two halves on the row below, each its own flex container, so each total can
  // sit hard right of the controls that produce it.
  const half = document.createElement('div');
  half.className = 'statushalf';

  // Ordered Shaken, then Wounds, then Fatigue: how often each comes up in play,
  // and so the order they get thought about at the table.
  const active = activeToken(sheet);
  if (!active) {
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Bind a token to track wounds';
    strip.append(hint);
    return block;
  }

  const { token, state } = active;
  const change = (next: TokenState): void => {
    void updateTokenState(token.id, () => next).then(refreshTokens);
  };

  half.append(
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

  const woundMax = maxWounds(sheet.wildCard);
  if (woundMax > 0) {
    half.append(
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
  // Extras are taken out by a single Wound, so a fatigue track for them is a
  // control nobody will ever use. (They can technically take Fatigue; if that
  // ever matters at the table this is one line.)
  if (sheet.wildCard) {
    half.append(
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
  }

  // The cumulative penalty sits with the wounds and fatigue that cause it, and is
  // shown even at zero: a number that appears only when it is bad is a number you
  // have to notice the absence of. No status sentence — the trait buttons carry
  // the effect where it is used, and the detail is in the pip tooltips.
  const penalty = traitPenalty(state);
  const chip = document.createElement('span');
  chip.className = penalty ? 'penalty' : 'penalty zero';
  chip.textContent = formatMod(penalty) || '+0';
  chip.title = `${describeStatus(state, sheet.wildCard)} — ${formatMod(penalty) || 'no'} modifier from wounds and Fatigue`;

  // An Extra has no wound track, so Incapacitated needs its own control.
  const out = isIncapacitated(state, sheet.wildCard);
  const down = document.createElement('button');
  down.className = out ? 'toggle on danger-toggle' : 'toggle';
  down.textContent = out ? 'Incapacitated' : 'Down';
  down.title = out ? 'Bring back up' : 'Mark Incapacitated';
  down.addEventListener('click', () =>
    change(setWounds(state, out ? 0 : woundMax + 1, sheet.wildCard)),
  );
  half.append(down);

  const soakable = lastDamage.get(token.id) ?? 0;
  if (soakable > 0 && sheet.wildCard) {
    const button = document.createElement('button');
    button.className = 'toggle soak';
    button.textContent = `Soak ${soakable}`;
    button.title = `Spend a Benny and roll Vigor to shrug off ${soakable} wound(s)`;
    button.disabled = (bennies.get(sheet.id) ?? 0) === 0;
    button.addEventListener('click', () => void attemptSoak(sheet, token.id, state, soakable));
    half.append(button);
  }

  // Last in the half, and pushed to its right edge by the stylesheet.
  half.append(chip);
  strip.append(half);

  // The Marshal's modifiers join the same row, behind a divider: they are read
  // together with the wounds — both answer "what is this roll at?" — and the
  // green tint is what says which half is which.
  strip.append(modifierGroup(token, state));
  return block;
}

/** Whether the modifier chips are unfolded. Sticky, since a fight tends to keep needing them. */
let showConditions = false;

/**
 * The green half of the row: everything the Marshal calls, as opposed to what
 * the character is carrying.
 *
 * A dial from −4 to +4 for the one-off ("that's a tough climb, −2") plus named
 * conditions from the book, which carry their page and exact wording in a
 * tooltip so nobody has to remember whether Dark is −2 or −4.
 *
 * Everything here is on the *roller*: it applies to every trait roll this
 * character makes until it is cleared. Cover, Range, Gang Up and The Drop are
 * deliberately absent — they belong to one attack against one target, and left
 * standing here they would quietly follow the character into their next Notice
 * roll. Hence the Clear button sitting right next to them.
 */
function modifierGroup(token: TokenLike, state: TokenState): HTMLElement {
  const group = document.createElement('div');
  group.className = 'modgroup';
  const change = (next: TokenState): void => {
    void updateTokenState(token.id, () => next).then(refreshTokens);
  };

  // Line one is the dial and its total, and must not wrap — the green number
  // belongs beside the pips that produce it. The buttons go on line two with the
  // condition chips, where there is room for them.
  const line = document.createElement('div');
  line.className = 'modline';
  const controls = document.createElement('div');
  controls.className = 'modcontrols';
  group.append(line, controls);

  const track = document.createElement('div');
  track.className = 'pips mod-track';
  const manual = state.mod ?? 0;
  const dial = (n: number): HTMLElement => {
    const pip = document.createElement('button');
    const on = n === 0 ? manual === 0 : n < 0 ? manual <= n : manual >= n;
    pip.className = on ? 'pip on situational' : 'pip';
    // Signed, because a pip reading "2" in a track that runs both ways is a
    // question rather than a label.
    pip.textContent = formatMod(n) || '+0';
    pip.title = n === 0 ? 'No hand-dialled modifier' : `${formatMod(n)} to every trait roll`;
    pip.addEventListener('click', () => change(setManualMod(state, manual === n ? 0 : n)));
    return pip;
  };
  // A +0 pip rather than a separator: zero is a value on this track, and the
  // one you most often want to get back to.
  for (let n = -MANUAL_RANGE; n <= MANUAL_RANGE; n++) track.append(dial(n));
  line.append(labelled('Modifier', track));

  const active = situationsOf(state);
  const total = manual + active.reduce((sum, s) => sum + s.value, 0);
  const parts = [
    ...active.map((s) => ({ label: s.label, value: s.value, kind: 'situational' as const })),
    ...(manual ? [{ label: 'Modifier', value: manual, kind: 'situational' as const }] : []),
  ];

  // Always present, disabled when there is nothing to clear: a button that comes
  // and goes shifts everything beside it every time a modifier is set.
  const clear = document.createElement('button');
  clear.className = 'toggle';
  clear.textContent = 'Clear';
  clear.disabled = total === 0 && !active.length;
  clear.title = 'Back to no situational modifier';
  clear.addEventListener('click', () => change(clearModifiers(state)));
  controls.append(clear);

  const more = document.createElement('button');
  more.className = showConditions ? 'toggle cond-toggle on' : 'toggle cond-toggle';
  more.textContent = showConditions ? 'Conditions ▴' : 'Conditions ▾';
  more.title = 'Named modifiers from the rulebook';
  more.addEventListener('click', () => {
    showConditions = !showConditions;
    renderSheetArea();
  });
  controls.append(more);

  // Last, and pushed hard right, so the two totals line up down the panel.
  const chip = document.createElement('span');
  chip.className = total ? 'penalty situational' : 'penalty situational zero';
  chip.textContent = formatMod(total) || '+0';
  chip.title = parts.length
    ? `${describeMods(parts)} — ${formatMod(total)} to every trait roll`
    : 'Nothing the Marshal has called';
  line.append(chip);

  // Active conditions are always visible; the full list folds away, because ten
  // buttons above a character sheet is a lot of furniture for a player who is
  // only ever going to see two of them.
  const chips = document.createElement('div');
  chips.className = 'conditions';
  for (const situation of SITUATIONS) {
    const on = hasCondition(state, situation.key);
    if (!on && !showConditions) continue;
    const button = document.createElement('button');
    button.className = on ? 'cond on' : 'cond';
    button.textContent = `${situation.label} ${formatMod(situation.value)}`;
    button.title = situation.note;
    button.addEventListener('click', () => change(toggleCondition(state, situation.key)));
    chips.append(button);
  }
  if (chips.childElementCount) controls.append(chips);

  return group;
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
    // Situational modifiers ride along with the wound penalty, since the
    // character is still standing in whatever the Marshal called.
    const mods = rollBreakdown(before);
    const { expression, explained } = rollAttr(sheet, 'vigor', mods.total);
    const total = totalOf(explained) ?? 0;
    const removed = Math.min(soakedWounds(total), wounds);

    const next = soak(state, total, wounds);
    await updateTokenState(tokenId, () => next);
    if (removed >= wounds) lastDamage.delete(tokenId);
    else lastDamage.set(tokenId, wounds - removed);

    publishTrait(
      sheet,
      'Soak',
      {
        expression,
        explained: `${explained} — ${removed === 0 ? 'no wounds soaked' : `soaked ${removed} of ${wounds}`}`,
      },
      mods,
    );
    await refreshTokens();
  } catch (error) {
    notify(error instanceof NoBenniesError ? `${sheet.name} has no Bennies left` : describe(error));
  }
}

/**
 * Spend a Benny, and carry out what it bought.
 *
 * Two of these did nothing but write a log line: "Remove Shaken" left the
 * character Shaken, and "Draw a new Action Card" left them on the same card.
 * Spending a resource and having nothing happen is worse than not offering it.
 */
async function spendBenny(sheet: Sheet, use: string): Promise<void> {
  const active = activeToken(sheet);

  // Soak has its own button, because it needs to know what hit you. Route the
  // menu entry to it rather than charging twice for one Benny.
  if (use === 'Soak Rolls') {
    const wounds = active ? (lastDamage.get(active.token.id) ?? 0) : 0;
    if (active && wounds > 0) return attemptSoak(sheet, active.token.id, active.state, wounds);
    notify('Nothing to Soak — apply some damage first');
    return;
  }

  try {
    const left = await bank.spend(sheet.id, use);
    bennies.set(sheet.id, left);

    let effect = '';
    if (use === 'Remove Shaken' && active) {
      if (!active.state.shaken) {
        effect = ' (was not Shaken)';
      } else {
        await updateTokenState(active.token.id, (state) => setShaken(state, false));
        effect = ' — no longer Shaken';
      }
    }

    if (use === 'Draw a new Action Card' && active) {
      effect = await redrawCard(active.token.id, sheet);
    }

    publish({
      ...named(sheet),
      label: 'spends a Benny',
      expression: 'benny',
      explained: `${use}${effect} — **${left}** left`,
    });
    await refreshTokens();
  } catch (error) {
    notify(error instanceof NoBenniesError ? `${sheet.name} has no Bennies left` : describe(error));
  }
}

/**
 * Deal this combatant a replacement Action Card from the same deck the round was
 * dealt from, so the card cannot come out twice.
 */
async function redrawCard(tokenId: string, sheet: Sheet): Promise<string> {
  const state = initiative ?? (await freshInitiative());
  const result = dealRound(
    state,
    [{ tokenId, edges: initiativeEdges(sheet) }],
    new JavaRandom(),
  );
  const draw = result.draws.get(tokenId);
  if (!draw) return ' — the deck is empty';

  await setCards(new Map([[tokenId, draw.card]]));
  await writeInitiative(result.state);
  // Redrawing is not a new round; keep the round number where it was.
  initiative = { ...result.state, round: state.round };
  await writeInitiative(initiative);
  return ` — now on ${cardLabel(draw.card)}`;
}

async function awardBenny(sheet: Sheet): Promise<void> {
  const total = await bank.award(sheet.id);
  bennies.set(sheet.id, total);
  renderSheetArea();
  publish({
    ...named(sheet),
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
  const found = sheets.find((s) => s.id === selectedId);
  const sheet = maySee(found) ? found : undefined;
  if (!sheet) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = found
      ? "That character is the Marshal's."
      : 'No characters yet. Import an archetype card to start.';
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

  if (sheet.description) {
    const description = document.createElement('p');
    description.className = 'description';
    description.textContent = sheet.description;
    sheetEl.append(description);
  }

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

  // One breakdown for the whole sheet: the label a button shows and the roll it
  // makes are the same number by construction, and the log gets the itemisation.
  const mods = modsFor(sheet);
  const penalty = mods.total;

  /**
   * `d6-1+2` — the die, then the character's own modifier, then wounds in red
   * and the Marshal's call in green.
   *
   * Kept as three terms rather than summed because "d6-5" tells you the answer
   * and hides the question. The colours are the same two used on the pips, the
   * chips and the log.
   */
  const dieLabel = (base: string, mod: number | undefined): HTMLElement => {
    const wrap = document.createElement('span');
    wrap.className = 'die';
    const own = document.createElement('span');
    own.textContent = `${base}${formatMod(mod ?? 0)}`;
    wrap.append(own);
    if (mods.status) {
      const red = document.createElement('span');
      red.className = 'mod-status';
      red.textContent = formatMod(mods.status);
      red.title = describeMods(mods.parts.filter((part) => part.kind === 'status'));
      wrap.append(red);
    }
    if (mods.situational) {
      const green = document.createElement('span');
      green.className = 'mod-situational';
      green.textContent = formatMod(mods.situational);
      green.title = describeMods(mods.parts.filter((part) => part.kind === 'situational'));
      wrap.append(green);
    }
    return wrap;
  };

  sheetEl.append(section('Attributes'));
  const attributes = document.createElement('div');
  attributes.className = 'traits';
  for (const attribute of ATTRIBUTES) {
    const trait = sheet.attributes[attribute];
    if (!trait) continue;
    const label = attribute[0]!.toUpperCase() + attribute.slice(1);
    attributes.append(
      traitButton(label, dieLabel(`d${trait.die}`, trait.mod), false, () => {
        publishTrait(sheet, label, rollAttribute(sheet, attribute as Attribute, penalty), mods);
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
        trait ? dieLabel(`d${trait.die}`, trait.mod) : dieLabel('d4', -2),
        !trait,
        () => publishTrait(sheet, skill, rollSkill(sheet, skill, penalty), mods),
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
    // No count: it pushed this one button onto two lines, and the number is not
    // something anyone acts on — the roll is the same either way.
    label.textContent = 'Untrained';
    rest.append(label, dieLabel('d4', -2));
    rest.title = `Roll d4−2 for any of the ${untrained.length} untrained skills`;
    rest.addEventListener('click', () =>
      publishTrait(
        sheet,
        'untrained skill',
        rollTrait({ die: 4, mod: -2 + penalty, wildCard: sheet.wildCard }, new JavaRandom()),
        mods,
      ),
    );
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
  renderGear(sheet, mods);

  if (sheet.advances) {
    const p = document.createElement('p');
    p.className = 'prose';
    p.textContent = sheet.advances;
    sheetEl.append(section('Advances'), p);
  }

  // Which token this is: reference, consulted when something looks wrong, so it
  // sits at the foot rather than taking a line at the top of every sheet.
  const bind = bindBar(sheet);
  if (bind) sheetEl.append(bind);
}

/**
 * Gear as a weapons table plus a bulleted list, rather than the card's one long
 * sentence. Damage is a button: a weapon's damage is the roll you make right
 * after the attack that the sheet already rolls for you.
 */
function renderGear(sheet: Sheet, mods: RollBreakdown): void {
  const penalty = mods.total;
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
      attack.title = `Roll ${skill}${mods.parts.length ? ` (${describeMods(mods.parts)})` : ''}`;
      attack.addEventListener('click', () =>
        publishTrait(sheet, `${weapon.name} — ${skill}`, rollSkill(sheet, skill, penalty), mods),
      );
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
          rollFreeform(expression, `${weapon.name} damage`, rollerName(sheet), weapon.ap),
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


/**
 * The characters this client may look at.
 *
 * A guard rail, not a permission: room metadata is readable by every client, so
 * a private sheet is out of the way rather than out of reach. That is the right
 * level for a table where everyone is trusted — it stops a player idly scrolling
 * past the Landshark's Toughness, and it does not pretend to be more.
 */
function visibleSheets(): Sheet[] {
  return isGM ? sheets : sheets.filter((sheet) => !sheet.private);
}

function maySee(sheet: Sheet | undefined): boolean {
  return sheet !== undefined && (isGM || !sheet.private);
}

function renderRoster(): void {
  const shown = visibleSheets();
  bar.who.replaceChildren(
    ...shown.map((sheet) => {
      const option = document.createElement('option');
      option.value = sheet.id;
      option.textContent = sheet.private ? `${sheet.name} (GM)` : sheet.name;
      option.selected = sheet.id === selectedId;
      return option;
    }),
  );
  bar.who.disabled = shown.length === 0;
}

const MINE_PREFIX = 'com.savagebot/mine/';

/**
 * Remember which character a player was looking at, so the panel opens on their
 * own sheet instead of whoever sorts first.
 *
 * Kept in room metadata under the player's id rather than in player metadata,
 * which does not survive a tab close (measured, milestone 0). Only players are
 * tracked: the GM moves between every sheet at the table, so restoring their
 * last one would be noise.
 */
async function rememberMine(): Promise<void> {
  if (isGM || !selectedId) return;
  try {
    await store.write(`${MINE_PREFIX}${OBR.player.id}`, selectedId);
  } catch {
    // Not worth interrupting anyone over; it is a convenience.
  }
}

async function myCharacter(): Promise<string | undefined> {
  if (isGM) return undefined;
  const id = await store.read<string>(`${MINE_PREFIX}${OBR.player.id}`);
  return typeof id === 'string' ? id : undefined;
}

async function reload(): Promise<void> {
  sheets = await roster.listFull();
  bennies = await bank.all();
  const mySheets = visibleSheets();
  if (!mySheets.some((s) => s.id === selectedId)) {
    const mine = await myCharacter();
    selectedId =
      (mine && mySheets.some((s) => s.id === mine) ? mine : undefined) ?? mySheets[0]?.id;
  }
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
    ...named(target.sheet),
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
  isGM = (await OBR.player.getRole()) === 'GM';
  // A guard rail, not a permission: any client could still write these keys.
  // What it prevents is a player hitting "New session" by accident and wiping
  // the party's Bennies, which has no undo.
  el('tab-table').hidden = !isGM;
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
    void rememberMine();
    renderSheetArea();
  });
  el('edit').addEventListener('click', () => setEditing(!editing));
  el('tab-sheet').addEventListener('click', () => setTab('sheet'));
  el('tab-initiative').addEventListener('click', () => setTab('initiative'));
  el('tab-table').addEventListener('click', () => setTab('table'));
  OBR.scene.onMetadataChange(() => {
    void readInitiative().then((state) => {
      initiative = state;
      renderSheetArea();
    });
  });

  bar.file.addEventListener('change', () => {
    if (bar.file.files?.length) void importFiles(bar.file.files);
    bar.file.value = '';
  });

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
