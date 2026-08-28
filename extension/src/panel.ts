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
  diceColourOf,
  skillNames,
  type Attribute,
  type Sheet,
} from '../../src/rules/sheet.js';
import {
  abilityNotes,
  describeNote,
  notesForTrait,
  type AbilityNote,
} from '../../src/rules/abilities.js';
import {
  skillCanStray,
  spraysLead,
  strayShots,
  strayThreshold,
  strayWarning,
  STRAY_ON_MISS,
} from '../../src/rules/bystanders.js';
import { parseArchetypeCards } from '../../src/rules/importArchetypeCard.js';
import {
  damageDiceOptions,
  damageExpression,
  isRollableDamage,
  parseGear,
  weaponSkill,
  type Weapon,
} from '../../src/rules/gear.js';
import { CommandContext } from '../../src/dice/evaluator.js';
import { RollInterpreter } from '../../src/dice/interpreter.js';
import { runningDie, runningExpression } from '../../src/rules/running.js';
import { JavaRandom } from '../../src/dice/javaRandom.js';
import { parse } from '../../src/dice/parser.js';
import { rollAttribute, rollSkill, totalsOf } from '../../src/rules/traitRoll.js';
import { Roster, type Scope } from '../../src/obr/roster.js';
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
import {
  adjustedDamage,
  applyDamage,
  describeAdjustment,
  effectiveToughness,
  type DamageAdjustment,
} from '../../src/rules/damage.js';
import {
  attackKind,
  bandFor,
  BAND_PENALTY,
  DEFAULT_PARRY,
  formatCells,
  measuredCells,
  showsParry,
  targetNumber,
  FLAT_TARGET,
  isTargeted,
  parseRangeBands,
  resolveAimedAttack,
  verdictIsMeaningless,
  withoutFlatVerdict,
  type Band,
  type RangeBands,
} from '../../src/rules/targeting.js';
import {
  SCALES,
  VITALS_DAMAGE,
  COVER,
  SLUG_DAMAGE,
  asRollMods,
  bakesModifiers,
  bulletsLeft as spareBullets,
  negatesRecoil,
  calledShotDamage,
  describeAmendment,
  firesBuckshot,
  maxRateOfFire,
  reachesExtreme,
  shotTotal,
  shotsFired as shotsOf,
  shotgunDamage,
  shotgunMod,
  straysAsFired,
  type Aim,
  type ShotMod,
  type ShotTotal,
} from '../../src/rules/shot.js';
import { newCharacter, pruneEmptyEntries } from '../../src/rules/sheetEdit.js';
import { parseStatBlocks } from '../../src/rules/statBlock.js';
import {
  BESTIARY_SOURCE,
  COFFIN_ROCK,
  COFFIN_ROCK_SOURCE,
  SAVAGE_FREE_BESTIARY,
  creatureSheet,
  findCreature,
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
  woundLimit,
  rollBreakdown,
  setFatigue,
  setShaken,
  setWounds,
  traitPenalty,
  type RollBreakdown,
} from '../../src/rules/status.js';
import { localName, mapName, wireName } from '../../src/rules/naming.js';
import {
  MANUAL_RANGE,
  SITUATIONS,
  clearModifiers,
  describeMods,
  formatMod,
  hasCondition,
  setManualMod,
  situationalMods,
  situationalTotal,
  situationsOf,
  targetPills,
  targetTotal,
  toggleCondition,
  type ModifierState,
} from '../../src/rules/modifiers.js';
import { findEntry } from '../../src/rules/catalogue.js';
import { addToHand, chooseFromHand, handOf } from '../../src/rules/hand.js';
import { renderBadges } from './badges.js';
import { MARSHAL_BENNIES, BennyBank, type BennyOutcome } from '../../src/obr/bennyBank.js';
import { BENNY_USES, NoBenniesError } from '../../src/rules/bennies.js';
import { soak, soakedWounds } from '../../src/rules/damage.js';
import { rollAttribute as rollAttr, rollTrait } from '../../src/rules/traitRoll.js';
import { renderEditor } from './editor.js';
import {
  combatants,
  displayName,
  gangCard,
  renderHand,
  renderInitiative,
} from './initiativePanel.js';
import {
  compareNames,
  dealRound,
  initiativeEdges,
  NO_EDGES,
  type Draw,
  type InitiativeState,
} from '../../src/rules/initiative.js';
import { cardLabel, splitRedSuits, type Card } from '../../src/game/cards.js';
import {
  autoBind,
  bindToken,
  characterTokens,
  freshInitiative,
  readInitiative,
  resetAllTokens,
  roomStore,
  roster as characterRoster,
  setHands,
  unbindToken,
  updateTokenState,
  writeInitiative,
} from './backends.js';

import {
  DICE_CHANNEL,
  DICE_SETTLED_CHANNEL,
  MAX_DICE,
  REVEAL_CAP_MS,
  TRAY_MODAL_ID,
  isDiceThrow,
  revealDelay,
  type DiceThrow,
} from '../../src/obr/diceThrow.js';
import {
  DICE_PREFIX,
  PLACE_PREFIX,
  assignPlaces,
  ringSize,
  storedPlaces,
  type Seated,
} from '../../src/obr/seats.js';
import type { DieEvent } from '../../src/dice/roller.js';

/**
 * Look up an element by id.
 *
 * It throws rather than casting a `null` into an `HTMLElement`, which is what the
 * `as T` alone used to do: removing a button from `index.html` and forgetting its
 * listener here typechecked, then failed at load with `Cannot read properties of
 * null` and no clue which element — and because it happened in the middle of
 * `onReady`, it took the roster with it. A named error is the difference between a
 * two-minute fix and a panel that looks like it lost your characters.
 */
const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`panel is missing #${id}`);
  return found as T;
};
const bar = {
  who: el<HTMLSelectElement>('who'),
  file: el<HTMLInputElement>('file'),
  bind: el<HTMLButtonElement>('bind'),
};
const sheetEl = el('sheet');
const logEl = el('log');
const noticeEl = el('notice');
const budgetEl = el('budget');

let roster: Roster;
let bank: BennyBank;
let bennies = new Map<string, number>();
/**
 * The last trait roll each character made, so a Benny can buy it again.
 *
 * The request, not the result — see `publishTrait`. In memory and not in the
 * store: rerolling a trait is something you do in the seconds after seeing the
 * dice, and a stale one surviving a reload would offer to reroll something
 * nobody remembers.
 */
/**
 * The framing that makes a roll an *attack* rather than a number.
 *
 * One named type rather than two structural literals, because it is stored on
 * `LastTrait` and handed back to `publishTrait` by the Benny reroll. Written out
 * twice, the two drifted immediately: `strayOn` was added to the parameter and
 * not to the stored copy, which typechecks — structural assignment does not
 * complain about an extra property on a variable — and works only because the
 * object is stored by reference. A rename or a spread would have quietly lost it,
 * and a scattergun reroll would have narrowed from 1–2 back to 1 with nothing to
 * see.
 */
interface AimedRoll {
  skill: string;
  bands?: [number, number, number];
  /** The die value at or under which this weapon endangers bystanders. */
  strayOn?: number;
  /**
   * The declared target's name, for a roll made through the shot panel.
   *
   * Its presence suppresses the log line's targeting table, because the range and
   * the cover that table would apply are already inside this total. See
   * `RollEntry.target`.
   */
  target?: string;
}

interface LastTrait {
  label: string;
  expression: string;
  mods: RollBreakdown;
  aimed?: AimedRoll;
}
const lastTraitRoll = new Map<string, LastTrait>();
let store = roomStore();
let sheets: Sheet[] = [];
/**
 * The character this client has claimed as theirs, for a player. Undefined for
 * the Marshal, and for a player who has not settled on one yet.
 *
 * Cached because rendering is synchronous and `myCharacter` is a store read.
 */
let mineId: string | undefined;
/** Character id -> which document holds them. Rebuilt by `reload`. */
let scopes = new Map<string, Scope | undefined>();
let selectedId: string | undefined;

const log = new RollLog();
/**
 * Which log entries have their targeting table open, by entry id.
 *
 * Module state rather than DOM state because `renderLog` replaces the whole list,
 * and it is called on every selection change and every incoming roll — which in a
 * fight is constantly. An expansion kept in the DOM would vanish the moment
 * anybody clicked a token.
 */
const expanded = new Set<string>();
let me = 'someone';
/** Set only for the duration of one roll, by the Secret button. */
let secretRolls = false;
let editing = false;
type Tab = 'sheet' | 'initiative' | 'table';
let tab: Tab = 'sheet';
let isGM = false;
let initiative: InitiativeState | undefined;
/** What each token drew this round, so the panel can show the discarded cards. */
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

// ------------------------------------------------------- animated dice
/**
 * Whether *this* reader wants the animation. Not a property of a roll: whoever rolls
 * always sends their dice, and each person at the table decides for themselves
 * whether to watch them.
 */
let animate = false;
/**
 * My chair at the table. Not a screen direction: every viewer draws me relative to
 * themselves, so which edge my dice arrive at is different on every screen.
 */
let myPlace = 0;
/** Everyone in the room. */
let party: Seated[] = [];
/** Their places, as last worked out. Nobody picks these. */
let places: Record<string, number> = {};
/**
 * Lines whose dice are still in the air, and the timer that will print them anyway.
 *
 * A held line is in the log already — `renderLog` skips it — so nothing about the
 * result depends on the tray: the timer prints it whatever happens, and the tray
 * saying "settled" only ever makes that happen sooner.
 */
const held = new Map<string, ReturnType<typeof setTimeout>>();

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
/** @returns the id of the entry, so a caller can amend it later. */
function publish(
  partial: Omit<RollEntry, 'id' | 'at' | 'by'>,
  dice: DieEvent[] = [],
  colour?: string,
): string {
  const total = partial.total ?? totalOf(partial.explained);
  // Over the cap there is no animation: `20d20!` is a legal expression and an
  // unwatchable throw, and a locked-up tab is worse than an unanimated result.
  const throwable = dice.length > 0 && dice.length <= MAX_DICE;
  const entry: RollEntry = {
    ...partial,
    id: newRollId(),
    at: Date.now(),
    by: me,
    ...(total === undefined ? {} : { total }),
    ...(throwable ? { animated: true } : {}),
    ...(secretRolls ? { secret: true } : {}),
  };
  log.add(entry);
  if (throwable) void sendDice(entry, dice, colour);
  // Our own dice are in hand, so the hold can be the length of the throw straight
  // away rather than the six-second backstop a remote line starts on.
  // Ours, so it may take the log's attention. A remote roll goes through `show`
  // without this and leaves whatever is open alone.
  focusLatest(entry);
  show(entry, dice);
  if (!entry.secret) {
    // REMOTE: everyone but us, since we have already added it ourselves.
    void OBR.broadcast
      .sendMessage(ROLL_CHANNEL, forBroadcast(entry), { destination: 'REMOTE' })
      .catch((error: unknown) => notify(`could not share that roll: ${describe(error)}`));
  }
  return entry.id;
}

/**
 * Send the dice to the trays.
 *
 * `ALL` rather than `REMOTE`, unlike the log line: the roller's own tray is a
 * different iframe from this one and needs the message too — which is the whole
 * reason dice do not ride along on `RollEntry`. A secret roll goes `LOCAL`, so the
 * Marshal's hidden roll throws dice on the Marshal's screen and nobody else's.
 */
async function sendDice(entry: RollEntry, dice: DieEvent[], colour?: string): Promise<void> {
  // The character's colour where there is a character, and the player's own where
  // there is not — a table roll typed into the box belongs to whoever typed it.
  const paint = colour ?? myColour;
  const thrown: DiceThrow = {
    id: entry.id,
    dice,
    // Where I sit, not where my dice should appear: only the reader can work that
    // out, because only the reader knows where *they* sit.
    place: myPlace,
    places: ringSize({ ...places, [OBR.player.id]: myPlace }),
    ...(paint ? { colour: paint } : {}),
  };
  try {
    // Only opened when it is wanted: a reader with animation off never loads the
    // renderer at all, and the overlay tears itself down when the table goes quiet.
    if (animate) await openTray();
    await OBR.broadcast.sendMessage(DICE_CHANNEL, thrown, {
      destination: entry.secret ? 'LOCAL' : 'ALL',
    });
  } catch (error) {
    // A roll must never fail because the dice could not be drawn.
    console.warn('could not send dice', error);
  }
}

/**
 * Put a line in the log — now, or when this reader's dice have landed.
 *
 * Holding it back is the point of the animation: a line that says `= **8**` while
 * the dice are still tumbling has already given away the ending, and the staged ace
 * is then a re-enactment of something you have read. Anyone with animation off, and
 * any roll with no dice in it, prints immediately.
 */
/**
 * Open the targets on something *this* client just did, and close everything
 * else.
 *
 * A roll that has a targeting table is a roll you made in order to read that
 * table — the attack you just swung, the damage you just rolled — so making it
 * arrive open saves the click that was always going to follow. And only one is
 * ever wanted at a time: a log of five open tables is one you have to scroll
 * past to find the roll you are working on.
 *
 * **Only ever called for our own rolls.** Somebody else's roll must not shut a
 * table we are reading: the Marshal expands a damage roll, is halfway through
 * deciding which of six mooks it lands on, and a player rolls Notice at the
 * wrong moment — the table would close under them, and the roll that closed it
 * was not even theirs. So this lives in `publish` rather than in `show`, which
 * the broadcast handler also goes through.
 *
 * Safe to call before the dice have landed. A held entry is filtered out of the
 * log entirely (see `renderLog`), so nothing is drawn — and by the time it is
 * revealed its id is already in the set, so it appears open.
 */
function focusLatest(entry: RollEntry): void {
  expanded.clear();
  if (targetsWorthShowing(entry)) expanded.add(entry.id);
}

function show(entry: RollEntry, dice?: DieEvent[]): void {
  if (animate && entry.animated) {
    // A fallback, not the mechanism: the tray's own "settled" normally gets here
    // first. This is what covers a tray that was never opened, was torn down for
    // idleness, or has quietly died.
    //
    // With the dice to hand — always true of our own roll — the wait is roughly how
    // long the throw takes. Without them it is the flat backstop until the dice
    // arrive on their own channel and shorten it.
    held.set(
      entry.id,
      setTimeout(() => reveal(entry.id), dice ? revealDelay(dice) : REVEAL_CAP_MS),
    );
  }
  renderLog();
}

function reveal(id: string): void {
  const timer = held.get(id);
  if (timer === undefined) return;
  clearTimeout(timer);
  held.delete(id);
  renderLog();
  // The sheet as well as the log: the shot panel holds its verdict for the same
  // dice, so revealing one without the other would put the answer on screen in
  // the place the player is already looking while the log still waited.
  render();
}

/**
 * The name a roll goes out under.
 *
 * An NPC does not broadcast its character's name: the roll would otherwise
 * announce exactly what the Marshal is keeping back, and unlike the picker
 * nobody has to go looking for it — it arrives in everyone's log. The token's
 * name goes instead, which the players can already read off the map.
 */
function rollerName(sheet: Sheet): string | undefined {
  if (sheet.pc) return sheet.name;
  const token = activeToken(sheet)?.token;
  return token ? mapName(token) : undefined;
}

/**
 * The character a *typed* roll should be logged as, if any.
 *
 * Damian's report: clicking an attribute logs the character, while `s8` in the
 * box logs the Owlbear player name. Paul's own reservation about fixing it is the
 * reason for every condition below — attributing a freeform roll to whoever
 * happens to be selected is easy to get wrong, and a wrong name in the log is
 * worse than a boring one.
 *
 * So it is deliberately narrow. The character must be **on screen** — the sheet
 * tab, where the picker naming them is visible two inches above the box being
 * typed into — and must be one this client is acting for. A player with somebody
 * else's sheet open, or anyone on the initiative or table tab, gets their own
 * name as before.
 *
 * `rollerName` does the wire-safe part: a PC by name, an NPC by its token's map
 * label, and nothing at all for an NPC with no token. A Marshal's private name
 * for a creature never reaches the log this way.
 */
function typedRollName(): string | undefined {
  if (tab !== 'sheet') return undefined;
  const sheet = sheets.find((s) => s.id === selectedId);
  if (!sheet || !maySee(sheet)) return undefined;
  if (!isGM && mineId !== undefined && sheet.id !== mineId) return undefined;
  return rollerName(sheet);
}

/** `{ character }` for a published line, absent for an NPC with no token. */
/**
 * Whether a roll about this sheet should stay on this client.
 *
 * A token the players cannot see must not put its name in their log. This began
 * life inside `applyDamage`, whose comment made the case well — *"'Robed Figure
 * takes damage' is the ambush introducing itself"* — and then stayed there,
 * applying to exactly one of the two dozen calls that name a character. Damian
 * found the gap from the other side: *"is it deliberate that NPCs that are 'Out'
 * of the fight and whose tokens are hidden still broadcast their rolls?"*
 *
 * "Out" is incidental — hidden is the part that matters, and downed NPCs are
 * simply the ones most often hidden.
 *
 * Only NPCs can trip it. A PC is named by `rollerName` from the sheet whatever
 * their token is doing, and a player whose own token is briefly off the map
 * should still see their own rolls shared.
 */
function hiddenOnMap(sheet: Sheet): boolean {
  if (sheet.pc) return false;
  return activeToken(sheet)?.token.visible === false;
}

/**
 * The character a roll is about, and whether saying so would give them away.
 *
 * Returned together on purpose. These are two answers to one question — "may the
 * table be told about this character?" — and every call site that spreads this
 * gets the second for free. Keeping them apart is what let the rule sit on one
 * call site for months.
 */
function named(sheet: Sheet): { character?: string; secret?: true } {
  const who = rollerName(sheet);
  return {
    ...(who ? { character: who } : {}),
    ...(hiddenOnMap(sheet) ? { secret: true as const } : {}),
  };
}

/**
 * Publish a roll made off a sheet, with its modifier breakdown attached.
 *
 * Every trait roll arrives here carrying its own dice, so animation needs no
 * separate wiring per call site — a Shooting roll, a Soak and an untrained d4−2 all
 * come through `TraitRollResult`.
 */
function publishTrait(
  sheet: Sheet,
  label: string,
  result: { expression: string; explained: string; dice?: DieEvent[] },
  mods: RollBreakdown,
  // Only for an attack. Lets any client work the roll out against a named target
  // instead of against the flat 4 the dice engine assumes — see `targeting.ts`.
  aimed?: AimedRoll,
  /** Set when this *is* a reroll, so it does not overwrite what it is redoing. */
  isReroll = false,
): string {
  const from = activeToken(sheet)?.token.id;
  // Every trait roll off a sheet comes through here, which is what makes this the
  // one honest place to remember "the last one". A Benny reroll needs the whole
  // request rather than the result: the same expression, the same modifier
  // breakdown, and the same target framing, or the second roll would quietly be
  // a different roll.
  if (!isReroll) {
    lastTraitRoll.set(sheet.id, {
      label,
      expression: result.expression,
      mods,
      ...(aimed ? { aimed } : {}),
    });
  }
  // Counted here rather than at each call site, so a Benny reroll re-counts its
  // *own* dice against the same weapon's window — the threshold belongs to the
  // gun and rides on `aimed`, the count belongs to the dice and does not.
  const strayOn = skillCanStray(aimed?.skill) ? (aimed?.strayOn ?? STRAY_ON_MISS) : undefined;
  const stray = strayOn === undefined ? 0 : strayShots(result.dice ?? [], strayOn);

  return publish(
    {
      // `named`, not `who` alone: it carries the "hidden on the map" screen too.
      ...named(sheet),
      label,
      expression: result.expression,
      // A Fighting roll's verdict belongs to the targeting table, which knows
      // what it was aimed at — the engine's "(success; 1 raise)" is against a
      // flat 4 and would contradict it. Everything else keeps its verdict,
      // including Shooting: 4 is the right number there unless the shot is into
      // melee. See `verdictIsMeaningless`.
      // The panel that named a target also resolved the roll, and its answer is
      // the one that counts — the engine's is against a flat 4 on a total that
      // may not have had the range taken out of it yet.
      explained: verdictIsMeaningless(aimed?.skill, aimed?.target !== undefined)
        ? withoutFlatVerdict(result.explained)
        : result.explained,
      ...(mods.parts.length ? { mods: mods.parts } : {}),
      ...(aimed ? { skill: aimed.skill } : {}),
      ...(aimed?.bands ? { bands: aimed.bands } : {}),
      ...(aimed?.target ? { target: aimed.target } : {}),
      ...(stray && strayOn !== undefined ? { stray, strayOn } : {}),
      ...(aimed && from ? { from } : {}),
    },
    result.dice ?? [],
    diceColourOf(sheet),
  );
}

/**
 * The engine returns Discord markdown (`**8**`). Render the bold rather than
 * showing the asterisks, and via textContent rather than innerHTML — these
 * strings arrive from other clients.
 */
function renderLog(): void {
  logEl.replaceChildren(
    ...log
      // Amendments are folded into the line they correct rather than drawn as
      // lines of their own — one line on screen, the whole history underneath.
      // See `RollEntry.amends`.
      .roots()
      // Held lines are in the log but not yet on screen — their dice are still in
      // the air. See `show`.
      .filter((entry) => !held.has(entry.id))
      .map((entry) => {
      const line = document.createElement('div');
      line.className = 'entry';
      if (entry.secret) line.classList.add('secret');

      // The version that currently stands. For a roll nobody corrected this is
      // the roll itself; for a shot the Marshal amended it is the corrected one.
      // Everything that reads a *number* off the line uses it, because applying
      // the pre-Aim damage of a shot that was Aimed is exactly the quiet
      // wrongness the amendment mechanism exists to prevent.
      const current = log.latest(entry.id) ?? entry;
      const amendments = log.amendmentsOf(entry.id);

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

      // Named here because the targeting table is not offered for these rolls —
      // the answer is already known, so it is text rather than a thing to expand.
      if (entry.target) {
        const at = document.createElement('span');
        at.className = 'at-target';
        at.textContent = `\u2192 ${entry.target}`;
        at.title = 'Declared before the roll — range and cover are already in the total';
        head.append(at);
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
        const bold = i % 2 === 1;
        // Split again on the suit symbols. The log is assembled as text, so a
        // heart in an initiative line came out the same black as the words around
        // it while the turn order two panes up showed it red — reported
        // 2026-08-27. A line with no cards in it is one run and costs one span,
        // exactly as before.
        for (const run of splitRedSuits(part)) {
          const span = document.createElement('span');
          span.textContent = run.text;
          const classes = [bold ? 'total' : '', run.red ? 'suit-red' : ''].filter(Boolean);
          if (classes.length) span.className = classes.join(' ');
          body.append(span);
        }
      }

      if (entry.ap) {
        const ap = document.createElement('span');
        ap.className = 'ap';
        ap.textContent = ` AP ${entry.ap}`;
        ap.title = `Ignores ${entry.ap} point(s) of armour`;
        body.append(ap);
      }

      // Not for a roll the shot panel made. That panel declared its target before
      // the dice were thrown and carries its own Apply for it; a second button
      // here spends the same damage on whatever happens to be *selected*, which
      // is a different creature as often as not.
      const target = damageTarget();
      if (target && isApplicable(current) && current.target === undefined) {
        const apply = document.createElement('button');
        apply.className = 'apply';
        apply.textContent = `\u2192 ${rollerName(target.sheet) ?? mapName(target.token)}`;
        apply.title =
          `Apply ${current.total} damage to ${mapName(target.token)}` +
          (current.ap ? `, ignoring ${current.ap} armour` : '');
        apply.addEventListener('click', () => void applyToTarget(current, target));
        body.append(apply);
      }
      line.append(body);

      // Each correction on its own row beneath the roll, oldest first, so the
      // sequence reads forwards: what was rolled, then what someone remembered,
      // then what it came to.
      for (const amendment of amendments) {
        const row = document.createElement('div');
        row.className = 'amendment';
        const arrow = document.createElement('span');
        arrow.className = 'amendment-total';
        // A correction to a shot at several targets has no single new total to
        // print — its values are raw and the panel applies each target's own
        // modifiers to its own shot. A bare arrow pointing at nothing read as a
        // correction that had failed.
        arrow.textContent = amendment.total === undefined ? '\u00b7' : `\u2192 ${amendment.total}`;
        row.append(arrow);
        const why = document.createElement('span');
        why.className = 'amendment-why';
        why.textContent = amendment.label ?? 'amended';
        why.title = `${amendment.by} changed this after the roll \u2014 the dice were not re-rolled`;
        row.append(why);
        line.append(row);
      }

      // Who could this have been aimed at? Only for the rolls where naming a
      // target changes the answer: an attack, which is resolved against Parry
      // rather than a flat 4, and a damage roll, which is resolved against
      // Toughness. Everything else keeps the one line it always had.
      // A raise is worth +1d6 damage, and you only learn you got one after the
      // damage is rolled — so it is offered on the line rather than asked for up
      // front. Damage rolls only: a raise on a Notice roll buys information, not
      // dice.
      // Not for a roll the shot panel made: it puts the raise die into the damage
      // expression itself, from the raises it worked out, and two ways to add the
      // same d6 is one way to add it twice.
      if (isApplicable(current) && current.target === undefined) {
        const raise = document.createElement('button');
        raise.className = 'targets-toggle';
        raise.textContent = '+ raise';
        raise.title = `Roll the raise's bonus ${RAISE_DIE} and log the new total`;
        raise.addEventListener('click', () => rollRaiseDamage(current));
        body.append(raise);
      }

      if (targetsWorthShowing(current)) {
        const toggle = document.createElement('button');
        toggle.className = 'targets-toggle';
        const open = expanded.has(entry.id);
        toggle.textContent = open ? 'Hide targets' : 'Targets';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.addEventListener('click', () => {
          if (expanded.has(entry.id)) expanded.delete(entry.id);
          else expanded.add(entry.id);
          renderLog();
        });
        body.append(toggle);

        if (open) {
          const holder = document.createElement('div');
          holder.className = 'targets';
          holder.textContent = 'measuring…';
          line.append(holder);
          // Ranges come from OBR and so arrive late. By the time they do the log
          // may have been re-rendered out from under this node, which is why the
          // fill checks it is still in the document rather than resuming blind.
          void fillTargets(holder, current);
        }
      }
      return line;
    }),
  );
}

/**
 * An attack or a damage roll, made by a token we can measure from — and one that
 * has *not* already said what it was aimed at.
 *
 * A roll carrying `target` arrived from the shot panel with range, cover and the
 * defender's conditions already inside its total. Showing the table beside it
 * would apply every one of them a second time. See `RollEntry.target`.
 */
function targetsWorthShowing(entry: RollEntry): boolean {
  if (entry.target !== undefined) return false;
  return isTargeted(entry.skill) || (entry.applicable === true && entry.total !== undefined);
}

/** The bonus damage die a raise on the attack earns. Aces, as damage dice do. */
const RAISE_DIE = 'd6!';

/**
 * The Running die, beside Pace.
 *
 * `"A hero can choose to 'run,' increasing their Pace for the round by their
 * Running die (a d6 by default) at the cost of a −2 penalty to all actions that
 * turn. Running dice never Ace."` — p151.
 *
 * Three deliberate omissions, all the same omission really — the app rolls the
 * die and adds the Pace, and stops.
 *
 * It does **not** set the −2. That is a modifier lasting the turn, it is already
 * on the situational track as `Running`, and setting it from here would put a
 * penalty on the character that they then have to find and clear. Named in the
 * tooltip instead, one click away from where the tooltip is.
 *
 * It does not move the token, and it does not subtract the 2″ an inch of
 * climbing or swimming costs. Both are things that happen on the map, and the
 * number is the answer to "how far", not the doing of it.
 *
 * Rolled as a plain `d6`, never the savage `s6`/`e6` the rest of the sheet uses:
 * running dice do not Ace, and an exploding one would hand out the occasional
 * eleven-inch sprint that looked like luck.
 */
function runButton(sheet: Sheet, pace: number): HTMLElement {
  const die = runningDie(sheet);
  const expression = runningExpression(die);
  const button = document.createElement('button');
  button.className = 'run';
  button.textContent = expression;
  button.title =
    `Run: ${expression} added to Pace ${pace} for the round, at −2 to every action ` +
    `this turn (p151). The die never Aces.` +
    (die.why.length ? ` ${die.why.join(', ')}.` : '');
  button.addEventListener('click', () => {
    const dice: DieEvent[] = [];
    const explained = new RollInterpreter(
      new CommandContext(new JavaRandom(), (d) => dice.push(d)),
    )
      .run(parse([expression]))
      .trim();
    // Not `totalOf`: that wants `= **N**`, and the engine only writes the `=`
    // when there is arithmetic to show. A bare `d6` comes back as `d6: **4**`,
    // so `totalOf` would return undefined for the *default* running die and
    // work fine for Sir Ed's `d6-1` — which is exactly the asymmetry that
    // survives being eyeballed once.
    const bolded = [...explained.matchAll(/\*\*(-?\d+)\*\*/g)];
    const last = bolded[bolded.length - 1];
    const rolled = last ? Number(last[1]) : undefined;
    publish(
      {
        ...named(sheet),
        label: 'Running',
        expression,
        // The total the table needs is the distance, not the die — so the die is
        // shown doing its job rather than on its own. `publish` reads the bolded
        // number back out of this string when no `total` is given, so the one in
        // bold has to be the one that means something.
        explained:
          rolled === undefined
            ? explained
            : `${expression} [${rolled}] + Pace ${pace} = **${pace + rolled}**`,
        ...(rolled === undefined ? {} : { total: pace + rolled }),
      },
      dice,
    );
  });
  return button;
}

/**
 * Add a raise's bonus damage to a roll already made.
 *
 * A raise on the attack is worth an extra d6 of damage, and the attack is
 * resolved *after* the damage is rolled here — you learn whether you got the
 * raise from the targeting table, by which time the damage line is already in the
 * log. So this rolls the extra die on demand rather than asking up front, and
 * publishes a *new* entry rather than editing the old one: the original roll
 * happened, everyone saw it, and a log that rewrites itself is a log nobody can
 * follow.
 *
 * The new entry carries the same AP and origin token, so it targets and applies
 * exactly as the roll it came from.
 */
function rollRaiseDamage(entry: RollEntry): void {
  if (entry.total === undefined) return;
  const dice: DieEvent[] = [];
  const explained = new RollInterpreter(
    new CommandContext(new JavaRandom(), (die) => dice.push(die)),
  )
    .run(parse([RAISE_DIE]))
    .trim();

  const bonus = totalOf(explained);
  if (bonus === undefined) {
    notify('could not read the raise die');
    return;
  }

  publish(
    {
      ...(entry.character ? { character: entry.character } : {}),
      label: `${entry.label ?? 'damage'} + raise`,
      expression: `${entry.expression} + ${RAISE_DIE}`,
      explained: `${entry.total} + ${RAISE_DIE} [${bonus}] = **${entry.total + bonus}**`,
      total: entry.total + bonus,
      applicable: true,
      ...(entry.ap ? { ap: entry.ap } : {}),
      ...(entry.from ? { from: entry.from } : {}),
    },
    dice,
  );
}

interface TargetRow {
  tokenId: string;
  name: string;
  /** Distance in grid cells, absent when either end is not on the map. */
  cells?: number;
  band?: Band;
  /** The number the attack had to beat, for an attack roll. */
  target?: number;
  /**
   * The target's Parry, and **absent when the table has no business showing it**
   * rather than merely unknown — see `showsParry`. Left off the row rather than
   * blanked at render time, so nothing downstream can print what was withheld.
   */
  parry?: number;
  /** What the target's own conditions gave the attacker, e.g. +2 for Vulnerable. */
  bonus?: number;
  /** The rolled total after range and those conditions — what actually beat the target. */
  effective?: number;
  outOfRange?: boolean;
  pills: { letter: string; label: string; note: string; value: number }[];
  hit?: boolean;
  raises?: number;
  /** For a damage roll. */
  toughness?: number;
  outcome?: string;
  applicable?: boolean;
}

/** One thing that could be shot at, and how far away it is. */
interface Candidate {
  token: (typeof tokens)[number];
  state: NonNullable<ReturnType<typeof readBinding>>;
  sheet: Sheet;
  /** Grid cells from the origin, absent when either end is not on the map. */
  cells?: number;
}

/**
 * Everyone a shot from this token could be aimed at, measured.
 *
 * Split out of `targetRows` because the shot panel needs exactly this half and
 * needs it **before** any roll exists: the whole point of the panel is that you
 * see and pick your target before the dice are thrown. `targetRows` keeps the
 * other half — resolving one rolled total against each of them.
 *
 * The defenders' stats are looked up from the roster this client already has, so
 * nothing about the Marshal's characters travels over the broadcast. Parry,
 * Toughness and Pace are shown to everybody by decision — they are numbers the
 * table does arithmetic against all evening — but the rest of an NPC's sheet is
 * not, and must not be put on a `RollEntry` to get here.
 */
async function candidateTargets(from: string | undefined): Promise<Candidate[]> {
  // Everything bound and on the map except whoever rolled. Not "every NPC": when
  // the Marshal rolls a bandit's attack the targets are the players.
  const candidates = tokens.filter((token) => {
    if (token.id === from) return false;
    if (!token.visible) return false;
    const state = readBinding(token.metadata);
    if (!state) return false;
    // Not something parked for a later room — see `Sheet.parked`. It is on the
    // map because the Marshal prepped the whole floor at once, not because it is
    // standing in front of you.
    const sheet = sheets.find((s) => s.id === state.sheetId);
    return sheet !== undefined && !sheet.parked;
  });

  const origin = from ? tokens.find((token) => token.id === from) : undefined;
  const distances = await Promise.all(
    candidates.map(async (token) => {
      if (!origin) return undefined;
      try {
        // Quantised here, once, so that the number a row prints and the number
        // `bandFor` compares are the same number. See `measuredCells`.
        return measuredCells(await OBR.scene.grid.getDistance(origin.centre, token.centre));
      } catch {
        // A scene that closed mid-measure. The row is still worth showing
        // without its range.
        return undefined;
      }
    }),
  );

  return candidates.map((token, i) => {
    const state = readBinding(token.metadata)!;
    const cells = distances[i];
    return {
      token,
      state,
      sheet: sheets.find((s) => s.id === state.sheetId)!,
      ...(cells === undefined ? {} : { cells }),
    };
  });
}

/**
 * Everyone this roll could have been aimed at, with the arithmetic done.
 *
 * One resolve per candidate off the one rolled total — see `resolveAimedAttack`.
 */
async function targetRows(entry: RollEntry): Promise<TargetRow[]> {
  const isAttack = isTargeted(entry.skill);
  const melee = entry.skill !== undefined && attackKind(entry.skill) === 'parry';

  const rows: TargetRow[] = [];
  for (const { token, state, sheet, cells } of await candidateTargets(entry.from)) {
    const bands = entry.bands;
    const band = cells !== undefined && bands ? bandFor(cells, bands) : undefined;

    const row: TargetRow = {
      tokenId: token.id,
      name: localName(sheet, mapName(token), isGM),
      pills: targetPills(state),
      ...(cells === undefined ? {} : { cells }),
      ...(band ? { band } : {}),
    };

    if (isAttack && entry.total !== undefined) {
      // Fighting is resolved against Parry. A shot is too, but only when it is
      // into melee — which nothing here can know — so the result is worked out
      // against the usual 4 and Parry is shown beside it, leaving that judgement
      // where it already was: with the Marshal.
      const parry = sheet.parry ?? DEFAULT_PARRY;
      const target = melee ? parry : FLAT_TARGET;
      // Whether Parry is any of this table's business — see `showsParry`.
      // Range and the target's own conditions both belong to *this* pairing
      // rather than to the roll, so they are applied here — one resolve per
      // candidate off the one rolled total. See `resolveAimedAttack`.
      const bonus = targetTotal(state);
      const outcome = resolveAimedAttack({
        total: entry.total,
        target,
        ...(band ? { band } : {}),
        targetBonus: bonus,
      });
      if (showsParry(entry.skill, cells)) row.parry = parry;
      row.target = target;
      row.bonus = bonus;
      row.effective = outcome.effective;
      row.hit = outcome.hit;
      row.raises = outcome.raises;
      row.outOfRange = outcome.outOfRange;
    }

    if (entry.applicable && entry.total !== undefined) {
      // The preview is resolved through the same adjustment the Apply button
      // will use, so the row never shows one answer and commit another.
      const outcome = applyDamage(
        sheet,
        state,
        {
          damage: entry.total,
          ...(entry.ap ? { ap: entry.ap } : {}),
        },
        adjustments.get(entry.id),
      );
      row.toughness = effectiveToughness(sheet, entry.ap ?? 0);
      // The engine's own wording, so the preview and the applied line cannot
      // disagree about what happened.
      row.outcome = outcome.description.replace(/\*\*/g, '');
      row.applicable = true;
    }

    rows.push(row);
  }

  // Nearest first: the thing you are most likely to have shot at is the thing
  // you are standing next to.
  return rows.sort((a, b) => (a.cells ?? Infinity) - (b.cells ?? Infinity));
}

/**
 * The Marshal's damage adjustment, per expanded log entry.
 *
 * Keyed by entry so two damage rolls open at once do not share one — and held
 * outside the render so it survives the table being rebuilt when the adjustment
 * itself changes.
 *
 * Deliberately *not* stored on the roll or the token: it is a decision about one
 * application of one roll to one creature, it has no life after the click, and
 * anything longer-lived would be a stale −2 waiting to happen.
 */
const adjustments = new Map<string, DamageAdjustment>();

/**
 * One control that stands in for every damage rule the app does not know.
 *
 * Coffin Rock needs Hardy, Undead and Construct halving, three Immunities,
 * Invulnerable, Ethereal, Weakness (Head) and Swarm; the open bestiary adds 159
 * abilities that appear exactly once each. Rather than encode an unbounded list
 * and still be wrong for the next book, the Marshal says what happened and the
 * arithmetic travels into the log — `11 halved = 5 vs Toughness 7`, which is
 * legible without anyone having to write down why.
 *
 * Four buttons and nothing else, deliberately. There is no "no damage" button:
 * not applying damage is already spelled by not pressing Apply. There is no
 * free-text reason either — it was tried and cut, because typing one mid-fight
 * costs more session time than it saves.
 */
function adjustBar(entry: RollEntry, redraw: () => void): HTMLElement {
  const key = entry.id;
  const current = adjustments.get(key) ?? {};
  const bar = document.createElement('div');
  bar.className = 'adjust-bar';

  const label = document.createElement('span');
  label.className = 'adjust-label';
  label.textContent = 'Adjust';
  bar.append(label);

  // `exactOptionalPropertyTypes` is on, so clearing a field means writing
  // `undefined` explicitly rather than omitting it — hence the looser type here
  // and the tidy-up below.
  const set = (change: { factor?: number | undefined; delta?: number; reason?: string | undefined }): void => {
    const merged = { ...adjustments.get(key), ...change };
    // An empty adjustment is no adjustment: keeping `{factor: undefined}` around
    // would put "= 11" in the log for a roll nobody touched.
    if (merged.factor === undefined && !merged.delta && !merged.reason) {
      adjustments.delete(key);
    } else {
      const next: DamageAdjustment = {};
      if (merged.factor !== undefined) next.factor = merged.factor;
      if (merged.delta) next.delta = merged.delta;
      if (merged.reason) next.reason = merged.reason;
      adjustments.set(key, next);
    }
    redraw();
  };

  for (const [text, factor, title] of [
    ['½', 0.5, 'Half damage — piercing attacks against Undead, Construct or a Swarm'],
    ['×2', 2, 'Double damage'],
  ] as const) {
    const button = document.createElement('button');
    button.className = current.factor === factor ? 'adjust on' : 'adjust';
    button.textContent = text;
    button.title = title;
    // Clicking the active one turns it off, so there is always a way back to
    // the unmodified roll without reloading the entry.
    button.addEventListener('click', () =>
      set({ factor: current.factor === factor ? undefined : factor }),
    );
    bar.append(button);
  }

  for (const delta of [-2, 2] as const) {
    const button = document.createElement('button');
    button.className = current.delta === delta ? 'adjust on' : 'adjust';
    button.textContent = formatMod(delta);
    button.title = delta > 0 ? 'Weakness — extra damage' : 'Resistance — less damage';
    button.addEventListener('click', () => set({ delta: current.delta === delta ? 0 : delta }));
    bar.append(button);
  }

  // There was a free-text "why" box here. Removed on Paul's call: typing a
  // reason mid-fight is more work than the session can spare, and the log
  // already shows the arithmetic — "11 halved = 5" says what happened even
  // without a word for it. `DamageAdjustment.reason` stays in the rules module,
  // where it costs nothing and is there if a preset ever wants to fill it in.
  return bar;
}

async function fillTargets(holder: HTMLElement, entry: RollEntry): Promise<void> {
  const rows = await targetRows(entry);
  // Re-rendered while we were measuring: this node is no longer the one on
  // screen, and whatever replaced it has started its own fill.
  if (!holder.isConnected) return;

  if (!rows.length) {
    holder.textContent = 'Nothing bound and visible to aim at.';
    return;
  }

  const table = document.createElement('table');
  const isAttack = isTargeted(entry.skill);

  const head = document.createElement('tr');
  // `num` on the heading as well as the cells, so the label sits over the digits
  // it belongs to rather than at the far side of the column.
  const columns: [string, boolean][] = isAttack
    ? [['Target', false], ['State', false], ['Range', true], ['Parry', true], ['Result', true]]
    : [
        ['Target', false],
        ['State', false],
        ['Range', true],
        ['Tough', true],
        ['Result', true],
        ['', true],
      ];
  for (const [label, numeric] of columns) {
    const th = document.createElement('th');
    th.textContent = label;
    if (numeric) th.className = 'num';
    head.append(th);
  }
  table.append(head);

  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.band === 'over') tr.className = 'out-of-range';

    const name = document.createElement('td');
    name.className = 'who';
    name.textContent = row.name;
    tr.append(name);

    // One letter each: V, P, S. The full name and what it does are in the
    // tooltip, because a table cell this narrow can hold a letter and nothing.
    const state = document.createElement('td');
    state.className = 'state';
    for (const pill of row.pills) {
      const chip = document.createElement('span');
      chip.className = pill.value ? 'pill applied' : 'pill';
      chip.textContent = pill.letter;
      chip.title = pill.value
        ? `${pill.label} (${formatMod(pill.value)} to the attacker) — ${pill.note}`
        : `${pill.label} — ${pill.note}. Not applied: judge it yourself.`;
      state.append(chip);
    }
    tr.append(state);

    const range = document.createElement('td');
    range.className = 'num';
    if (row.cells === undefined) {
      range.textContent = '—';
      range.title = entry.from ? 'Not on this map' : 'The roller has no token on the map';
    } else {
      const penalty = row.band ? BAND_PENALTY[row.band] : undefined;
      range.textContent =
        row.band === 'over'
          ? `${formatCells(row.cells)} — over`
          : penalty
            ? `${formatCells(row.cells)} (${penalty})`
            : formatCells(row.cells);
      // A distance with no band is the confusing case, and it is worth spelling
      // out: the roll came from the skills list, which knows the skill but not
      // which weapon — and without a weapon there are no bands to fall in. The
      // cell then reads like a measured range that was silently ignored, which
      // is exactly how it was reported.
      if (!row.band) range.classList.add('no-band');
      range.title = row.band
        ? `${row.cells.toFixed(1)} cells — ${row.band} range`
        : `${row.cells.toFixed(1)} cells. No range penalty: this roll carries no weapon, ` +
          `so there are no range bands. Roll the attack from the weapon to get them.`;
    }
    tr.append(range);

    const stat = document.createElement('td');
    stat.className = 'num';
    if (isAttack) {
      // Blank rather than "—" when it is withheld. An em dash here means "this
      // character has no Parry", which is a different and wrong statement — the
      // number exists, it is simply not the table's business on a shot that
      // travelled. See `PARRY_VISIBLE_CELLS`.
      stat.textContent = row.parry === undefined ? '' : String(row.parry);
      if (row.parry !== undefined && row.target !== row.parry) {
        stat.title = `Parry ${row.parry} — the result beside it is against ${row.target}`;
      }
    } else {
      stat.textContent = String(row.toughness ?? '—');
    }
    tr.append(stat);

    const result = document.createElement('td');
    if (isAttack) {
      result.textContent = row.outOfRange
        ? 'out of range'
        : row.hit
          ? row.raises
            ? `hit, ${row.raises} raise${row.raises === 1 ? '' : 's'}`
            : 'hit'
          : 'miss';
      result.className = row.hit ? 'num hit' : 'num miss';
      // The whole sum, not just the answer. A range penalty that was shown in one
      // column and silently missing from another is exactly the bug this had.
      const bandPenalty = row.band && row.band !== 'over' ? BAND_PENALTY[row.band] : 0;
      const working = [
        `${entry.total}`,
        bandPenalty ? `${formatMod(bandPenalty)} range` : '',
        row.bonus ? `${formatMod(row.bonus)} target` : '',
      ]
        .filter(Boolean)
        .join(' ');
      // Say when a term is missing, not just when it is present. A sum that
      // quietly omits range reads as a sum that has range in it and found it to
      // be zero.
      const noBands = !entry.bands && row.cells !== undefined;
      result.title = row.outOfRange
        ? `Beyond long range — the shot cannot be taken`
        : `${working} = ${row.effective} vs ${row.target}` +
          (noBands ? ' — no weapon on this roll, so no range penalty' : '');
    } else {
      result.textContent = row.outcome ?? '—';
      result.className = 'num';
    }
    tr.append(result);

    if (!isAttack) {
      const action = document.createElement('td');
      action.className = 'num';
      if (row.applicable) {
        const adjust = adjustments.get(entry.id);
        const apply = document.createElement('button');
        apply.className = 'apply';
        apply.textContent = 'Apply';
        // The tooltip carries the arithmetic, so what the button is about to
        // commit is readable before it is committed rather than after.
        apply.title = `Apply ${describeAdjustment(entry.total!, adjust) || entry.total} to ${row.name}`;
        apply.addEventListener('click', () => {
          const token = tokens.find((t) => t.id === row.tokenId);
          const state = token && readBinding(token.metadata);
          const sheet = state && sheets.find((s) => s.id === state.sheetId);
          if (token && state && sheet) {
            void applyToTarget(entry, { token, state, sheet }, adjustments.get(entry.id));
          }
        });
        action.append(apply);
      }
      tr.append(action);
    }

    table.append(tr);
  }

  // The adjustment sits above the table, not on each row: you apply one row at
  // a time, and a control per row would be five copies of the same decision.
  if (!isAttack && rows.some((row) => row.applicable)) {
    holder.replaceChildren(adjustBar(entry, () => void fillTargets(holder, entry)), table);
  } else {
    holder.replaceChildren(table);
  }
  // Only Fighting gets a note. The ranged one explained why the Parry column was
  // sometimes blank, which is a paragraph spent on the absence of a number nobody
  // asked for; the blank says enough on its own.
  if (isAttack && attackKind(entry.skill!) === 'parry') {
    const note = document.createElement('p');
    note.className = 'targets-note';
    note.textContent = 'Resolved against Parry.';
    holder.append(note);
  }

  // Shown *here* and not on the log line, because the rule turns on the miss and
  // the miss is per-target: this is the one place on screen that knows one. Held
  // back entirely when every row hit — a warning about a shot that landed is
  // noise, and noise is how a warning stops being read.
  //
  // Deliberately not per row. Most rows in this table are people nobody was
  // aiming at, so a marker against each of their misses would mark almost
  // everything. Who is actually next to the target is a look at the map.
  if (isAttack && entry.stray && rows.some((row) => row.hit === false && !row.outOfRange)) {
    const stray = document.createElement('p');
    stray.className = 'targets-note stray';
    stray.textContent = strayWarning(entry.stray, entry.strayOn ?? STRAY_ON_MISS).replace(
      /\*\*/g,
      '',
    );
    holder.append(stray);
  }
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
/**
 * The storage footer. Only the **room** is reported.
 *
 * The scene store is ~50× the size and holds the half of the roster that can be
 * regenerated from the bundled bestiary in a minute; the room holds the PCs and
 * is the one that has ever actually filled up. Reporting both would mean a
 * permanent second number that is always near zero, and a percentage nobody reads
 * is worse than no percentage — it teaches you to skip the line the one time it
 * matters.
 */
async function showBudget(): Promise<void> {
  const { used, capacity, fraction } = await store.usage();
  const crowded = fraction > 0.8;
  budgetEl.textContent = crowded
    ? `campaign storage ${Math.round(fraction * 100)}% full (${used}/${capacity} chars) — ` +
      `press Kept on a villain to move them to the scene`
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
  /**
   * Edges and hindrances that change this trait but that the app deliberately
   * does not apply — because their scope is a *purpose* it cannot see.
   *
   * "Notice rolls made to spot clues", "Stealth rolls made in the wild",
   * "Spirit rolls made to resist Fear": only two of the party's 24 edges are
   * scoped to a bare skill name. So the asterisk tells the player it is there
   * and what it says, and they dial it in — which is both less code and more
   * correct than the app guessing whether they are in a town.
   */
  notes: readonly AbilityNote[] = [],
): HTMLElement {
  const button = document.createElement('button');
  button.className = untrained ? 'trait untrained' : 'trait';
  const name = document.createElement('span');
  name.textContent = label;
  button.append(name);
  if (notes.length) {
    const star = document.createElement('span');
    star.className = 'trait-note';
    star.textContent = '*';
    // Every note in one tooltip: a trait with two of them wants both, and there
    // is nowhere on a button to put a second marker.
    star.title = notes.map((note) => describeNote(note, label)).join('\n');
    button.append(star);
  }
  button.append(die);
  button.addEventListener('click', roll);
  return button;
}

/**
 * Edges, hindrances and special abilities, each saying whether it does anything.
 *
 * The marker is the point. Before it, a sheet showing Trademark Weapon and a
 * sheet showing Level Headed looked identical and only one of them did anything
 * — which is exactly the guessing Paul wanted stopped. Now:
 *
 *   `auto` — the app applies it (initiative only; that is the whole list)
 *   `N.B.` — has a number, and there is an asterisk on the trait it belongs to
 *   (none) — text, and the rules text below it is the whole story
 *
 * The name itself is formatted the same either way. It used to be greyed and
 * lighter when inert, which read as two kinds of entry when the only difference
 * is whether there is a chip — and the chip is the signal.
 *
 * An inert entry gets no tooltip *unless* it has no rules text: "no number the
 * app can name" was hovering to be told what the paragraph directly underneath
 * already says. An entry named with no text at all is the opposite case — the
 * tooltip is the only thing there is to read.
 */
function entryList(
  sheet: Sheet,
  entries: Sheet['edges'],
  notes: readonly AbilityNote[],
): HTMLElement {
  const dl = document.createElement('dl');
  dl.className = 'entries';
  for (const entry of entries) {
    const note = notes.find((n) => n.entry === entry);
    // `entry.text` is the book's full entry, reattached by `joinSheet`. Good to
    // have and far too long to sit under six of these at once, so what shows is
    // the book's own one-line summary and the full text is a click away.
    const full = entry.text?.trim();
    const brief = findEntry(entry.name)?.summary?.trim();
    const shown = brief ?? full;
    // Nothing to expand when the summary is all there is, or when the two say the
    // same thing — a control that reveals what is already on screen is worse than
    // no control. Nor when the full entry is the *shorter* of the two: an improved
    // Edge is printed as "As above but…" and leans on the entry it improves, so
    // the summary table says more. Four entries are like that, and offering to
    // expand them would be offering to show less.
    const expandable = Boolean(full && brief && full !== brief && full.length > brief.length);

    const dt = document.createElement('dt');
    dt.textContent = entry.name;
    if (note && note.klass !== 'text') {
      const tag = document.createElement('span');
      tag.className = `entry-tag ${note.klass}`;
      tag.textContent = note.klass === 'wired' ? 'auto' : 'N.B.';
      tag.title = note.note;
      dt.append(' ', tag);
    } else if (note && !shown) {
      dt.title = note.note;
    }

    const dd = document.createElement('dd');
    // The prose lives in its own element rather than as the `dd`'s text, because
    // the More/Less toggle rewrites it — and `dd.textContent = ...` takes every
    // sibling with it. That silently deleted the hand control below: appended,
    // then destroyed by the first `paint()` before anyone ever saw it.
    const prose = document.createElement('span');
    prose.className = 'entry-prose';
    if (shown) prose.textContent = shown;
    dd.append(prose);

    // The Edge that drew the extra cards is the second place the hand appears —
    // the initiative row is where the cards are, and this is where the reason for
    // them is written. Only on the entry that caused them, and only when there is
    // in fact a choice to make, so a sheet with Level Headed and a one-card hand
    // looks exactly as it did.
    const choice = handControlFor(sheet, entry.name);
    if (choice) dd.append(choice);

    if (expandable) {
      const toggle = document.createElement('button');
      toggle.className = 'entry-more';
      toggle.type = 'button';
      // Starts collapsed on every render. The sheet is rebuilt whenever anything
      // on it changes, so remembering which entries were open would mean keeping
      // that state outside the DOM for a control the reader can re-open in one
      // click.
      let open = false;
      const paint = (): void => {
        toggle.textContent = open ? 'Less' : 'More';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.title = open ? 'Show the short version' : 'Show the full rulebook entry';
        prose.textContent = open ? full! : brief!;
        dd.classList.toggle('full', open);
      };
      toggle.addEventListener('click', () => {
        open = !open;
        paint();
      });
      paint();
      dt.append(' ', toggle);
    }

    dl.append(dt);
    // Also when there is no prose but there *is* a control: an entry with a
    // widget and no summary would otherwise never reach the page.
    if (shown || choice) dl.append(dd);
  }
  return dl;
}

function renderSheetArea(): void {
  // The bind button lives in the header, outside everything this function
  // replaces, but it depends on the same three things — selection, tokens, and
  // which sheet is up — so it is refreshed from the one hook they all reach.
  updateBindButton();
  if (tab === 'table') {
    sheetEl.replaceChildren(pasting ? renderPaste() : renderTable());
    return;
  }
  if (tab === 'initiative') {
    sheetEl.replaceChildren(
      renderInitiative(initiative, combatants(tokens, sheets), {
        revealNpcs: isGM,
        // The deck is the Marshal's. See `InitiativeHooks.mayDeal`.
        mayDeal: isGM,
        // And so is the half of the map nobody has walked into yet.
        showHidden: isGM,
        onDeal: () => void deal(),
        onClear: () => void endFight(),
        onSelect: (tokenId) => void takeTurn(tokenId),
        onOpenSheet: (tokenId) => void openSheetFor(tokenId),
        onReplace: (tokenId) => void replaceCard(tokenId),
        onChoose: (tokenId, index) => void chooseCardFor(tokenId, index),
        mayChoose: (combatant) => mayChooseFor(combatant.sheet),
        acted,
        ...(selectedTokenId ? { selectedTokenId } : {}),
      }),
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
        dice: {
          animate,
          onToggle: () => void toggleDice(),
        },
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
    // Grouped by sheet: a gang of Extras off one stat block acts on one Action
    // Card. Every token still gets its own row and its own copy of the card —
    // only the *draw* is shared.
    //
    // This deliberately does not care whether some of those tokens are hidden
    // two rooms away. They share a card because they are the same mooks; when
    // the Marshal reveals them they join a gang that is already acting on it.
    // A Wild Card has one token, so their sheet id groups them with themselves.
    table.map((c) => ({
      tokenId: c.tokenId,
      edges: initiativeEdges(c.sheet),
      out: isIncapacitated(c.state, c.sheet),
      group: c.sheet.id,
    })),
    new JavaRandom(),
  );

  // A new round is a clean slate: everyone acts again.
  acted = new Set();
  // Anyone out of the fight loses their card as well, so the map is not showing
  // a card for a body.
  // The whole hand, not just the card acted on: Level Headed's second card and
  // Improved's third are the player's to choose between, so they have to survive
  // the deal rather than being picked over and dropped.
  const assignments = new Map<string, { cards: readonly Card[]; chosen: Card } | undefined>(
    table.map((c) => [c.tokenId, undefined]),
  );
  for (const [id, draw] of result.draws) assignments.set(id, { cards: draw.cards, chosen: draw.card });
  // `closeSoak` rides along: the Soak window shuts when the round turns, and
  // this is already the one write that touches every combatant. Looping it
  // separately would be a serial write per token in front of this one.
  await setHands(assignments, { closeSoak: true });
  await writeInitiative(result.state);
  initiative = result.state;

  // One entry per *hand*, so a gang of six reads "Bandit 1, Bandit 2, … ♠K"
  // rather than printing the same king six times. Keyed on the `Draw` object,
  // which `dealRound` shares between group members precisely so this works;
  // comparing cards by value would also fold together two separate gangs that
  // happened to draw alike, and those are different facts about the round.
  const byHand = new Map<Draw, string[]>();
  for (const [id, draw] of result.draws) {
    const combatant = table.find((c) => c.tokenId === id);
    // A hidden combatant is not in the players' initiative list, so it must not
    // arrive in their log either — "Something ♠K" is the ambush announcing
    // itself. The Marshal has the whole order on the initiative tab, which is
    // where they are reading it from anyway; this line is the table's copy.
    //
    // Dropped per *member*, not per hand: a gang half of which is still behind
    // the barn is announced by the half the players can see.
    if (combatant?.hidden) continue;
    // The character's name, as everywhere else — a token called
    // "Npc Linguist 4" says nothing about who just drew a king. The published
    // line goes to everyone, so a private character is named by its token there
    // whoever is dealing.
    const who = combatant ? displayName(combatant, table, false) : '?';
    byHand.set(draw, [...(byHand.get(draw) ?? []), who]);
  }
  const dealt = [...byHand]
    .map(([draw, names]) => `${[...names].sort(compareNames).join(', ')} ${cardLabel(draw.card)}`)
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
    renderMarshal();
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
  await setHands(new Map(tokens.map((token) => [token.id, undefined])));
  await clearInitiative();
  await refreshTokens();
}

/** The deck and the round bookkeeping, without touching the tokens. */
async function clearInitiative(): Promise<void> {
  await writeInitiative(undefined);
  initiative = undefined;
  acted = new Set();
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

  wrap.append(rosterBlock());
  wrap.append(sessionBlock());
  // No dice-seat block: where a player's dice come in from is derived from where
  // they sit relative to whoever is watching, so there is nothing left to choose.
  wrap.append(storageBlock());
  // Last, because it is the only block you go looking for rather than glance at:
  // adding a mook is a thing you do once a scene, not once a round.
  wrap.append(bestiaryBlock());

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
 * Starting things and ending them: the session, and the scene.
 *
 * One block because they are the same question at two scales — "what carries over
 * from the last one?" Bennies are the session's answer and live on the sheets;
 * wounds, conditions and initiative are the scene's and live on the tokens. Two
 * blocks made that look like two unrelated features.
 *
 * The reset is spelled out on screen rather than left to a tooltip. It is
 * destructive, it is not undoable through this panel, and "reset" could plausibly
 * mean anything from clearing wounds to wiping the roster.
 */
function sessionBlock(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pane-block';
  wrap.append(
    paneHeading(
      'Session and scene',
      'Bennies belong to the session and live on the sheets. Wounds, conditions ' +
        'and initiative belong to the scene and live on the tokens — so they ' +
        'follow a token copied to a new map.',
    ),
  );

  wrap.append(
    paneButtons([
      [
        'Clear Bennies',
        'Everyone to none — then hand out a starting three with the button beside it',
        () => {
          if (!confirm('Clear every Benny in the room? Nobody keeps any.')) return;
          void handOut(() => bank.clearAll(sheets), 'Bennies cleared', 'nothing left for');
        },
      ],
      [
        '+1 Benny to all PCs',
        "One Benny to every player's Wild Card — for good play, or a scene that deserved it",
        () => void handOut(() => bank.awardAll(sheets), 'Bennies all round', 'a Benny each for'),
      ],
    ]),
  );

  const detail = document.createElement('dl');
  detail.className = 'reset-detail';
  const rows: [string, string][] = [
    ['Reset clears', 'Wounds, Fatigue, Shaken, every condition and hand-dialled modifier, dealt initiative cards, and the current round'],
    ['Reset keeps', 'Which sheet each token is bound to, and everything on the sheets themselves — Bennies included'],
  ];
  for (const [term, description] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = description;
    detail.append(dt, dd);
  }
  wrap.append(detail);

  wrap.append(
    paneButtons([
      [
        'Reset scene',
        'Clear wounds, conditions and initiative from every bound token in this scene',
        () => {
          if (
            !confirm(
              'Reset this scene?\n\n' +
                'Cleared from every bound token: wounds, Fatigue, Shaken, all conditions, ' +
                'the hand-dialled modifier, and any dealt initiative card. The current ' +
                'round ends.\n\n' +
                'Kept: token bindings, and the sheets themselves including Bennies.',
            )
          ) {
            return;
          }
          void (async () => {
            try {
              const count = await resetAllTokens();
              await clearInitiative();
              await refreshTokens();
              renderSheetArea();
              notify(
                count
                  ? `Reset ${count} token${count === 1 ? '' : 's'} — wounds, conditions and initiative cleared`
                  : 'No bound tokens in this scene',
              );
            } catch (error) {
              notify(describe(error));
            }
          })();
        },
      ],
    ]),
  );
  return wrap;
}

/**
 * Storage relief: clear the stored rules text the rulebook already covers.
 *
 * This used to be a drop/restore switch, and both halves rested on something that
 * is no longer true — that dropping the dictionary meant losing the wording. It
 * does not: `joinSheet` now falls back to the catalogue in the bundle, so an edge
 * the book knows shows its text whether or not anything is stored.
 *
 * That makes "restore" actively wrong — it would write back prose the book
 * already supplies, spending the space this exists to reclaim — so the button is
 * one-way now. What it removes is the text of entries the book knows; homebrew,
 * and anything the book has never heard of, stays. Nothing that cannot be
 * reconstructed is thrown away, which is why there is no longer a confirm.
 *
 * In the party's room this was 4,447 chars, 38% of everything in use.
 */
function storageBlock(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pane-block';
  const heading = paneHeading(
    'Rules text',
    'Older rooms stored the prose of every edge and hindrance. The rulebook ships ' +
      'inside this extension now, so most of it no longer needs keeping.',
  );
  wrap.append(heading);

  const row = document.createElement('div');
  row.className = 'pane-buttons';
  const button = document.createElement('button');
  row.append(button);
  const note = document.createElement('span');
  note.className = 'pane-note';
  row.append(note);
  wrap.append(row);

  const show = (): void => {
    void roster.rulesTextSize().then((size) => {
      button.textContent = size > 0 ? `Clear stored rules text (${size} chars)` : 'Rules text';
      button.disabled = size === 0;
      button.title =
        size > 0
          ? 'Remove the stored copy of anything the rulebook covers. The wording stays ' +
            'on screen — it comes from the book instead.'
          : '';
      note.textContent = size > 0 ? '' : 'nothing stored — the book supplies it';
    });
  };

  button.addEventListener('click', () => {
    void (async () => {
      try {
        const removed = await roster.pruneRulesText();
        notify(
          removed
            ? `Cleared ${removed} stored entries — the wording now comes from the rulebook`
            : 'Nothing stored that the rulebook covers',
        );
        sheets = await roster.listFull();
        show();
        await showBudget();
        renderSheetArea();
      } catch (error) {
        notify(describe(error));
      }
    })();
  });

  show();
  return wrap;
}

/**
 * Hand Bennies to the whole party, and say what actually happened.
 *
 * The failure this exists for: a write that does not fit the room's budget
 * throws for one character while everyone else is fine. That used to abort the
 * loop with nothing to catch it, so the rest of the party silently got nothing —
 * which at the table looks like one player being skipped.
 */
async function handOut(
  run: () => Promise<BennyOutcome>,
  label: string,
  explained: string,
): Promise<void> {
  try {
    const outcome = await run();
    bennies = await bank.all();
    renderMarshal();
    renderSheetArea();
    if (outcome.done.length) {
      publish({ label, expression: 'benny', explained: `${explained} ${outcome.done.join(', ')}` });
    }
    if (outcome.failed.length) {
      const { fraction } = await store.usage();
      notify(
        `${outcome.failed.map((f) => f.name).join(', ')} did not get theirs — ` +
          describe(outcome.failed[0]!.error) +
          (fraction > 0.75
            ? ` Roster storage is ${Math.round(fraction * 100)}% full, which is the likely cause.`
            : ''),
      );
    }
  } catch (error) {
    notify(describe(error));
  }
}

/**
 * Every character in the room, as a table rather than a list.
 *
 * The list gave a name and one switch. What the Marshal actually needs between
 * scenes is the state of the whole roster at once — who is a player's, who is a
 * Wild Card, and who is short of Bennies — and reading that off a list meant
 * opening sheets one at a time. Columns answer it in a glance, and the two
 * things worth doing per row, flipping PC/NPC and handing over a Benny, are in
 * the row rather than behind the sheet.
 *
 * A star marks a Wild Card, which is how the stat blocks themselves write it.
 */
function rosterBlock(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pane-block';
  const npcs = sheets.filter((sheet) => !sheet.pc).length;
  wrap.append(
    paneHeading(
      'Roster',
      `${sheets.length} character${sheets.length === 1 ? '' : 's'}` +
        (npcs
          ? `, ${npcs} of them yours — kept out of players' pickers, sheets and ` +
            'initiative names. A screen, not a lock: room data is readable by every client.'
          : '. Anything you add starts as an NPC; switch it in the PC column.'),
    ),
  );
  wrap.append(
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

  if (!sheets.length) return wrap;

  const table = document.createElement('table');
  table.className = 'roster';

  const head = document.createElement('tr');
  for (const [label, hint, numeric] of [
    ['', 'Wild Card', false],
    ['Character', '', false],
    ['PC', "Whose character it is. An NPC stays out of the players' panels.", true],
    [
      'Kept',
      'How long this character lasts. Room is the campaign \u2014 they follow you ' +
        'to every map. Scene means they live with this board and go when it does, ' +
        'which is what tonight\u2019s mooks want. Press to move them.',
      true,
    ],
    [
      // Was "Scene", which now means something else one column to the left.
      'Fight',
      'Whether this character is in the fight at all — parked ones are dealt no ' +
        'Action Card and offered as nobody\u2019s target, however many of them are on ' +
        'the map. Separate from Owlbear\u2019s eye, which decides who can be seen.',
      true,
    ],
    ['Bennies', 'What they hold now', true],
    ['', 'Hand one over', true],
  ] as [string, string, boolean][]) {
    const th = document.createElement('th');
    th.textContent = label;
    if (hint) th.title = hint;
    if (numeric) th.className = 'num';
    head.append(th);
  }
  table.append(head);

  // Players first, then the Marshal's: the party is the part you check every
  // session, and a long bestiary underneath should not push it off screen.
  const ordered = [...sheets].sort((a, b) => Number(b.pc) - Number(a.pc));
  for (const sheet of ordered) {
    const row = document.createElement('tr');
    if (!sheet.pc) row.className = 'npc';
    if (sheet.parked) row.classList.add('parked');

    // The star is the stat blocks' own notation for a Wild Card, which is where
    // the Marshal has already learned to read it.
    const star = document.createElement('td');
    star.className = 'wc';
    star.textContent = sheet.wildCard ? '★' : '';
    star.title = sheet.wildCard ? 'Wild Card' : 'Extra';
    row.append(star);

    const nameCell = document.createElement('td');
    const open = document.createElement('button');
    open.className = 'creature-name';
    open.textContent = sheet.name;
    open.title = `Open ${sheet.name}'s sheet`;
    open.addEventListener('click', () => {
      selectedId = sheet.id;
      renderRoster();
      setTab('sheet');
    });
    nameCell.append(open);
    row.append(nameCell);

    // The column is the control: with Reveal gone this is the only place the
    // whole roster's allegiance can be set without opening six sheets.
    const kindCell = document.createElement('td');
    kindCell.className = 'num';
    const kind = document.createElement('button');
    kind.className = 'kind';
    kind.textContent = sheet.pc ? 'PC' : 'NPC';
    kind.title = sheet.pc
      ? `Make ${sheet.name} one of yours, out of the players' panels`
      : `Hand ${sheet.name} to the players`;
    kind.addEventListener('click', () => {
      void (async () => {
        const becomingPc = !sheet.pc;
        await roster.save({ ...sheet, pc: becomingPc });
        // Handing a character to the players promotes them to the campaign, if
        // they were not there already. A PC that vanished when the Marshal
        // changed map would be read as the app losing them, and nobody would
        // think to check a storage column to find out why. The reverse is *not*
        // automatic: a campaign-level villain is exactly what Kept exists to
        // allow, so demoting one stays a deliberate second press.
        if (becomingPc && scopes.get(sheet.id) === 'scene') {
          try {
            await roster.move(sheet.id, 'room');
          } catch (error) {
            notify(
              `${sheet.name} is a PC now but could not be moved to the campaign — ` +
                `${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        await reload();
        renderSheetArea();
      })();
    });
    kindCell.append(kind);
    row.append(kindCell);

    // How long they last, and the control for it. The store a sheet sits in *is*
    // the answer, so this reads `scopes` rather than anything on the sheet — there
    // is no field here that could disagree with where the character actually is.
    const keptCell = document.createElement('td');
    keptCell.className = 'num';
    const kept = document.createElement('button');
    const scope = scopes.get(sheet.id);
    kept.className = scope === 'room' ? 'kind' : 'kind scene-kept';
    kept.textContent = scope === 'room' ? 'Room' : scope === 'scene' ? 'Scene' : '—';
    kept.disabled = scope === undefined;
    kept.title =
      scope === 'room'
        ? `${sheet.name} follows you to every map. Press to leave them with this scene instead.`
        : scope === 'scene'
          ? `${sheet.name} lives with this scene and goes when it does. Press to keep them for the campaign.`
          : 'Nowhere to move this character to — open a scene first';
    kept.addEventListener('click', () => {
      void moveCharacter(sheet, scope === 'room' ? 'scene' : 'room');
    });
    keptCell.append(kept);
    row.append(keptCell);

    // The other half of "who is in this room". The eye on the map hides a token
    // from the players; this takes a whole creature type out of the fight, which
    // is what a floor with five prepped encounters on it needs. Deliberately not
    // folded into one control: an invisible villain and a reinforcement waiting
    // in the corridor are hidden *and* in the fight.
    const sceneCell = document.createElement('td');
    sceneCell.className = 'num';
    const scene = document.createElement('button');
    scene.className = sheet.parked ? 'kind parked' : 'kind';
    scene.textContent = sheet.parked ? 'OUT' : 'IN';
    scene.title = sheet.parked
      ? `Bring ${sheet.name} into the fight — dealt a card, and a target`
      : `Park ${sheet.name}: no Action Card, and out of every target list`;
    scene.addEventListener('click', () => {
      void (async () => {
        // Stored only when parked, so the common case costs the room nothing.
        const { parked: _was, ...rest } = sheet;
        await roster.save(sheet.parked ? rest : { ...sheet, parked: true });
        await reload();
        renderSheetArea();
      })();
    });
    sceneCell.append(scene);
    row.append(sceneCell);

    const count = document.createElement('td');
    count.className = 'num';
    // An Extra has no Bennies at all, which is not the same as holding none.
    count.textContent = sheet.wildCard ? String(bennies.get(sheet.id) ?? 0) : '—';
    row.append(count);

    const give = document.createElement('td');
    give.className = 'num';
    const plus = document.createElement('button');
    plus.className = 'creature-add';
    plus.textContent = '+1';
    plus.disabled = !sheet.wildCard;
    plus.title = sheet.wildCard
      ? `A Benny for ${sheet.name}`
      : 'Extras do not have Bennies';
    plus.addEventListener('click', () => void awardBenny(sheet));
    give.append(plus);
    row.append(give);

    table.append(row);
  }
  wrap.append(table);
  return wrap;
}

/**
 * The creature presets: search, see what you would get, add it.
 *
 * A preset is added exactly as a pasted block would be, because it *is* one —
 * the same parser reads both, so there is no second code path to keep honest.
 */
const BESTIARY_RESULTS = 10;

/** Which collection the picker is showing. Empty is everything. */
let bestiarySource = '';

function bestiaryBlock(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pane-block';
  wrap.append(
    paneHeading('Bestiary', 'Written for older editions than the party\u2019s cards \u2014 expect to adjust.'),
  );

  const controls = document.createElement('div');
  controls.className = 'bestiary-controls';

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search creatures\u2026';
  controls.append(search);

  // Two books in one list, and the one you want is almost always the adventure
  // you are running. Filtering by source is what Paul asked for when the second
  // collection went in.
  const picker = document.createElement('select');
  picker.className = 'bestiary-source';
  for (const [value, label] of [
    ['', 'All books'],
    [COFFIN_ROCK, COFFIN_ROCK_SOURCE],
    [SAVAGE_FREE_BESTIARY, BESTIARY_SOURCE],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    // The full credit line is long; the dropdown gets a short name and the
    // tooltip keeps the attribution the data file asks for.
    option.textContent = value === '' ? label : label.replace(/\s*\(.*\)$/, '');
    option.title = label;
    if (value === bestiarySource) option.selected = true;
    picker.append(option);
  }
  controls.append(picker);
  wrap.append(controls);

  const results = document.createElement('div');
  results.className = 'creature-list';
  wrap.append(results);

  const show = (): void => {
    results.replaceChildren();
    for (const creature of searchCreatures(
      search.value,
      BESTIARY_RESULTS,
      bestiarySource || undefined,
    )) {
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
      name.addEventListener('click', () => void addCreature(creature.name, creature.source));
      row.append(name);

      const meta = document.createElement('span');
      meta.className = 'creature-meta';
      meta.textContent = `${creature.category} · T${sheet.toughness} P${sheet.parry}`;
      row.append(meta);

      results.append(row);
    }
  };
  search.addEventListener('input', show);
  picker.addEventListener('change', () => {
    bestiarySource = picker.value;
    show();
  });
  show();
  return wrap;
}

async function addCreature(name: string, source?: string): Promise<void> {
  // The source travels with the click: the two books share names — both have
  // Deputies and Cultists — so a search by name alone could add the wrong one.
  const creature = findCreature(name, source) ?? searchCreatures(name, 1, source)[0];
  if (!creature) return;
  const sheet = creatureSheet(creature);
  // A creature the Marshal adds is an NPC — a mook's stat block is the one thing
  // at the table the players are meant to find out by being shot at. One click
  // in the roster's PC column hands it over.
  await roster.save({ ...sheet, id: newCharacter(sheet.name, sheets).id, pc: false });
  const stale = outdatedSkills(sheet);
  publish({
    label: 'Added',
    expression: 'roster',
    explained:
      `**${sheet.name}**` +
      (stale.length ? ` — note ${stale.join(', ')} predates this edition` : ''),
    // Local only. This line names the creature — "Rattler Cultist", "Landshark"
    // — and it is broadcast, so it announced what the Marshal had just put in
    // the roster to everyone at the table, an hour before they met it. Nobody
    // but whoever pressed the button wants this line at all: it is a receipt for
    // a roster edit, not something that happened in the fiction.
    secret: true,
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
          await roster.save({ ...sheet, id: newCharacter(sheet.name, sheets).id, pc: false });
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

/**
 * The hand, rendered onto the Edge responsible for it.
 *
 * Level Headed and its improved form only. Quick draws extra cards too, but it
 * draws them as *replacements* until one is high enough, so its entry has nothing
 * to choose between; the cards it produced land in the same hand and are chosen
 * from on whichever entry does have the control.
 *
 * `undefined` unless there is a real choice — a hand of one, no active token, or
 * an Edge that does not draw cards all render nothing, so the common sheet is
 * untouched.
 */
function handControlFor(sheet: Sheet, entryName: string): HTMLElement | undefined {
  if (!/level[\s-]?headed/i.test(entryName)) return undefined;
  // The sheet is passed in rather than looked up from `selectedId`. They agree
  // today because there is one call site, and the first time `entryList` is
  // reused they would not — silently drawing another character's cards.
  const active = activeToken(sheet);
  // Shown whenever they are holding anything, not only when there is a choice to
  // make. A player with Level Headed who has been dealt one card and sees nothing
  // here cannot tell whether the Edge is working or the app is — which is exactly
  // the question this control exists to answer. With a single card it reads
  // "Acting on ♠K" and offers no buttons.
  if (!active || !handOf(active.state)) return undefined;

  const wrap = document.createElement('div');
  wrap.className = 'entry-hand';
  const label = document.createElement('span');
  label.className = 'entry-hand-label';
  label.textContent = 'Acting on';
  // Same gate as the initiative row, and it has to be: a player can open another
  // player's sheet — `visibleSheets` shows every PC — so without this the sheet
  // would hand out the choice the turn order had just refused.
  const mayChoose = mayChooseFor(sheet);
  const hand = renderHand(
    active.state,
    mayChoose ? (index) => void chooseCardFor(active.token.id, index) : undefined,
  );
  if (!hand) return undefined;
  wrap.append(label, hand);
  return wrap;
}

/**
 * Act on a different card from the hand.
 *
 * Writes only the choice — the cards themselves are untouched, so this is not a
 * redraw and costs nothing. Anyone who can see the row can make it: the Marshal
 * runs the villains, and a player choosing on their own character is the entire
 * point. That is the same screen-not-lock the rest of the panel uses, because
 * token metadata is writable by every client whatever this code does.
 */
async function chooseCardFor(tokenId: string, index: number): Promise<void> {
  const before = tokens.find((t) => t.id === tokenId);
  const state = readBinding(before?.metadata);
  const hand = state && handOf(state);
  if (!state || !hand || index === hand.chosen) return;

  await updateTokenState(tokenId, (current) => chooseFromHand(current, index));
  await refreshTokens();

  const table = combatants(tokens, sheets);
  const combatant = table.find((c) => c.tokenId === tokenId);
  // Nothing for a token the players cannot see, as with the deal.
  if (!combatant || combatant.hidden) return;
  publish({
    label: 'acts on a different card',
    expression: 'initiative',
    explained: `${displayName(combatant, table, false)} takes ${cardLabel(hand.cards[index]!)} over ${cardLabel(hand.cards[hand.chosen]!)}`,
  });
}

/**
 * Move a character between the campaign and this scene.
 *
 * Write-then-remove inside `Roster.move`, so a failure here leaves them where
 * they were rather than nowhere. The message says what changed *and* what that
 * means, because "Room" and "Scene" are only obvious once.
 */
async function moveCharacter(sheet: Sheet, to: Scope): Promise<void> {
  try {
    await roster.move(sheet.id, to);
  } catch (error) {
    notify(`Could not move ${sheet.name} — ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  // Reloaded *first*: it has its own notice for characters left in both stores,
  // and it would land on top of this one in precisely the case where a move has
  // just created or cleared one.
  await reload();
  notify(
    to === 'room'
      ? `${sheet.name} is now kept for the campaign, and follows you to every map`
      : `${sheet.name} now lives with this scene, and goes when it does`,
  );
}

/**
 * How long an Undo stays on offer. Long enough to notice the notice, short enough
 * that it is gone before the next thing you do puts it out of your mind.
 */
const UNDO_MS = 12_000;

/**
 * Delete a character, with the friction matched to what losing them would cost.
 *
 * A **scene-stored NPC** is tonight's mook: one press, no dialog. A **PC or a
 * campaign-level NPC** is weeks of work and still asks, because the Marshal
 * promoted them to Room precisely to say they matter.
 *
 * Either way the sheet is kept in memory and offered back, which is better
 * protection than the dialog it replaces: a confirm only helps the person who
 * reads it, and nobody reads the fourth one. Undo restores the character to the
 * store they came out of, not to wherever a fresh save would have put them.
 */
async function deleteCharacter(sheet: Sheet): Promise<void> {
  const scope = scopes.get(sheet.id);
  if (
    (sheet.pc || scope === 'room') &&
    !confirm(`Delete ${sheet.name}? They are kept for the whole campaign. Export first if unsure.`)
  ) {
    return;
  }

  // Counted before the delete, while the binding still resolves. Losing the
  // confirm loses the last moment anyone would notice this, so it goes in the
  // message instead — friction replaced by information.
  const bound = tokensForSheet(tokens, sheet.id).length;
  await roster.remove(sheet.id);
  selectedId = undefined;
  setEditing(false);
  await reload();

  const orphaned = bound
    ? ` ${bound} token(s) on the map are now unbound.`
    : '';
  offerUndo(`Deleted ${sheet.name}.${orphaned}`, async () => {
    await roster.save(sheet);
    // Back where they were, not where a new sheet of their kind would go: a
    // campaign villain restored into the scene would quietly lose their scope.
    if (scope && (await roster.scopeOf(sheet.id)) !== scope) await roster.move(sheet.id, scope);
    selectedId = sheet.id;
    await reload();
    notify(`${sheet.name} is back.`);
  });
}

/**
 * A notice with an Undo beside it, for a few seconds.
 *
 * Deliberately not a general undo stack — there is no such thing in this app, and
 * pretending otherwise would invite it to be relied on. It is one action, the one
 * just taken, offered back while it is still the thing on your mind.
 */
function offerUndo(message: string, undo: () => Promise<void>): void {
  notify(message);
  const button = document.createElement('button');
  button.className = 'sheet-link undo';
  button.textContent = 'Undo';
  let timer = 0;
  button.addEventListener('click', () => {
    window.clearTimeout(timer);
    button.disabled = true;
    void undo().catch((error) => notify(`Could not undo — ${describe(error)}`));
  });
  noticeEl.append(' ', button);
  timer = window.setTimeout(() => {
    // Only clears the notice if it is still *this* one. Something else may well
    // have written to the bar in the meantime, and wiping that would make an
    // unrelated message vanish a few seconds after it appeared.
    if (noticeEl.contains(button)) notify(undefined);
  }, UNDO_MS);
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
// The scene's own token type, not the bare `TokenLike` this used to declare.
// `visible` is the reason: it is on every token the panel holds and was being
// annotated away here, so `hiddenOnMap` could not ask the question.
type SceneToken = (typeof tokens)[number];

function activeToken(sheet: Sheet): { token: SceneToken; state: TokenState } | undefined {
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
  const active = activeToken(sheet);
  if (active) return rollBreakdown(active.state);
  // No token, so no wounds or Fatigue to carry — but the Marshal's dial still
  // counts. See `looseMods`.
  return rollBreakdown({ wounds: 0, fatigue: 0, ...(looseMods.get(sheet.id) ?? {}) });
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
    // Only the wounds need a token. The Marshal's modifiers follow, because a
    // roll made over a piece of scene art with nothing placed still happens at
    // whatever the Marshal called.
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Bind a token to track wounds';
    strip.append(hint);
    strip.append(modifierGroup(sheet));
    return block;
  }

  const { token, state } = active;
  void token;
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

  const woundMax = woundLimit(sheet);
  if (woundMax > 0) {
    half.append(
      labelled(
        'Wounds',
        pips(
          woundMax,
          Math.min(state.wounds, woundMax),
          (n) => `${n} wound${n === 1 ? '' : 's'} — ${-n} to every trait roll`,
          (n) => change(setWounds(state, n, sheet)),
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
  chip.title = `${describeStatus(state, sheet)} — ${formatMod(penalty) || 'no'} modifier from wounds and Fatigue`;

  // An Extra has no wound track, so Incapacitated needs its own control.
  const out = isIncapacitated(state, sheet);
  const down = document.createElement('button');
  down.className = out ? 'toggle on danger-toggle' : 'toggle';
  down.textContent = out ? 'Incapacitated' : 'Down';
  down.title = out ? 'Bring back up' : 'Mark Incapacitated';
  down.addEventListener('click', () =>
    change(setWounds(state, out ? 0 : woundMax + 1, sheet)),
  );
  half.append(down);

  // Off the token, so the player who was hit sees the same offer the Marshal
  // does. This used to read a Map local to whichever client rolled the damage.
  const soakable = state.soakable ?? 0;
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
  strip.append(modifierGroup(sheet));
  return block;
}

/** Whether the modifier chips are unfolded. Sticky, since a fight tends to keep needing them. */
let showConditions = false;

/**
 * Situational modifiers for a character with no token on the map.
 *
 * Wounds and Fatigue genuinely need a token — they are the state of a body in a
 * scene, and there is nowhere to put them otherwise. The Marshal's own dial is
 * not: "that's a tough climb, −2" applies to a Stealth roll made over a piece of
 * scene art with no tokens placed at all, which is the case Damian raised. So
 * the dial falls back to here rather than being hidden along with the wounds.
 *
 * In memory, not in the store. These are the most transient thing in the app —
 * a call about one moment — and a −4 that survived a reload and silently taxed
 * every later roll would be worse than losing it.
 */
const looseMods = new Map<string, ModifierState>();

/** Where this sheet's modifiers live: on its token if it has one, otherwise loose. */
function modifierStateOf(sheet: Sheet): ModifierState {
  return activeToken(sheet)?.state ?? looseMods.get(sheet.id) ?? {};
}

function setModifierState(sheet: Sheet, next: ModifierState): void {
  const active = activeToken(sheet);
  if (active) {
    // Merge the two modifier fields onto the live token state rather than
    // writing `next` over it: `next` came from a `ModifierState`-shaped view, and
    // assigning it wholesale would be trusting that the wounds happened to ride
    // along. Absent rather than `undefined`, so a cleared dial leaves no key.
    void updateTokenState(active.token.id, (current) => {
      const merged: TokenState = { ...current };
      if (next.mod) merged.mod = next.mod;
      else delete merged.mod;
      if (next.conditions?.length) merged.conditions = next.conditions;
      else delete merged.conditions;
      return merged;
    }).then(refreshTokens);
    return;
  }
  looseMods.set(sheet.id, next);
  renderSheetArea();
}

/**
 * The green half of the row: everything the Marshal calls, as opposed to what
 * the character is carrying.
 *
 * A dial from −8 to +8 for the one-off ("that's a tough climb, −2") plus named
 * conditions from the book, which carry their page and exact wording in a
 * tooltip so nobody has to remember whether Dark is −2 or −4.
 *
 * Everything here is on the *roller*: it applies to every trait roll this
 * character makes until it is cleared. Cover, Range, Gang Up and The Drop are
 * deliberately absent — they belong to one attack against one target, and left
 * standing here they would quietly follow the character into their next Notice
 * roll. Hence the Clear button sitting right next to them.
 */
function modifierGroup(sheet: Sheet): HTMLElement {
  const group = document.createElement('div');
  group.className = 'modgroup';
  const state = modifierStateOf(sheet);
  const change = (next: ModifierState): void => setModifierState(sheet, next);

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
    // Signs only at the ends of each run: -8 … -1, 0, +1 … +8.
    //
    // Every pip used to be signed, which is the honest label for a track that
    // runs both ways — but seventeen of those will not fit on a line that must
    // not wrap. The sign is what costs the width, so it is spent where it
    // disambiguates: the two pips either side of zero, and the two extremes.
    // Between them position does the work, and the exact value is on hover.
    const ends = Math.abs(n) === 1 || Math.abs(n) === MANUAL_RANGE;
    pip.textContent = n === 0 ? '0' : ends ? formatMod(n) : String(Math.abs(n));
    pip.title = n === 0 ? 'No hand-dialled modifier' : `${formatMod(n)} to every trait roll`;
    pip.addEventListener('click', () => change(setManualMod(state, manual === n ? 0 : n)));
    return pip;
  };
  // A 0 pip rather than a separator: zero is a value on this track, and the
  // one you most often want to get back to.
  for (let n = -MANUAL_RANGE; n <= MANUAL_RANGE; n++) track.append(dial(n));
  // No "Modifier" caption: seventeen pips and a total need the whole line. A row
  // of pips beside a green total does not need naming, and each pip says what it
  // does on hover.
  track.title = `Modifier the Marshal called, ${formatMod(-MANUAL_RANGE)} to ${formatMod(MANUAL_RANGE)}`;
  line.append(track);

  // Straight from the rules module rather than re-added here: a target-side
  // condition like Vulnerable must not reach this total, and one filter in one
  // place is the only way that stays true.
  const active = situationsOf(state);
  const parts = situationalMods(state);
  const total = situationalTotal(state);

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
    // Green means "this changes the green number". A target-side condition does
    // not — it is a marker on the token and a note for whoever shoots at them —
    // so it gets the slate of its badge instead, and shows no figure, because
    // "Vulnerable +2" reads as a bonus for the wrong person.
    const marker = situation.affects === 'others';
    button.className = [marker ? 'cond marker' : 'cond', on ? 'on' : ''].join(' ').trim();
    button.textContent = marker
      ? situation.label
      : `${situation.label} ${formatMod(situation.value)}`.trim();
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

    // `soak` closes the window whether or not it worked: the Benny is spent
    // either way, and leaving the button up would sell a second attempt at the
    // same wound.
    await updateTokenState(tokenId, () => soak(state, total, wounds));

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
    const wounds = active?.state.soakable ?? 0;
    if (active && wounds > 0) return attemptSoak(sheet, active.token.id, active.state, wounds);
    notify('Nothing to Soak — apply some damage first');
    return;
  }

  // Refuse before charging. Spending a Benny to be told there was nothing to
  // reroll is the worst outcome available here, and the Benny does not come back.
  if (use === 'Reroll a Trait' && !lastTraitRoll.has(sheet.id)) {
    notify(`${sheet.name} has not rolled anything to reroll`);
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
      const card = await redrawCard(active.token.id, sheet);
      effect = card ? ` — drew ${cardLabel(card)}, and may act on either` : ' — the deck is empty';
    }

    if (use === 'Reroll a Trait') {
      effect = rerollLastTrait(sheet);
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
 * Roll the character's last trait roll again, for the Benny that just went.
 *
 * The whole roll, not just the die: the same expression, so the wound penalty and
 * whatever the Marshal had called are still in it, and the same target framing,
 * so an attack reroll still expands to the targeting table. In SWADE a reroll
 * replaces the first result outright — there is no keeping the better of the two
 * — so the new line stands on its own and the old one stays in the log as
 * history rather than being edited away.
 *
 * @returns a fragment for the Benny line, since the roll itself publishes separately.
 */
function rerollLastTrait(sheet: Sheet): string {
  const last = lastTraitRoll.get(sheet.id);
  // `spendBenny` checks this before charging; belt and braces for any other caller.
  if (!last) return ' — nothing to reroll';

  const dice: DieEvent[] = [];
  const explained = new RollInterpreter(
    new CommandContext(new JavaRandom(), (die) => dice.push(die)),
  )
    .run(parse([last.expression]))
    .trim();

  publishTrait(
    sheet,
    `${last.label} — reroll`,
    { expression: last.expression, explained, dice },
    last.mods,
    last.aimed,
    // Keeps this from replacing what it just redid, so a second Benny rerolls
    // the same trait rather than the reroll.
    true,
  );
  return ` — rerolled ${last.label}`;
}

/**
 * Give this combatant **one more** Action Card, from the same deck the round was
 * dealt from so it cannot be a card somebody else is holding.
 *
 * One card, and *added* rather than replacing what they hold. It used to call
 * `dealRound` with the character's Edges, which re-dealt their whole hand and
 * threw the old one away — so a Benny bought a Level Headed character two fresh
 * cards for one chip and lost them the card they had. Reported 2026-08-26, and
 * wrong even for a character with no Edges at all.
 *
 * The book is the other way round: *"You may choose your final Action Card from
 * any of your available choices, including additional draws from Level Headed,
 * Quick, etc."* — the draws pile up and the player picks.
 *
 * `NO_EDGES` rather than the character's, deliberately: this is *an* extra card,
 * not another go at their Edge. Level Headed already paid out when the round was
 * dealt, and paying again here would hand out two cards per Benny.
 */
async function redrawCard(tokenId: string, _sheet: Sheet): Promise<Card | undefined> {
  const state = initiative ?? (await freshInitiative());
  const result = dealRound(state, [{ tokenId, edges: NO_EDGES }], new JavaRandom());
  const draw = result.draws.get(tokenId);
  if (!draw) return undefined;

  await updateTokenState(tokenId, (current) => addToHand(current, draw.card));
  // Redrawing is not a new round; keep the round number where it was. The joker
  // flag is sticky too — a joker somebody else drew this round still owes the
  // deck a reshuffle, whatever this one card turned out to be.
  initiative = {
    ...result.state,
    round: state.round,
    jokerDealt: state.jokerDealt || result.state.jokerDealt,
  };
  await writeInitiative(initiative);
  // The row's hint is built from the hand on the token now, so nothing needs to
  // be remembered here.
  return draw.card;
}

/**
 * The initiative tab's per-combatant redraw.
 *
 * The rules reach a new card through a Benny, and that path is still there on
 * the sheet. This one costs nothing, because the table needs a redraw for all
 * the things the rules do not cover — someone joining mid-fight, a misdeal, a
 * card that went to the wrong bandit — and asking the Marshal to spend a Benny
 * they then have to award back is bookkeeping, not a rule.
 *
 * Two different jobs behind one button, split on whether they already hold a
 * card. A mook with none is **joining** — they take the gang's card. A mook who
 * has one is **dealt another**, which is still the escape hatch for the bandit
 * who should not be on the gang's card, but now in two steps rather than one:
 * the card arrives beside theirs and somebody picks it.
 *
 * Two steps on purpose. This is the same button a player presses to spend the
 * card a Benny bought them, and it cannot both add-and-keep for them and
 * add-and-switch for the Marshal. Adding without choosing is the honest version
 * of both, and one press per body still applies to a gang.
 */
async function replaceCard(tokenId: string): Promise<void> {
  const table = combatants(tokens, sheets);
  const combatant = table.find((c) => c.tokenId === tokenId);
  if (!combatant) return;

  // Dealing a latecomer in, which is what this button is labelled for: a mook
  // that arrives after the round was dealt joins the gang already acting rather
  // than drawing against it. Only when they hold nothing — pressing Deal on a
  // mook who *has* a card is the surgical case, and still draws.
  const joining = combatant.card ? undefined : gangCard(combatant, table);
  if (joining) await setHands(new Map([[tokenId, { cards: [joining], chosen: joining }]]));
  const card = joining ?? (await redrawCard(tokenId, combatant.sheet));

  // Named per token, as the deal is: one of five bandits sharing a sheet has to
  // be identifiable in the log. The published line is named for everyone, so a
  // private character shows as its token whoever pressed the button.
  const who = displayName(combatant, table, false);
  // Nothing for a token the players cannot see. See the deal, above.
  if (combatant.hidden) {
    await refreshTokens();
    return;
  }
  publish({
    label: joining ? 'joins the fight' : 'draws an extra Action Card',
    expression: 'initiative',
    explained: card
      ? joining
        ? `${who} in on ${cardLabel(card)}`
        : // "also holds", not "now on": the new card is added to the hand and the
          // player decides whether to act on it. Saying "now on" would announce a
          // choice they have not made yet.
          `${who} also holds ${cardLabel(card)}`
      : `${who} — the deck is empty`,
  });
  await refreshTokens();
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

/**
 * Bind / unbind, in the header beside Edit.
 *
 * It used to be a bar at the foot of the sheet that returned nothing at all when
 * no token was selected — so a Marshal who had not already worked out that
 * selection was the missing step saw no control, no hint, and no reason to think
 * one existed. Damian lost about ten minutes to exactly that, and it gated
 * everything downstream, because the modifier breakdown he was hunting for only
 * appeared once a token was bound.
 *
 * So it is always here, and it is never blank: when there is nothing to do it is
 * disabled and its tooltip names the next step. One button rather than two,
 * because binding and unbinding are never both the obvious action — if something
 * bindable is selected you mean to bind it, and otherwise you mean to let go.
 */
function updateBindButton(): void {
  const button = bar.bind;
  const sheet = sheets.find((s) => s.id === selectedId);
  if (!sheet || !maySee(sheet) || tab !== 'sheet') {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.classList.remove('warn');

  const bound = tokensForSheet(tokens, sheet.id);
  const boundHere = new Set(bound.map((t) => t.id));
  // Only character tokens we know about: a selection can include props, notes or
  // drawings, and counting those made the button promise more than it would bind.
  const known = new Set(tokens.map((t) => t.id));
  const toBind = selectedTokenIds.filter((id) => known.has(id) && !boundHere.has(id));

  // What is true right now, on every state — the button is the only place this
  // is said since the old bar went.
  const clash = duplicateWildCard(tokens, sheet);
  const status = clash
    ? `${bound.length} tokens share this Wild Card — wounds are shared between them`
    : bound.length === 0
      ? `${sheet.name} is not on the map`
      : bound.length === 1
        ? `${sheet.name} is bound to "${bound[0]!.name}"`
        : `${sheet.name} is shared by ${bound.length} tokens`;
  if (clash) button.classList.add('warn');

  if (toBind.length) {
    const first = tokens.find((t) => t.id === toBind[0]);
    button.textContent = toBind.length === 1 ? 'Bind' : `Bind ${toBind.length}`;
    button.disabled = false;
    button.title =
      `${status}.\nBind ${
        toBind.length === 1 ? `"${first?.name ?? 'the selected token'}"` : `${toBind.length} tokens`
      } to it — ` +
      (sheet.wildCard ? 'a Wild Card should be on one token' : 'each token keeps its own wounds');
    button.onclick = () => {
      void (async () => {
        for (const id of toBind) await bindToken(id, sheet.id);
        await refreshTokens();
      })();
    };
    return;
  }

  if (bound.length) {
    // Unbind what is selected if any of it is bound here, otherwise all of it —
    // so one bandit can be detached without dissolving the gang.
    const selectedBound = selectedTokenIds.filter((id) => boundHere.has(id));
    const targets = selectedBound.length ? selectedBound : bound.map((t) => t.id);
    const partial = selectedBound.length > 0 && bound.length > selectedBound.length;
    button.textContent = partial ? `Unbind ${targets.length}` : 'Unbind';
    button.disabled = false;
    button.title = `${status}.\n${
      partial ? `Unbind the ${targets.length} selected` : `Unbind all ${bound.length}`
    }`;
    button.onclick = () => {
      void (async () => {
        for (const id of targets) await unbindToken(id);
        await refreshTokens();
      })();
    };
    return;
  }

  // Nothing bound and nothing selected — the state Damian was stuck in. Say what
  // to do rather than disappearing.
  button.textContent = 'Bind';
  button.disabled = true;
  button.title = `${status}.\nSelect a token on the map to bind it to ${sheet.name}`;
  button.onclick = null;
}

async function refreshTokens(): Promise<void> {
  tokens = await characterTokens();
  renderSheetArea();
  await renderBadges(tokens, sheets, isGM);
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
  // The one place players and the Marshal behave differently, and deliberately
  // the only one.
  //
  // Clicking a token swaps the sheet on screen, which is how the Marshal works —
  // six characters, whichever is up. For a player it is wrong twice over: they
  // have one character and clicking the thing they are about to shoot takes them
  // off it, halfway through a multi-action; and the thing they clicked is
  // usually the Marshal's, which they should not be reading. Selection still
  // does everything else it did — targeting for damage, the initiative
  // highlight, the badges — because those are about what is on the map, not
  // about whose sheet is open. Players change that with the picker.
  const binding = readBinding(tokens.find((t) => t.id === selectedTokenId)?.metadata);
  if (isGM && binding && sheets.some((s) => s.id === binding.sheetId)) {
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
  // A Wild Card is marked with a star, which is how the stat blocks themselves
  // write it and so the notation a Marshal already reads. Appended rather than
  // put in the name: the name is what goes in the log and on the token, and a
  // glyph in it was exactly the mistake the bestiary data had made.
  if (sheet.wildCard) {
    const star = document.createElement('span');
    star.className = 'wc-star';
    star.textContent = '★';
    star.title = 'Wild Card — three Bennies, a Wild Die, and takes three wounds';
    h1.append(star);
  }
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
    // Running belongs beside Pace because it *is* Pace: the die is added to it
    // for the round. Anywhere else and it is a die with no number to add to.
    if (label === 'Pace' && typeof value === 'number') wrap.append(runButton(sheet, value));
    derived.append(wrap);
  }
  if (derived.childElementCount) sheetEl.append(derived);

  // One breakdown for the whole sheet: the label a button shows and the roll it
  // makes are the same number by construction, and the log gets the itemisation.
  const mods = modsFor(sheet);
  const penalty = mods.total;

  // Classified once per render rather than per row: `abilityNotes` walks every
  // edge, hindrance and ability on the sheet, and the trait buttons then ask it
  // which of them belong to each row.
  const notes = abilityNotes(sheet);

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
      traitButton(
        label,
        dieLabel(`d${trait.die}`, trait.mod),
        false,
        () => {
          publishTrait(sheet, label, rollAttribute(sheet, attribute as Attribute, penalty), mods);
        },
        notesForTrait(notes, label),
      ),
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
    // Fighting rolled from here is the same roll as Fighting rolled from the
    // weapons table, so it gets the same targeting table. What it cannot carry is
    // range bands — those belong to a weapon, and this button does not know which
    // one you swung. The table copes: it shows the distance in cells and simply
    // no band, which is exactly right for a melee attack anyway.
    const aimed = isTargeted(skill) ? { skill } : undefined;
    skills.append(
      traitButton(
        skill,
        trait ? dieLabel(`d${trait.die}`, trait.mod) : dieLabel('d4', -2),
        !trait,
        () => publishTrait(sheet, skill, rollSkill(sheet, skill, penalty), mods, aimed),
        notesForTrait(notes, skill),
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
    sheetEl.append(section('Hindrances'), entryList(sheet, sheet.hindrances, notes));
  }
  if (sheet.edges.length) {
    sheetEl.append(section('Edges'), entryList(sheet, sheet.edges, notes));
  }
  if (sheet.powers?.length) {
    sheetEl.append(section('Powers'), entryList(sheet, sheet.powers, notes));
  }
  renderGear(sheet, mods);

  if (sheet.advances) {
    const p = document.createElement('p');
    p.className = 'prose';
    p.textContent = sheet.advances;
    sheetEl.append(section('Advances'), p);
  }

  // Binding moved to the header, beside Edit — see `updateBindButton`. It used
  // to be a bar here, which is where it was invisible.
}

// ---------------------------------------------------------------------------
// The shot panel
// ---------------------------------------------------------------------------

/**
 * One shot being lined up, from picking up the gun to applying the wound.
 *
 * ## Why the roll is not the first thing that happens
 *
 * The weapons table used to roll Shooting the moment you pressed it, and *then*
 * offer a table of everyone it might have been aimed at, each with their own
 * hit, miss and raise count worked out. Damian objected, and was right: it shows
 * the outcome against six people when the player had already decided which one
 * they were shooting at, and it reads as the app dealing out possibilities.
 *
 * The book agrees, and says so in as many words (p147): *"Before you roll, assign
 * your dice to all possible targets."* So the target is named first and the dice
 * come after.
 *
 * ## The one thing that cannot be taken back
 *
 * Everything on a shot stays adjustable after the dice land except the dice. The
 * Marshal reads the logged roll, says "you aimed last round", the player clicks
 * Aim, and the damage is rolled against the corrected number. Nothing re-rolls.
 * That is `lockedByTheRoll` in `shot.ts`, and it means the panel has exactly one
 * irreversible step for the player to feel.
 *
 * ## Where this lives
 *
 * Module state, ephemeral, and it must stay that way. It is not written to room
 * metadata, which is a whole-document 16 kB budget that a fight had already
 * pushed to 106% — and none of this outlives the shot anyway. Same reasoning as
 * `adjustments`, next door.
 *
 * !! Rate of Fire is fixed at 1 here. The rules for firing more are written and
 * tested in `shot.ts` — Recoil, the stray window, the ceiling — but the panel
 * needs a step for assigning each rolled die to a declared target before it can
 * offer them, and that is the next piece rather than this one. !!
 */
interface ShotSession {
  /** Sheet and weapon together, so the panel reopens on the right row. */
  key: string;
  skill: string;
  bands?: RangeBands;
  aim: Aim;
  /**
   * A called shot, as the **Scale of what is being aimed at** — p161, `SCALES`.
   *
   * No list of body parts: the penalty *is* the size, and the old head/limb/hand
   * list was that table read off a human. `undefined` is no called shot; zero is
   * a called shot at something Normal-sized, which is free and still a called
   * shot. Nothing here may test it for truthiness.
   */
  scale?: number;
  /** Head or vital organs: +4 damage on a hit (p154). Orthogonal to the size. */
  vitals: boolean;
  scoped: boolean;
  slugs: boolean;
  dial: number;
  /**
   * Cover, for the whole shot.
   *
   * Per *target* until Damian read the layout the other way: five sets of cover
   * buttons down the target list said "set everybody's cover before you roll",
   * when what he wanted to say was "he's behind the bar". The rule is per target
   * — the water trough belongs to whoever is behind it — but the control that
   * expressed that was asking a question nobody was answering five times.
   *
   * So it is one control now, in the conditions block with everything else. The
   * thing it can no longer say is that of two targets one is in the open and the
   * other is not; that costs a second shot, or the hand dial.
   */
  cover: number;
  /**
   * Where the Marshal has *overruled* the app about being in melee.
   *
   * A shot inside `PARRY_VISIBLE_CELLS` is assumed to be into melee and resolved
   * against the defender's Parry (p160). That is an assumption, not a fact —
   * standing a yard apart is not the same as wrestling — so the row's target
   * number is a button, and what it writes here is the exception rather than the
   * rule. Empty means the app's answer stands, which is the common case.
   */
  meleeCall: Map<string, boolean>;
  /**
   * How many Shooting dice this shot may throw.
   *
   * The weapon's Rate of Fire is a **ceiling**, not a quantity — *"Unless the
   * weapon says otherwise, you can always roll less dice"* (p147) — and this is
   * what the shooter chose. Recoil and the stray-shot window both read the number
   * actually fired, which is `declared.length` rather than this: declaring two
   * targets out of a possible three throws two dice.
   */
  rof: number;
  /**
   * How many shots each target was declared to receive, in the order named.
   *
   * `"Before you roll, assign your dice to all possible targets. With a Rate of
   * Fire 3, for example, you might put 2 dice into one walkin' dead and a third
   * into another"` (p147). So the declaration is a **count per target**, not a
   * list of targets — two bullets into one man is a thing you say before you
   * fire, and the sum of the counts is how many dice are thrown.
   *
   * What stays free until after the roll is *which* result fills each slot:
   * *"assign them in whatever order you like to the targets you declared"*. The
   * counts are the plan; the placing is the reveal.
   *
   * A Map for its insertion order, which is the order the targets were named and
   * therefore the order they are shown in. A target dialled back to zero is
   * deleted rather than kept at 0, so it leaves that order too.
   */
  bullets: Map<string, number>;
  /**
   * Whether Recoil is cancelled outright for this shooter and this gun.
   *
   * `"Ignore the Recoil penalty when firing weapons with a RoF of 2 or higher"` —
   * the Rock and Roll! Edge (p47), and the same for a bipod or tripod written on
   * the weapon. Read once when the panel opens rather than on every render: it is
   * a fact about the sheet and the gun, and neither changes mid-shot.
   */
  steady: boolean;
  /** Set once the dice have been thrown, and never unset except by a new shot. */
  rolled?: {
    entryId: string;
    expression: string;
    /**
     * One total per shot, in the order the engine reported them.
     *
     * Not one per die *rolled*: `3s8` throws three trait dice and the Wild Die
     * and drops the lowest of the four, so four dice produce three shots.
     */
    values: number[];
    /**
     * Which target each shot was given — an index into `values`, to a `tokenId`.
     *
     * This way round, not target-to-shot, and that is the difference between
     * allowing the book's own example and forbidding it: *"With a Rate of Fire 3,
     * for example, you might put 2 dice into one walkin' dead and a third into
     * another."* A map keyed by target can only hold one shot each.
     *
     * Filled **after** the roll, by hand, which is the rule rather than a
     * convenience: *"assign them in whatever order you like to the targets you
     * declared"*.
     */
    assigned: Map<number, string>;
    /**
     * Whether the per-target modifiers are already inside `values`.
     *
     * True for a shot at a single target, where range and cover are unambiguous
     * and can ride in the rolled expression — which keeps the log line reading
     * `s8-2 … = 13` as it does today. False the moment there is more than one
     * target, because one expression cannot carry two different range penalties;
     * there the values are raw and each target's modifiers are applied to its own
     * assigned shot at resolution.
     */
    baked: boolean;
    /**
     * The band each declared target was in **when the trigger was pulled**.
     *
     * Frozen rather than re-measured. The range at the moment of the shot is a
     * fact about the shot, and a target who walks two cells afterwards did not
     * retroactively make it a harder one.
     */
    bands: Map<string, Band | undefined>;
    /** Everything the sheet contributed, which is inside `values` either way. */
    sheetTotal: number;
    /**
     * The modifiers as they stand, corrections included.
     *
     * The full per-target set when `baked`; the shot-level set — Aim, Recoil, the
     * called shot, the dial — when not, since the per-target half differs per
     * target and is recomputed at render.
     *
     * Only the current set is kept. A snapshot of how the shot looked when it was
     * fired was written here and never read — the log already holds that, in the
     * entry the corrections amend, which is the copy that survives a reload.
     */
    current: ShotMod[];
    total: number;
    /**
     * How many skill dice came up inside the stray window.
     *
     * Counted once, when the dice land, because the window is a fact about the
     * shot as fired and the raw dice are not recoverable afterwards — `values`
     * holds totals, and a baked shot has the range already subtracted into them.
     * The Wild Die is excluded by `strayShots`; the rule never counts it.
     */
    stray: number;
    /** 1, or 2 for a shot that sprays. See `straysAsFired`. */
    strayOn: number;
    /**
     * What each declared target had to be beaten by, frozen when the trigger was
     * pulled — 4, or their Parry for a shot into melee.
     *
     * Frozen for the same reason `bands` is, and more sharply: the melee call is
     * made from a live distance, so a target who steps back after the roll would
     * otherwise turn a hit into a miss with nothing said. Changing it afterwards
     * is a correction, and is published as one.
     */
    targets: Map<string, number>;
  };
  /**
   * The damage roll for each *shot*, once there is one.
   *
   * Keyed by the shot rather than the target, because two shots may land on the
   * same target and each is its own attack with its own raise die — the book's
   * own example rolls 2d6 against the first devil bat and 3d6 against the second,
   * which got the raise.
   *
   * Held so the panel can carry the sequence through to Apply. Without it the
   * player has to go and find the token in OBR and press Apply on the log line —
   * for damage the panel itself rolled, at a target the panel itself declared.
   */
  damageIds: Map<number, string>;
}

let openShot: ShotSession | undefined;

/**
 * How much of the target each step of `COVER` hides, as the book describes it.
 *
 * The values are the penalties, which is what the rules module keys on — but a
 * penalty is the *consequence* of the judgement, not the judgement. What the
 * Marshal is actually deciding is how much of the man is behind the water
 * trough, and `COVER`'s own notes say it in those words: "half the target is
 * obscured", "three quarters". So the buttons carry the fraction and the
 * penalty is on hover, which is also the only way five of them fit on a row
 * that already holds a name, a range and two totals.
 */
/** `SCALES`' seven steps, short enough for a row of buttons. */
const SCALE_SHORT: Record<number, string> = {
  [-6]: 'Tiny',
  [-4]: 'V.sml',
  [-2]: 'Small',
  0: 'Norm',
  2: 'Lge',
  4: 'Huge',
  6: 'Garg',
};

const COVER_FRACTION: Record<number, string> = {
  0: '0',
  [-2]: '\u00bc',
  [-4]: '\u00bd',
  [-6]: '\u00be',
  [-8]: 'most',
};

/**
 * Whether the shot's conditions are unfolded.
 *
 * Its own flag rather than the sheet's `showConditions`, which governs the green
 * modifier chips at the top of the sheet: they are two expanders over two
 * different sets of things, and sharing one would mean opening the Marshal's
 * situational track every time somebody wanted to say "he's behind the bar".
 *
 * Sticky across renders and across shots, like the sheet's, because a fight tends
 * to keep needing the same half-dozen controls.
 */
let showShotConditions = false;

function shotKey(sheet: Sheet, weapon: Weapon): string {
  return `${sheet.id}::${weapon.name}`;
}

/**
 * Open the panel on this weapon, or close it if it is already open.
 *
 * Opening a different weapon replaces the session outright rather than keeping
 * two. A half-aimed shot with the other gun is not something anyone wants
 * restored three rounds later, and a shot the player has walked away from should
 * cost nothing to abandon — the manual roller and manual wounds are always there,
 * and are the answer whenever the panel cannot express what happened.
 */
function toggleShot(sheet: Sheet, weapon: Weapon, skill: string, bands?: RangeBands): void {
  const key = shotKey(sheet, weapon);
  openShot =
    openShot?.key === key
      ? undefined
      : {
          key,
          skill,
          ...(bands ? { bands } : {}),
          aim: 'off',
          scoped: false,
          slugs: false,
          dial: 0,
          cover: 0,
          vitals: false,
          meleeCall: new Map(),
          rof: maxRateOfFire(weapon),
          steady: negatesRecoil(
            sheet.edges.map((edge) => edge.name),
            weapon.notes,
          ),
          bullets: new Map(),
          damageIds: new Map(),
        };
  render();
}

// The cycle's arithmetic lives in `shot.ts`, where it can be tested without OBR
// — `bakesModifiers` in particular decides which of two resolution paths a shot
// takes, and had nothing covering it.
const shotsFired = (session: ShotSession): number => shotsOf(session.rof, session.bullets);
const bulletsLeft = (session: ShotSession): number => spareBullets(session.rof, session.bullets);

/**
 * The modifiers on a shot at one target, whichever way the roll was made.
 *
 * Per-target modifiers are inside the rolled values when the shot had a single
 * target, and outside them when it had several — see `rolled.baked`. Everything
 * that resolves a shot goes through here, so that distinction is made once
 * rather than at each of the four places that need the number.
 */
/**
 * Whether this shot at this target is *into melee*, and so resolved against
 * their Parry rather than the flat 4 — p160, and `PARRY_VISIBLE_CELLS` for why a
 * distance is allowed to decide it.
 *
 * The app's answer, unless the Marshal has said otherwise. It used to be the
 * other way round — offered and never assumed — which meant the rule only fired
 * when somebody remembered it existed.
 */
function intoMelee(session: ShotSession, tokenId: string, cells: number | undefined): boolean {
  return session.meleeCall.get(tokenId) ?? showsParry(session.skill, cells);
}

function shotAgainst(
  session: ShotSession,
  weapon: Weapon,
  tokenId: string,
): { mods: ShotMod[]; total: number; band: Band | undefined } {
  const band = session.rolled ? session.rolled.bands.get(tokenId) : undefined;
  const shot = shotMods(session, band);
  const gun = shotgunMod(weapon, session.slugs);
  return {
    mods: gun ? [...shot.mods, gun] : shot.mods,
    total: shot.total + (gun?.value ?? 0),
    band,
  };
}

/**
 * A cartridge, for the per-target shot count.
 *
 * Drawn rather than spelled, because "2 bullets" in a table cell is three times
 * the width of the thing it describes and the row is already carrying a name, a
 * range and five cover chips. `currentColor` throughout, so a spent round and an
 * unspent one differ only by the colour the button gives it.
 */
function cartridge(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 8 18');
  svg.setAttribute('width', '7');
  svg.setAttribute('height', '15');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  // Pointed nose, straight case, a rim at the base — a cartridge rather than a
  // bullet, since what is being counted is what goes into the gun.
  path.setAttribute('d', 'M4 0.5 C6 3 6.8 5 6.8 7 L6.8 12 L1.2 12 L1.2 7 C1.2 5 2 3 4 0.5 Z');
  path.setAttribute('fill', 'currentColor');
  const rim = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rim.setAttribute('x', '0.6');
  rim.setAttribute('y', '12.4');
  rim.setAttribute('width', '6.8');
  rim.setAttribute('height', '4.6');
  rim.setAttribute('rx', '1');
  rim.setAttribute('fill', 'currentColor');
  svg.append(path, rim);
  return svg;
}

/**
 * Put the panel back to before the dice, keeping how the shot is being taken.
 *
 * A turn is often two shots — a Multi-Action, or simply the next round — and
 * closing the panel and reopening it to fire again is clumsy and loses the cover
 * and the dial along with the spent shot. So the declaration controls stay live
 * after a shot resolves, and touching one starts the next.
 *
 * Aim, the called shot, the dial, the load and the per-target cover all survive.
 * They are how this character is shooting, not what they shot at.
 */
function nextShot(session: ShotSession): void {
  delete session.rolled;
  session.bullets = new Map();
  session.damageIds = new Map();
}

/** A small labelled row of mutually exclusive buttons. */
function shotChoice<T>(
  label: string,
  options: readonly { value: T; text: string; title: string }[],
  current: T,
  pick: (value: T) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'shot-choice';
  const name = document.createElement('span');
  name.className = 'shot-label';
  name.textContent = label;
  row.append(name);
  for (const option of options) {
    const button = document.createElement('button');
    button.className = option.value === current ? 'shot-opt on' : 'shot-opt';
    button.textContent = option.text;
    button.title = option.title;
    button.addEventListener('click', () => pick(option.value));
    row.append(button);
  }
  return row;
}

/**
 * The modifiers on this shot at one particular target.
 *
 * The sheet's own `RollBreakdown` is deliberately *not* folded in here — it is
 * added once at the roll, and `ShotRequest.state` is left empty for the same
 * reason. Both carry the situational track, and passing both would count the
 * dark twice.
 */
function shotMods(session: ShotSession, band: Band | undefined): ShotTotal {
  return shotTotal({
    // What is actually being fired, not what the gun could fire. A Gatling
    // declared against one target throws one die and takes no Recoil.
    rof: shotsFired(session),
    aim: session.aim,
    ...(session.scale === undefined ? {} : { scale: session.scale }),
    ...(band ? { band } : {}),
    cover: session.cover,
    scoped: session.scoped,
    dial: session.dial,
    // Rock and Roll!, a bipod or a tripod. This was the last wire left unjoined:
    // `negatesRecoil` was written and tested and nothing ever called it, so
    // Reggie — who has the Edge — was paying the −2 the Edge exists to remove.
    steady: session.steady,
  });
}

/**
 * Publish a correction to a roll that has already been made.
 *
 * Appends rather than editing — see `RollEntry.amends`. The label says what
 * changed in words rather than as a delta, because a Marshal reading "you aimed
 * last round" back off the log wants to see the word Aim, not "+4".
 */
function amendShot(
  sheet: Sheet,
  session: ShotSession,
  mods: ShotMod[],
  /** The shot's own modifiers, summed. */
  modTotal: number,
  /** Everything the sheet contributes: wounds, fatigue, the token's own track. */
  sheetTotal: number,
): void {
  const rolled = session.rolled;
  if (!rolled) return;
  const what = describeAmendment(rolled.current, mods);
  if (!what) return;
  // What the log shows is the **roll** total, not the modifier sum. They are
  // different numbers and putting the wrong one here would publish an entry whose
  // `total` says -4 for a roll of 7 — and `RollLog.latest` hands that number to
  // whatever reads the line next.
  rolled.current = mods;
  rolled.total = modTotal;
  // A shot at one target has one total, and the correction can say what it
  // became. A shot at several does not: the same click changes a different number
  // for each of them, so the line says what changed and the panel shows what each
  // target's shot now comes to. Publishing one of the totals would be picking a
  // target the correction was not about.
  const one = rolled.baked && rolled.values.length === 1 ? rolled.values[0] : undefined;
  const after = one === undefined ? undefined : one - rolled.total + modTotal;
  void sheetTotal;
  // A shot at one target has one total, and the correction can say what it became.
  //
  // A shot at several does not, and must not pretend to. Its rolled values are
  // raw — the per-target modifiers were never inside them — so there is no sum to
  // rewrite here; what changed is the modifier the panel then applies to each
  // shot. Saying so is honest and still visibly *something*, which is the
  // complaint: a correction that printed nothing looked like a correction that
  // did nothing.
  publish({
    ...named(sheet),
    label: what,
    expression: rolled.expression,
    explained:
      one !== undefined && after !== undefined
        ? `${one} → **${after}**`
        : `on each shot: ${formatMod(rolled.total) || '0'} → **${formatMod(modTotal) || '0'}**`,
    ...(after === undefined ? {} : { total: after }),
    amends: rolled.entryId,
    ...(mods.length ? { mods: asRollMods(mods) } : {}),
  });
}

/**
 * Recompute the declared shot and log a correction if anything moved.
 *
 * Called from every control, after the change and before the redraw. It no-ops
 * before the roll — there is nothing to correct yet — and no-ops again when the
 * modifiers come out identical, so a control clicked back to where it started
 * costs nothing.
 *
 * Deliberately *not* called from the render path. Doing it there would publish an
 * amendment every time a target drifted across a band boundary, which is a change
 * nobody asked for. A correction is something a person does.
 */function amendFromControls(
  sheet: Sheet,
  weapon: Weapon,
  session: ShotSession,
  sheetMods: RollBreakdown,
): void {
  const rolled = session.rolled;
  if (!rolled) return;
  // For a baked shot the correction is measured against the one target's full
  // set. For an unbaked one it is measured against the shot-level half only —
  // range and cover differ per target and are applied at resolution, so a change
  // to them is not a change to *the shot*.
  const first = [...session.bullets.keys()][0];
  const next = rolled.baked && first ? shotAgainst(session, weapon, first) : shotLevel(session, weapon);
  amendShot(sheet, session, next.mods, next.total, sheetMods.total);
}

/**
 * The half of a shot's modifiers that are the same whoever it is aimed at: Aim,
 * Recoil, the called shot and its size, the load, the hand dial — and now cover
 * too, since that is declared once for the whole shot.
 *
 * Used when the shot has more than one target, where the genuinely per-target
 * half cannot be summed into one number without picking a target to be right
 * about. **Range** is all that half now holds, and it is enough: one rolled
 * expression cannot carry two different range penalties, which is what
 * `bakesModifiers` turns on.
 *
 * One consequence of cover moving: changing it on a multi-target shot after the
 * dice have landed now publishes a correction, where before it changed each
 * target's arithmetic in silence.
 */
function shotLevel(session: ShotSession, weapon: Weapon): { mods: ShotMod[]; total: number } {
  const shot = shotMods(session, undefined);
  const gun = shotgunMod(weapon, session.slugs);
  return {
    mods: gun ? [...shot.mods, gun] : shot.mods,
    total: shot.total + (gun?.value ?? 0),
  };
}

/**
 * The panel that opens under a weapon: how you are shooting, then who at.
 *
 * Rebuilt from scratch on every change, like the rest of the sheet. The targets
 * arrive asynchronously — ranges come from OBR — so the list fills in under a
 * placeholder rather than the whole panel waiting on the scene.
 */
function shotPanel(sheet: Sheet, weapon: Weapon, sheetMods: RollBreakdown): HTMLElement {
  const session = openShot!;
  const box = document.createElement('div');
  box.className = 'shot';
  // Every control goes through here: change the session, log the correction if
  // the dice have already been thrown, then rebuild. A control that skipped this
  // would change the arithmetic without telling the Marshal, which is the one
  // thing the amendment mechanism exists to prevent.
  const redraw = (): void => {
    amendFromControls(sheet, weapon, session, sheetMods);
    render();
  };

  // --- how the shot is being taken ----------------------------------------

  // How many shots is not a condition and does not fold away. It is the shot
  // itself: it decides how many dice are thrown, it is locked the instant they
  // are, and hiding it would hide the only control on this panel that cannot be
  // changed afterwards.
  const controls = document.createElement('div');
  controls.className = 'shot-controls';

  // Everything else, behind one expander. Six rows of buttons above a target list
  // is the same furniture problem the sheet's own conditions had, and it folds
  // away the same way.
  const conditions = document.createElement('div');
  conditions.className = 'shot-controls shot-conditions';

  /**
   * A control that folds away — unless it is *set*.
   *
   * A called shot or a −4 cover that vanished while its penalty stayed in the
   * total would leave the Marshal looking at a number with no visible cause,
   * which is the failure mode of every collapsed panel. So the fold hides the
   * defaults and nothing else.
   */
  const place = (row: HTMLElement, active: boolean): void => {
    if (showShotConditions || active) conditions.append(row);
  };

  // Only for a weapon that can fire more than once. A revolver's Rate of Fire is
  // not a decision, and a row of one button is a row that says nothing.
  const ceiling = maxRateOfFire(weapon);
  if (ceiling > 1) {
    controls.append(
      shotChoice(
        'Shots',
        Array.from({ length: ceiling }, (_, i) => ({
          value: i + 1,
          text: String(i + 1),
          title:
            i === 0
              ? 'One shot. No Recoil, and the stray-shot window stays at 1 (p161)'
              : `Up to ${i + 1} shots — ${i + 1} Shooting dice, and −2 Recoil for firing more than one (p161)`,
        })),
        session.rof,
        (value) => {
          // Locked once the dice are thrown: it is the one thing that decides how
          // many there were. See `lockedByTheRoll`.
          if (session.rolled) return;
          session.rof = value;
          // Bullets already spoken for beyond the new ceiling are given back
          // rather than silently ignored, so what is on screen is what will be
          // rolled. Trimmed from the last target named, which is the one the
          // player was most recently thinking about.
          let over = [...session.bullets.values()].reduce((a, b) => a + b, 0) - value;
          for (const id of [...session.bullets.keys()].reverse()) {
            if (over <= 0) break;
            const had = session.bullets.get(id)!;
            const keep = Math.max(0, had - over);
            over -= had - keep;
            if (keep) session.bullets.set(id, keep);
            else session.bullets.delete(id);
          }
          render();
        },
      ),
    );
  }

  place(
    shotChoice(
      'Aim',
      [
        { value: 'off' as Aim, text: 'No', title: 'Not aimed' },
        {
          value: 'cancel' as Aim,
          text: 'Cancel 4',
          title:
            'Spent last turn aiming: ignore up to 4 points of range, cover, called shot, scale or speed (p152)',
        },
        {
          value: 'bonus' as Aim,
          text: '+2',
          title: 'Spent last turn aiming, taken as a flat +2 instead (p152)',
        },
      ],
      session.aim,
      (value) => {
        session.aim = value;
        redraw();
      },
    ),
    session.aim !== 'off',
  );

  // A called shot is a **size**, not a body part — p161: `"Use the Scale of the
  // target when making called shots against creatures, not their Scale."` The
  // head/limb/hand list this replaced was that same table read off a human, and
  // it stopped being right the moment the target was a rattler. Examples on
  // hover, because nobody can rank "very small" against "small" from the words
  // and everybody can rank a house cat against a bobcat.
  place(
    shotChoice(
      // Just "Called": the row is eight buttons wide, and the caption is the only
      // thing on it with characters to give up. Everything else about the row is
      // deliberately the standard metrics — the 64px caption column and the same
      // button padding as Aim and Cover — because the three rows sit on top of
      // each other and unequal padding reads as a mistake long before anyone
      // notices it bought a few pixels.
      'Called',
      [
        { value: undefined as number | undefined, text: 'No', title: 'Shooting at the body' },
        ...SCALES.map((scale) => ({
          value: scale.value as number | undefined,
          // Abbreviated: seven named steps and a caption do not fit a panel this
          // narrow at full length. The whole name is on hover with the examples.
          text: SCALE_SHORT[scale.value] ?? scale.label,
          title:
            `${scale.label}: ${scale.examples}. ` +
            `${formatMod(scale.value) || 'No penalty'} to hit (p161).`,
        })),
      ],
      session.scale,
      (value) => {
        // `undefined` and `0` are different answers here — a called shot at a
        // Normal-sized thing is free and is still a called shot.
        if (value === undefined) delete session.scale;
        else session.scale = value;
        redraw();
      },
    ),
    session.scale !== undefined,
  );

  // Whether it is a *vital* spot, which the size cannot say: a rattler's head is
  // Gargantuan and a man's is Very Small, and both are vitals. Only asked once a
  // called shot has been declared, because you have to call it to hit it.
  if (session.scale !== undefined) {
    conditions.append(
      shotChoice(
        'Vitals',
        [
          { value: false, text: 'No', title: 'Not a vital spot' },
          {
            value: true,
            text: `+${VITALS_DAMAGE} damage`,
            title:
              `Head or vital organs of a living creature: +${VITALS_DAMAGE} damage on a hit ` +
              `(p154). Against an open-faced helmet it is −5 to hit instead of −4 and ` +
              `bypasses the armour — use the dial.`,
          },
        ],
        session.vitals,
        (value) => {
          session.vitals = value;
          redraw();
        },
      ),
    );
  }

  // Only worth asking when the answer changes something. A scope matters at
  // Extreme Range and nowhere else the book names.
  if (reachesExtreme(weapon, session.slugs)) {
    place(
      shotChoice(
        'Scope',
        [
          { value: false, text: 'No', title: 'Iron sights' },
          { value: true, text: 'Yes', title: 'Extreme Range costs 6 instead of 8 (p146)' },
        ],
        session.scoped,
        (value) => {
          session.scoped = value;
          redraw();
        },
      ),
      session.scoped,
    );
  }

  // Cover is the target's, not the shooter's — but as one control rather than one
  // per row. See `ShotSession.cover` for why it moved, and what moving it costs.
  place(
    shotChoice(
      'Cover',
      COVER.map((step) => ({
        value: step.value,
        // How much of the target is behind it, which is what the book's four
        // steps actually measure — `COVER`'s own notes read "half the target is
        // obscured", "three quarters". The penalty is on hover: the fraction is
        // what the Marshal is judging, the −4 is what falls out of it.
        text: COVER_FRACTION[step.value] ?? String(Math.abs(step.value)),
        title: `${step.label} cover, ${formatMod(step.value) || 'no penalty'} — ${step.note}`,
      })),
      session.cover,
      (value) => {
        session.cover = value;
        redraw();
      },
    ),
    session.cover !== 0,
  );

  // Buckshot only. `spraysLead` would say yes to a Gatling as well, which cannot
  // be loaded with slugs — the same conflation of "rapid" with "spread" that
  // `straysAsFired` was written to undo.
  if (firesBuckshot(weapon)) {
    place(
      shotChoice(
        'Load',
        [
          {
            value: false,
            text: 'Shot',
            title: 'Buckshot: damage falls off with range, and strays on a 1 or a 2',
          },
          {
            value: true,
            text: 'Slugs',
            title:
              '2d10 at any range, may be fired at Extreme, and strays only on a 1 (p161)',
          },
        ],
        session.slugs,
        (value) => {
          session.slugs = value;
          redraw();
        },
      ),
      session.slugs,
    );
  }

  box.append(controls);

  // The hand dial, for every rule the app will never know. Deliberately outside
  // anything Aim can reach — see `shotTotal`.
  const dialRow = document.createElement('div');
  dialRow.className = 'shot-choice shot-dial';
  // The same track as the token's own dial, and deliberately the same classes:
  // it is the same control doing the same job, and two that looked different
  // would read as two different kinds of number.
  const track = document.createElement('div');
  track.className = 'pips mod-track';
  for (let n = -MANUAL_RANGE; n <= MANUAL_RANGE; n++) {
    const pip = document.createElement('button');
    pip.className = n === session.dial ? 'pip on situational' : 'pip';
    const ends = Math.abs(n) === 1 || Math.abs(n) === MANUAL_RANGE;
    pip.textContent = n === 0 ? '0' : ends ? formatMod(n) : String(Math.abs(n));
    pip.title = n === 0 ? 'No hand modifier' : `${formatMod(n)} by hand`;
    pip.addEventListener('click', () => {
      session.dial = session.dial === n ? 0 : n;
      redraw();
    });
    track.append(pip);
  }
  dialRow.append(track);
  box.append(dialRow);

  // Its own line, under the dial. Seventeen pips already fill a row edge to edge
  // — see `.mod-track`, which had to drop its own caption to fit — and the
  // expander is the control you go hunting for, so it is not the one to squeeze.
  const expand = document.createElement('div');
  expand.className = 'shot-expand';
  const more = document.createElement('button');
  more.className = showShotConditions ? 'toggle cond-toggle on' : 'toggle cond-toggle';
  more.textContent = showShotConditions ? 'Conditions \u25b4' : 'Conditions \u25be';
  more.title = 'Aim, called shot, load, and each target’s cover';
  more.addEventListener('click', () => {
    showShotConditions = !showShotConditions;
    render();
  });
  expand.append(more);
  box.append(expand);
  box.append(conditions);

  // --- who at --------------------------------------------------------------

  const list = document.createElement('div');
  list.className = 'shot-targets';
  list.textContent = 'measuring…';
  box.append(list);
  void fillShotTargets(list, sheet, weapon, sheetMods, session);

  return box;
}

/**
 * Who the shot could be aimed at, and — once it has been — what happened.
 *
 * Filled asynchronously because ranges come from OBR and arrive late. By the time
 * they do the sheet may have been rebuilt out from under this node, which is why
 * it checks it is still in the document rather than resuming blind. Same shape as
 * `fillTargets`, for the same reason.
 */
async function fillShotTargets(
  holder: HTMLElement,
  sheet: Sheet,
  weapon: Weapon,
  sheetMods: RollBreakdown,
  session: ShotSession,
): Promise<void> {
  const from = activeToken(sheet)?.token.id;
  const candidates = await candidateTargets(from);
  if (!holder.isConnected) return;

  // Everyone stays on the list, before the roll and after it. A turn is often two
  // shots, and closing the panel to fire again is clumsy — so the declaration
  // controls stay live and the next shot starts from the same place.
  //
  // What does *not* come back is the row of alternative outcomes this panel was
  // built to replace: an outcome is drawn only under a target the current shot
  // actually gave a die to.
  const shown = [...candidates].sort((a, b) => (a.cells ?? Infinity) - (b.cells ?? Infinity));

  if (!shown.length) {
    holder.textContent = 'Nothing bound and visible to aim at.';
    return;
  }

  const table = document.createElement('table');
  table.className = 'shot-table';

  // Gathered while the outcomes are drawn, for the bystander note below: the
  // rule fires on a **miss**, and a shot nobody has been given yet may still
  // become one.
  let missed = false;
  let pending = false;

  // who · state · Dist · wounds · this shot · roll. Counted here rather than
  // written as a literal under each outcome row, because the outcome spans the
  // whole width and a stale number there misaligns silently.
  const columns = 7;

  for (const { token, state, sheet: victim, cells } of shown) {
    const declared = (session.bullets.get(token.id) ?? 0) > 0;
    // Once the shot is taken the band is the one it was taken at, not the one the
    // target has since walked into. See `ShotSession.rolled.bands`.
    const band = session.rolled
      ? session.rolled.bands.get(token.id)
      : cells !== undefined && session.bands
        ? bandFor(cells, session.bands, { extreme: reachesExtreme(weapon, session.slugs) })
        : undefined;
    const shot = shotMods(session, band);
    const shotgun = shotgunMod(weapon, session.slugs);
    const mods = shotgun ? [...shot.mods, shotgun] : shot.mods;
    const total = shot.total + (shotgun?.value ?? 0);

    const tr = document.createElement('tr');
    if (band === 'over') tr.className = 'out-of-range';
    if (declared && !session.rolled) tr.classList.add('declared');

    const name = document.createElement('td');
    name.className = 'who';
    // Same rule as the targeting table: an NPC's real name is the Marshal's.
    name.textContent = localName(victim, mapName(token), isGM);
    tr.append(name);

    const pills = document.createElement('td');
    pills.className = 'state';
    for (const pill of targetPills(state)) {
      const chip = document.createElement('span');
      chip.className = pill.value ? 'pill applied' : 'pill';
      chip.textContent = pill.letter;
      chip.title = pill.value
        ? `${pill.label} (${formatMod(pill.value)} to the attacker) — ${pill.note}`
        : `${pill.label} — ${pill.note}. Not applied: judge it yourself.`;
      pills.append(chip);
    }

    tr.append(pills);

    const range = document.createElement('td');
    range.className = 'num';
    if (cells === undefined) {
      range.textContent = 'Dist —';
      range.title = from ? 'Not on this map' : 'No token on the map to shoot from';
    } else if (band === 'over') {
      range.textContent = `Dist ${formatCells(cells)} — over`;
      range.title = reachesExtreme(weapon, session.slugs)
        ? 'Past four times long range — the shot cannot be taken (p146)'
        : 'Past long range, and this weapon may not be fired at Extreme Range (p146, p161)';
    } else {
      const penalty = band ? BAND_PENALTY[band] : 0;
      range.textContent = penalty
        ? `Dist ${formatCells(cells)} (${penalty})`
        : `Dist ${formatCells(cells)}`;
      range.title =
        `${cells.toFixed(1)} cells — ${band ?? 'unbanded'} range` +
        (band === 'extreme'
          ? '. Extreme Range requires the shooter to have spent their last turn aiming (p146).'
          : '');
      if (band === 'extreme') range.classList.add('extreme');
    }
    tr.append(range);

    // The shooter's wounds and Fatigue, in the same red the sheet's own chip and
    // every die label use. It is the same number on every row — it is the
    // shooter's, not the target's — and it is here because this is where the
    // shot is being decided, six inches below the strip where nobody was
    // reading it.
    //
    // Drawn only when there is one, unlike the sheet's chip which shows +0.
    // A row that printed "+0" five times over would be five copies of nothing,
    // and the strip above is still saying it at zero.
    const hurt = document.createElement('td');
    hurt.className = 'num';
    if (sheetMods.status) {
      const red = document.createElement('span');
      red.className = 'mod-status';
      red.textContent = formatMod(sheetMods.status);
      red.title = describeMods(sheetMods.parts.filter((part) => part.kind === 'status'));
      hurt.append(red);
    }
    tr.append(hurt);

    // Everything this shot has going for it against *this* target: range, cover,
    // Aim, the called shot, the load, the dial, and the melee.
    //
    // Deliberately **not** the sheet's own green total. That one is on the strip
    // at the top, where it applies to every roll this character makes; adding it
    // here would print the dark twice and make the two greens on screen disagree.
    // Shown at zero, because "what is this shot at?" is the question the row
    // exists to answer and a blank is not an answer.
    const sum = document.createElement('td');
    sum.className = 'num';
    const green = document.createElement('span');
    green.className = total ? 'mod-situational' : 'mod-situational zero';
    green.textContent = formatMod(total) || '+0';
    green.title = mods.length
      ? mods.map((m) => `${m.label} ${formatMod(m.value)}`).join(', ')
      : 'Nothing for or against this shot';
    sum.append(green);
    tr.append(sum);

    // What this shot has to beat. Four, or the defender's Parry for a shot fired
    // into melee (p160) — assumed inside `PARRY_VISIBLE_CELLS` and a click to say
    // otherwise, which is the only thing `meleeCall` records.
    //
    // Frozen once the dice are down: the assumption is made from a live distance,
    // and a target who steps back afterwards must not quietly turn a hit into a
    // miss. Changing it then is a correction and says so in the log.
    const parry = victim.parry ?? DEFAULT_PARRY;
    const engaged = intoMelee(session, token.id, cells);
    const target = session.rolled?.targets.get(token.id) ?? targetNumber(parry, engaged);
    const tn = document.createElement('td');
    tn.className = 'num shot-tn';
    const close = showsParry(session.skill, cells) || engaged;
    // Read off `engaged`, never off the number it produced. A defender with
    // Parry 4 — which is Fighting d4, and most Extras in the bestiary — resolves
    // against 4 whether or not the shot is into melee, so a control that
    // inferred its own state from the TN would draw itself off, refuse to toggle
    // and publish nothing, all while the arithmetic quietly stayed correct.
    const label = engaged ? `vs ${target} (parry)` : 'vs 4';
    if (close) {
      const button = document.createElement('button');
      button.className = engaged ? 'shot-opt on' : 'shot-opt';
      button.textContent = label;
      button.title = engaged
        ? `Fired into melee, so the TN is Parry ${parry} rather than 4 (p160). ` +
          `Only a pistol or a power may be fired in melee — not a rifle — and shooting ` +
          `at anybody else while engaged makes the shooter Vulnerable. Click to take it back.`
        : `Not in melee: the usual TN of 4. Click if they are engaged — a shot into ` +
          `melee is resolved against Parry ${parry} instead (p160).`;
      button.addEventListener('click', () => {
        const next = !engaged;
        session.meleeCall.set(token.id, next);
        const rolled = session.rolled;
        if (rolled?.targets.has(token.id)) {
          // Its own amendment rather than one through `amendFromControls`: that
          // path compares modifier lists, and this is not a modifier. Published
          // by hand so a target number changed after the dice still leaves a
          // line in the log — silence here is the whole failure being avoided.
          const was = rolled.targets.get(token.id)!;
          const now = targetNumber(parry, next);
          rolled.targets.set(token.id, now);
          if (was !== now) {
            publish({
              ...named(sheet),
              label: next ? 'Fired into melee' : 'Not in melee after all',
              expression: rolled.expression,
              explained: `TN ${was} → **${now}**`,
              amends: rolled.entryId,
            });
          }
        }
        render();
      });
      tn.append(button);
    } else {
      tn.textContent = label;
      tn.title = 'The usual Target Number for a ranged attack';
    }
    tr.append(tn);

    const action = document.createElement('td');
    action.className = 'num';
    {
      const mine = session.bullets.get(token.id) ?? 0;
      const spare = bulletsLeft(session);
      const sum = sheetMods.total + total;
      const priced =
        `${session.skill}${sum ? ` ${formatMod(sum)}` : ''} at ${name.textContent}` +
        (mods.length
          ? ` — ${mods.map((m) => `${m.label} ${formatMod(m.value)}`).join(', ')}`
          : '');

      if (session.rof === 1) {
        // A revolver has nothing to count. One click names the target and fires,
        // which is what it did before any of this and what it should keep doing.
        const roll = document.createElement('button');
        roll.className = 'shot-roll';
        roll.textContent = 'Roll';
        roll.disabled = band === 'over';
        roll.title = band === 'over' ? 'Out of range' : `Roll ${priced}`;
        roll.addEventListener('click', () => {
          nextShot(session);
          session.bullets = new Map([[token.id, 1]]);
          takeTheShot(sheet, weapon, sheetMods, session, candidates);
        });
        action.append(roll);
      } else {
        // One cartridge per point of Rate of Fire, filled up to what this target
        // has been given. `"you might put 2 dice into one walkin' dead and a
        // third into another"` (p147) — so the rows share one magazine, and a
        // round already spent elsewhere is drawn spent here.
        const belt = document.createElement('div');
        belt.className = 'shot-belt';
        for (let n = 1; n <= session.rof; n++) {
          const round = document.createElement('button');
          const loaded = n <= mine;
          // Beyond this target's own rounds plus what is left in the magazine.
          const reachable = n <= mine + spare;
          round.className = loaded ? 'shot-round on' : 'shot-round';
          round.disabled = band === 'over' || !reachable;
          round.append(cartridge());
          round.title =
            band === 'over'
              ? 'Out of range'
              : !reachable
                ? `Only ${session.rof} shot${session.rof === 1 ? '' : 's'}, and the rest are spoken for`
                : loaded && n === mine
                  ? `${mine} into ${name.textContent}. Click to take this one back.`
                  : `Put ${n} shot${n === 1 ? '' : 's'} into ${name.textContent} — ${priced}`;
          round.addEventListener('click', () => {
            // Clicking the round you are already on steps back, so a count can be
            // wound down without hunting for a separate control — the same
            // grammar as the wound and fatigue pips.
            const next = mine === n ? n - 1 : n;
            if (session.rolled) nextShot(session);
            if (next <= 0) session.bullets.delete(token.id);
            else session.bullets.set(token.id, next);
            render();
          });
          belt.append(round);
        }
        action.append(belt);
      }
    }
    tr.append(action);
    table.append(tr);

    // --- what happened ----------------------------------------------------

    // Only a target this shot was actually declared against. The list shows
    // everyone so the next shot can be lined up without closing the panel — but
    // an outcome under a target nobody fired at is nonsense, and the dice picker
    // under one would let a result be given to somebody who was never declared.
    if (session.rolled && session.bullets.has(token.id)) {
      const outcome = document.createElement('tr');
      outcome.className = 'shot-outcome';
      const cell = document.createElement('td');
      cell.colSpan = columns;

      // Held while the dice are still in the air, exactly as the log line is.
      // The panel used to print "hit, 2 raises" the instant the button was
      // pressed, which told the player the answer while the tray was still
      // making a show of finding it — and made the log's own hold pointless,
      // since the result was already on screen six inches above it.
      if (held.has(session.rolled.entryId)) {
        const rolling = document.createElement('i');
        rolling.className = 'shot-rolling';
        rolling.textContent = 'rolling…';
        cell.append(rolling);
        outcome.append(cell);
        table.append(outcome);
        continue;
      }

      // Every shot given to this target. Usually one; two when the player put
      // two dice into the same walkin' dead, which the book allows outright and
      // which is two attacks rather than one bigger one.
      const mine = [...session.rolled.assigned.entries()]
        .filter(([, id]) => id === token.id)
        .map(([index]) => index)
        .sort((a, b) => a - b);

      // How many this target was declared to take. Slots still empty keep the
      // picker on screen: two bullets declared into one man means two results to
      // place, not one.
      const slots = session.bullets.get(token.id) ?? 1;
      const against = shotAgainst(session, weapon, token.id);

      for (const index of mine) {
        const raw = session.rolled.values[index] ?? 0;
        // Baked values already carry this target's range and cover; unbaked ones
        // do not, because one expression could not have carried everyone's. See
        // `rolled.baked`.
        const effective = raw + (session.rolled.baked ? 0 : against.total);
        // The band is deliberately *not* passed. Its penalty is already inside
        // the shot's modifiers and letting `resolveAimedAttack` apply it again
        // would subtract the range twice. Only the refusal is forwarded, for a
        // target that walked out of range after the shot was rolled.
        const resolved = resolveAimedAttack({
          total: effective,
          target,
          ...(against.band === 'over' ? { band: 'over' as const } : {}),
          targetBonus: targetTotal(state),
        });

        const line = document.createElement('div');
        line.className = 'shot-shot';

        if (session.rolled.values.length > 1) {
          const which = document.createElement('button');
          which.className = 'shot-die on';
          which.textContent = String(raw);
          which.title = 'The shot given to this target. Click to take it back.';
          which.addEventListener('click', () => {
            session.rolled?.assigned.delete(index);
            session.damageIds.delete(index);
            render();
          });
          line.append(which);
        }

        const verdict = document.createElement('b');
        verdict.className = resolved.hit ? 'hit' : 'miss';
        verdict.textContent = resolved.outOfRange
          ? 'out of range'
          : resolved.hit
            ? resolved.raises
              ? `hit, ${resolved.raises} raise${resolved.raises === 1 ? '' : 's'}`
              : 'hit'
            : 'miss';
        verdict.title = `${raw} … = ${resolved.effective} vs ${target}`;
        line.append(verdict);
        if (!resolved.hit) missed = true;

        // The sum on the line rather than only in a tooltip. Correcting a
        // modifier after the roll is the panel's whole trick, and "did that
        // actually change anything" should be answerable by looking rather than
        // by hovering — which is how it was reported.
        const working = document.createElement('span');
        working.className = 'shot-working';
        const parts = [
          String(raw),
          ...(session.rolled.baked
            ? []
            : against.mods.map((m) => `${formatMod(m.value)} ${m.label.toLowerCase()}`)),
          ...(targetTotal(state) ? [`${formatMod(targetTotal(state))} target`] : []),
        ];
        working.textContent = `${parts.join(' ')} = ${resolved.effective} vs ${target}`;
        line.append(working);

        if (resolved.hit) {
          line.append(
            damageButton(
              sheet,
              weapon,
              session,
              against.band,
              resolved.raises,
              index,
              name.textContent ?? '',
            ),
          );
          const applied = shotDamageRow(session, index, { token, state, sheet: victim });
          if (applied) line.append(applied);
        }
        cell.append(line);
      }

      if (mine.length < slots) {
        pending = true;
        // `"Then roll that number of Shooting dice and assign them in whatever
        // order you like to the targets you declared"` (p147). The counts were
        // fixed before the dice; which result fills each slot is the player's,
        // made knowing what the dice did — the honest version of the reveal that
        // started all this.
        cell.append(dicePicker(weapon, session, token.id, slots - mine.length));
      }

      outcome.append(cell);
      table.append(outcome);
    }
  }

  // The button that actually fires, for a weapon that can fire more than once.
  // The per-target control counts bullets and has no Roll state of its own —
  // with several targets the last click is not necessarily the one that should
  // fire, and a counter that sometimes rolled would be a counter you could not
  // click freely. It lives here rather than with the other controls because this
  // is where the measured candidates are, and `takeTheShot` needs them to freeze
  // each target's band.
  const rows: HTMLElement[] = [table];

  // The bystander reminder, which used to live under the log's targeting table
  // and went quiet when that table was replaced by this panel.
  //
  // Conditional on purpose, and not gated any harder than this. The book scopes
  // it to a miss — *"When an attacker misses a Shooting or Athletics (throwing)
  // roll"* (p158) — so a shot still to be placed counts, because it may yet be
  // one. What is deliberately *not* attempted is saying which shot strayed: the
  // raw dice cannot be recovered from `values` once modifiers are baked in, and
  // the rule treats each die as its own stray anyway. It ends *"only use this
  // rule when it's dramatically appropriate"*, which is the Marshal's, not ours.
  if (session.rolled && session.rolled.stray > 0 && (missed || pending)) {
    const bar = document.createElement('div');
    bar.className = 'shot-note';
    const note = document.createElement('span');
    note.className = 'pill stray';
    const count = session.rolled.stray;
    note.textContent =
      count === 1 ? 'Bystander?' : `Bystanders? \u00d7${count}`;
    // The pill is the reminder; the rule itself is a paragraph and belongs on
    // hover rather than across the panel.
    note.title = strayWarning(count, session.rolled.strayOn).replace(/\*\*(.+?)\*\*/g, '$1');
    bar.append(note);
    rows.push(bar);
  }

  // Once a round has been spoken for, and again after a shot has resolved — the
  // cartridges count and have no Roll state of their own, because with several
  // targets the last one clicked is not necessarily the one that should fire.
  if (session.rof > 1 && session.bullets.size >= 1) {
    const bar = document.createElement('div');
    bar.className = 'shot-rollnow';
    const go = document.createElement('button');
    go.className = 'shot-roll';
    const shots = shotsFired(session);
    go.textContent = `Roll ${shots}`;
    const spare = bulletsLeft(session);
    go.title =
      `Fire ${shots} shot${shots === 1 ? '' : 's'} at the ${session.bullets.size} ` +
      `target${session.bullets.size === 1 ? '' : 's'} named` +
      (spare > 0
        ? ` — ${spare} of the ${session.rof} this weapon allows left unspent, which "you can always roll less dice" permits (p147)`
        : '');
    go.addEventListener('click', () => takeTheShot(sheet, weapon, sheetMods, session, candidates));
    bar.append(go);
    rows.push(bar);
  }

  holder.replaceChildren(...rows);
}

/**
 * The shots nobody has been given yet, offered to one target.
 *
 * One button per unassigned result. Clicking gives that shot to this target,
 * which is the whole of the assignment step — no dragging, no selection held
 * between clicks, and no ordering imposed on which target is dealt with first.
 *
 * Two dice may end up on one target if the player wants: that is two attacks on
 * it, and the book allows it outright — *"you might put 2 dice into one walkin'
 * dead"*. Nothing here prevents it, and the second one gets its own damage roll.
 */
function dicePicker(
  weapon: Weapon,
  session: ShotSession,
  tokenId: string,
  /** How many of this target's declared bullets are still to be filled. */
  slots: number,
): HTMLElement {
  const rolled = session.rolled!;
  const wrap = document.createElement('span');
  wrap.className = 'shot-picker';

  const label = document.createElement('span');
  label.className = 'shot-picker-label';
  // Spelled as an instruction. This is the step that gates damage — no shot
  // assigned means no verdict and no damage button — and "Give it" read as a
  // caption rather than as the thing you have to do next.
  label.textContent = slots > 1 ? `Give this target ${slots} shots:` : 'Give this target a shot:';
  wrap.append(label);

  for (const [index, value] of rolled.values.entries()) {
    if (rolled.assigned.has(index)) continue;
    const die = document.createElement('button');
    die.className = 'shot-die';
    die.textContent = String(value);
    const against = shotAgainst(session, weapon, tokenId);
    const effective = value + (rolled.baked ? 0 : against.total);
    die.title =
      `Give this shot to the target` +
      (rolled.baked || !against.total
        ? ''
        : ` — ${value} ${formatMod(against.total)} = ${effective} here`);
    die.addEventListener('click', () => {
      rolled.assigned.set(index, tokenId);
      render();
    });
    wrap.append(die);
  }

  // Only reachable when a declared target has left the map since the roll: its
  // slots stop being drawn, so its results have nowhere left to go. Said plainly
  // rather than reassuringly — a shot is stranded, and the manual roller is the
  // way to finish it.
  if (wrap.childElementCount === 1) {
    label.textContent = 'no shot left to give — one was declared at a target that has gone';
    label.className = 'shot-rolling';
  }
  return wrap;
}

/**
 * Roll the attack. The one step in the sequence that cannot be taken back.
 *
 * Everything above stays live afterwards and appends corrections; this throws
 * dice, and dice are not re-thrown. See `lockedByTheRoll`.
 *
 * One die per declared target — *"Rate of Fire is how many Shooting dice you roll
 * when firing that weapon"* (p147), and declaring fewer targets than the weapon
 * allows is how you roll fewer, which the same paragraph permits outright.
 */
function takeTheShot(
  sheet: Sheet,
  weapon: Weapon,
  sheetMods: RollBreakdown,
  session: ShotSession,
  candidates: readonly { token: { id: string; name: string }; sheet: Sheet; cells?: number }[],
): void {
  const shots = shotsFired(session);
  const named = [...session.bullets.keys()];
  const single = shots === 1 ? named[0] : undefined;

  // The band each target was in at this moment, frozen for the rest of the shot.
  const bands = new Map<string, Band | undefined>();
  for (const id of named) {
    const found = candidates.find((c) => c.token.id === id);
    bands.set(
      id,
      found?.cells !== undefined && session.bands
        ? bandFor(found.cells, session.bands, { extreme: reachesExtreme(weapon, session.slugs) })
        : undefined,
    );
  }

  // What each declared target has to be beaten by, frozen alongside its band and
  // for the same reason — the melee call is made from a live distance, and a
  // target who steps back afterwards must not turn a hit into a miss in silence.
  const targets = new Map<string, number>();
  for (const id of named) {
    const found = candidates.find((c) => c.token.id === id);
    const engaged = intoMelee(session, id, found?.cells);
    // Written back as an explicit call, so it survives the target moving. The
    // TN below is frozen either way; this keeps the *control* frozen with it —
    // otherwise a target who steps back leaves the row showing a plain `vs 6`
    // the Marshal can no longer undo.
    session.meleeCall.set(id, engaged);
    targets.set(id, targetNumber(found?.sheet.parry, engaged));
  }

  // One target's modifiers can ride in the expression; several targets' cannot,
  // because one roll cannot carry two different range penalties. So a single
  // target keeps the log line reading `s8-2 … = 13`, and a shot at several rolls
  // bare and has each target's modifiers applied to its own assigned shot.
  const baked = bakesModifiers(session.rof, session.bullets);
  const stub: ShotSession = { ...session, rolled: { ...emptyRolled(), bands, baked } };
  const perTarget = baked && single ? shotAgainst(stub, weapon, single) : undefined;
  const level = shotLevel(session, weapon);
  const modsForLine = perTarget ?? level;
  const situational = sheetMods.total + (perTarget?.total ?? 0);

  const result = rollSkill(sheet, session.skill, situational, undefined, shots);
  const values = totalsOf(result.explained);
  if (values.length !== shots) {
    notify(`could not read ${shots === 1 ? 'that roll' : 'those rolls'}`);
    session.bullets = new Map();
    render();
    return;
  }

  // The stray window comes from the shot as fired rather than from the gun — a
  // Gatling firing once puts one bullet in the air.
  const strayOn = straysAsFired(weapon, shots, session.slugs) ? 2 : 1;
  const names = named
    .map((id, i) => {
      const found = candidates.find((c) => c.token.id === id);
      const who = found ? wireName(found.sheet, mapName(found.token)) : named[i]!;
      const count = session.bullets.get(id) ?? 1;
      return count > 1 ? `${who} ×${count}` : who;
    })
    .join(', ');

  const entryId = publishTrait(
    sheet,
    `${weapon.name} — ${session.skill}`,
    result,
    // The shot's own modifiers ride alongside the sheet's, so the log line shows
    // the range and the cover next to the wounds rather than as a bare number.
    {
      ...sheetMods,
      total: situational,
      parts: [...sheetMods.parts, ...asRollMods(modsForLine.mods)],
    },
    {
      skill: session.skill,
      ...(session.bands ? { bands: session.bands } : {}),
      strayOn,
      target: names,
    },
  );

  session.rolled = {
    entryId,
    expression: result.expression,
    values,
    // A single shot has nowhere else to go, so it is given out rather than asked
    // about. Several are the player's to place, which is the rule.
    assigned: shots === 1 && single ? new Map([[0, single]]) : new Map(),
    baked,
    bands,
    sheetTotal: sheetMods.total,
    current: modsForLine.mods,
    total: modsForLine.total,
    stray: strayShots(result.dice ?? [], strayOn),
    strayOn,
    targets,
  };
  render();
}

/** An empty `rolled`, for pricing a shot before there is one. */
function emptyRolled(): NonNullable<ShotSession['rolled']> {
  return {
    entryId: '',
    expression: '',
    values: [],
    assigned: new Map(),
    baked: false,
    bands: new Map(),
    sheetTotal: 0,
    current: [],
    total: 0,
    stray: 0,
    strayOn: STRAY_ON_MISS,
    targets: new Map(),
  };
}

/**
 * Roll this weapon's damage, with anything the attack earned already in it.
 *
 * A Called Shot to the head is −4 to hit **and +4 damage** (p154), so it has to
 * survive the roll and reach here — which is most of the reason the panel holds
 * its state across roll, damage and apply rather than publishing and forgetting.
 *
 * Per target rather than per shot: the book's own example rolls 2d6 against the
 * first devil bat and 3d6 against the second, which got the raise.
 */
function damageButton(
  sheet: Sheet,
  weapon: Weapon,
  session: ShotSession,
  band: Band | undefined,
  /** How well the attack landed. A raise is worth a die. */
  raises: number,
  /** Which shot this damage is for — two may have landed on the same target. */
  shot: number,
  /** The declared target, so the damage roll names it as the attack did. */
  targetName: string,
): HTMLElement {
  const bonus = calledShotDamage(session.vitals);
  // A scattergun's dice depend on the range, which the panel now knows — so it
  // picks rather than offering all three and hoping. Slugs are flat at any range.
  const options = weapon.damage ? damageDiceOptions(weapon.damage) : [];
  const base = session.slugs
    ? SLUG_DAMAGE
    : options.length
      ? shotgunDamage(options, band)
      : weapon.damage
        ? damageExpression(weapon.damage, sheet.attributes.strength?.die)
        : undefined;

  const button = document.createElement('button');
  button.className = 'shot-damage';
  if (!base) {
    button.textContent = 'no damage on this weapon';
    button.disabled = true;
    return button;
  }
  // `"If your hero gets a raise on their attack roll (regardless of how many
  // raises), they add +1d6 to the final total. Bonus dice can also Ace!"` — p148.
  // One die for a raise, not one per raise, and it goes in the expression rather
  // than behind a button on the log line: the panel worked the raises out, so the
  // player should not have to remember to claim what they have already earned.
  // Recomputed on every render, so correcting a modifier afterwards adds or drops
  // the die along with everything else that correction changes.
  const raiseDie = raises >= 1 ? `+${RAISE_DIE}` : '';
  const expression = `${base}${raiseDie}${bonus ? `+${bonus}` : ''}`;
  button.textContent = `Damage ${expression}`;
  button.title =
    `Roll ${expression}` +
    (raises ? ` — +${RAISE_DIE} for the raise, one die however many raises (p148)` : '') +
    (bonus
      ? ' — the +4 for a called shot to the head or vitals is already in it (p154)'
      : '') +
    (session.slugs ? ' — slugs do 2d10 at any range (p161)' : '') +
    (options.length && !session.slugs
      ? ` — buckshot at ${band ?? 'close'} range (p161)`
      : '');
  button.addEventListener('click', () => {
    const id = rollFreeform(
      expression,
      `${weapon.name} damage`,
      rollerName(sheet),
      weapon.ap,
      diceColourOf(sheet),
      activeToken(sheet)?.token.id,
      targetName,
    );
    // A second press supersedes the first: rolling damage again is redoing it,
    // not adding to it, and Apply must spend the roll on screen.
    if (id) session.damageIds.set(shot, id);
    render();
  });
  return button;
}

/**
 * What the damage came to, and the button that spends it.
 *
 * The last step of the sequence, and the reason the panel holds a target at all:
 * it declared who was being shot at, so it does not then ask the player to go and
 * select that token in OBR and find the roll again in the log.
 *
 * The Marshal's adjustment bar is the one from the targeting table — the same
 * halved-for-a-Construct decision, made in the same place, keyed on the same
 * entry — rather than a second copy that could drift from it.
 */
function shotDamageRow(
  session: ShotSession,
  /** Which shot's damage, since two may have landed on the same target. */
  shot: number,
  victim: { token: (typeof tokens)[number]; state: TokenState; sheet: Sheet },
): HTMLElement | undefined {
  const damageId = session.damageIds.get(shot);
  if (!damageId) return undefined;
  // The roll **as rolled**, deliberately not `latest`. The Marshal's adjustment is
  // logged as a correction to this entry, and `applyDamage` applies that same
  // adjustment itself — so reading the corrected total here would halve an
  // already-halved number. The entry is the dice; the adjustment is what they
  // count for; the two are combined in exactly one place.
  const entry = log.list().find((e) => e.id === damageId);
  if (!entry || entry.total === undefined) return undefined;

  const adjust = adjustments.get(entry.id);
  const row = document.createElement('div');
  row.className = 'shot-apply';

  const outcome = applyDamage(
    victim.sheet,
    victim.state,
    { damage: entry.total, ...(entry.ap ? { ap: entry.ap } : {}) },
    adjust,
  );
  // What it comes to gets its own line. It is a sentence, and the controls that
  // change it are a row of chips — side by side they wrapped into each other.
  const says = document.createElement('div');
  says.className = 'shot-outcome-text';
  // The engine's own wording, so the preview and the applied line cannot
  // disagree about what happened.
  says.textContent = outcome.description.replace(/\*\*/g, '');
  says.title = `vs Toughness ${effectiveToughness(victim.sheet, entry.ap ?? 0)}`;
  row.append(says);

  const controls = document.createElement('div');
  controls.className = 'shot-apply-controls';
  // Changing the Marshal's adjustment on a shot the panel rolled is a correction
  // like any other, so it appends to the log rather than silently changing what
  // Apply is about to spend. Halving a Construct's damage in the panel and
  // leaving the log saying the original number is the kind of quiet disagreement
  // the amendment mechanism exists to close.
  controls.append(
    adjustBar(entry, () => {
      amendDamage(entry);
      render();
    }),
  );

  const apply = document.createElement('button');
  apply.className = 'apply';
  // Just "Apply". The row it sits in is already headed by the target's name, and
  // spelling it out again ran the line off the end of the panel.
  apply.textContent = 'Apply';
  const to = localName(victim.sheet, mapName(victim.token), isGM);
  apply.title = `Apply ${describeAdjustment(entry.total, adjust) || entry.total} to ${to}`;
  apply.addEventListener('click', () => {
    void applyToTarget(entry, victim, adjustments.get(entry.id));
  });
  controls.append(apply);
  row.append(controls);
  return row;
}

/**
 * Log the Marshal's damage adjustment as a correction to the damage roll.
 *
 * The roll happened and everyone saw it; what changed is what it counts for. So
 * the amendment carries the adjusted number and says how it got there in the
 * engine's own words — "11 halved = 5" — which is the same string the applied
 * line will use.
 *
 * No-ops when the adjustment says nothing, so clicking a chip back off does not
 * publish "11 = 11".
 */
function amendDamage(entry: RollEntry): void {
  if (entry.total === undefined) return;
  const adjust = adjustments.get(entry.id);
  const what = describeAdjustment(entry.total, adjust);
  const now = adjustedDamage(entry.total, adjust);
  const last = log.latest(entry.id);
  if ((last?.total ?? entry.total) === now) return;
  publish({
    ...(entry.character ? { character: entry.character } : {}),
    label: what || 'adjustment cleared',
    expression: entry.expression,
    explained: `${entry.total} → **${now}**`,
    total: now,
    amends: entry.id,
  });
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
    for (const [label, numeric] of [
      ['', false],
      ['Roll', false],
      ['Range', true],
      ['Damage', true],
      ['RoF', true],
      ['AP', true],
    ] as [string, boolean][]) {
      const th = document.createElement('th');
      th.textContent = label;
      if (numeric) th.className = 'num';
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
      const bands = parseRangeBands(weapon.range);
      // The stray window is the gun's, not the roll's: a scattergun endangers
      // bystanders on a 1 *or* a 2, everything else only on a 1.
      const strayOn = strayThreshold(weapon);

      // A ranged attack opens the shot panel instead of rolling. "Shoot" rather
      // than "Shooting", because it is the start of the sequence and not a roll
      // yet — the roll happens further down, once there is a target to name.
      // Fighting still rolls straight off the button: a melee panel would need
      // Gang Up and Wild Attack, which is a different piece of work.
      const ranged = skill === 'Shooting';
      attack.textContent = ranged ? 'Shoot' : skill;
      attack.title = ranged
        ? `Line up a shot with the ${weapon.name} — pick the target, then roll`
        : `Roll ${skill}${mods.parts.length ? ` (${describeMods(mods.parts)})` : ''}`;
      if (ranged && openShot?.key === shotKey(sheet, weapon)) attack.classList.add('on');
      attack.addEventListener('click', () => {
        if (!ranged) {
          publishTrait(
            sheet,
            `${weapon.name} — ${skill}`,
            rollSkill(sheet, skill, penalty),
            mods,
            { skill, ...(bands ? { bands } : {}), strayOn },
          );
          return;
        }
        toggleShot(sheet, weapon, skill, bands);
      });
      attackCell.append(attack);
      row.append(attackCell);

      const rangeCell = document.createElement('td');
      rangeCell.className = 'num';
      rangeCell.textContent = weapon.range ?? '—';
      row.append(rangeCell);

      const damageCell = document.createElement('td');
      damageCell.className = 'num';
      const options = weapon.damage ? damageDiceOptions(weapon.damage) : [];
      if (weapon.damage && options.length) {
        // A shotgun's "1–3d6" depends on the range to the target, which the sheet
        // cannot know — so it offers all three rather than guessing which third
        // is right. Unlabelled by band on purpose: which count goes with which
        // range is a rule this build has not verified.
        const spread = document.createElement('div');
        spread.className = 'dmg-spread';
        for (const option of options) {
          const button = document.createElement('button');
          button.className = 'dmg';
          button.textContent = option;
          button.title = `Roll ${option} — dice depend on the range band (${weapon.damage})`;
          button.addEventListener('click', () =>
            rollFreeform(
              option,
              `${weapon.name} damage`,
              rollerName(sheet),
              weapon.ap,
              diceColourOf(sheet),
              activeToken(sheet)?.token.id,
            ),
          );
          spread.append(button);
        }
        damageCell.append(spread);
      } else if (weapon.damage && !isRollableDamage(weapon.damage)) {
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
          rollFreeform(
            expression,
            `${weapon.name} damage`,
            rollerName(sheet),
            weapon.ap,
            diceColourOf(sheet),
            activeToken(sheet)?.token.id,
          ),
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

      // The shot panel opens *here*, under the gun it belongs to, rather than in
      // a corner of the sheet. Half of what it is for is that the weapon and the
      // shot are one thing.
      if (openShot?.key === shotKey(sheet, weapon)) {
        const shotRow = document.createElement('tr');
        shotRow.className = 'shot-row';
        const td = document.createElement('td');
        td.colSpan = 6;
        td.append(shotPanel(sheet, weapon, mods));
        shotRow.append(td);
        table.append(shotRow);
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
  return isGM ? sheets : sheets.filter((sheet) => sheet.pc);
}

function maySee(sheet: Sheet | undefined): boolean {
  return sheet !== undefined && (isGM || sheet.pc);
}

/**
 * Whether this client may work a character's hand of Action Cards.
 *
 * `maySee` is not the test, which is what made the first version of this wrong in
 * both places it was used: for a player `maySee` is *any* PC, so one player could
 * re-choose another player's card — and it publishes a line to the table when
 * they do.
 *
 * The Marshal runs the villains and everyone else besides. A player gets their
 * own character, or — if they have not claimed one yet — any PC, because locking
 * somebody out of their own sheet before they have picked it is the worse
 * failure of the two. A screen rather than a lock either way: token metadata is
 * writable by every client whatever this returns, and what this stops is the
 * misclick, which is the failure that actually happens.
 */
function mayChooseFor(sheet: Sheet | undefined): boolean {
  if (sheet === undefined) return false;
  if (isGM) return true;
  return mineId === undefined ? sheet.pc : sheet.id === mineId;
}

/**
 * The Marshal's Benny stack in the tab strip.
 *
 * Reads the count out of the same `bennies` map every sheet does — `bank.all()`
 * returns every key under the prefix, and the Marshal's is just one more — so it
 * cannot drift from the store the way a separate cached number would.
 */
function renderMarshal(): void {
  const wrap = el('marshal');
  // A guard rail, not a permission, exactly like the Table tab: any client could
  // write this key. What it prevents is a player finding a counter that is not
  // theirs and moving it.
  wrap.hidden = !isGM;
  const count = bennies.get(MARSHAL_BENNIES) ?? 0;
  el('marshal-count').textContent = String(count);
  wrap.classList.toggle('empty', count === 0);
  el<HTMLButtonElement>('marshal-spend').disabled = count === 0;
}

/** Move the Marshal's stack by one, and keep the strip in step with the store. */
async function marshalBenny(delta: 1 | -1): Promise<void> {
  const count = bennies.get(MARSHAL_BENNIES) ?? 0;
  const next = Math.max(0, count + delta);
  if (next === count) return;
  try {
    await bank.set(MARSHAL_BENNIES, next);
    bennies.set(MARSHAL_BENNIES, next);
    renderMarshal();
    // Only the spend goes to the log. A Marshal topping their stack up is
    // bookkeeping and would be noise; a Marshal spending one is a thing that just
    // happened at the table, and every other Benny spend says so.
    if (delta === -1) {
      publish({
        label: 'the Marshal spends a Benny',
        expression: 'benny',
        explained: `**${next}** left`,
      });
    }
  } catch (error) {
    notify(describe(error));
  }
}

function renderRoster(): void {
  const shown = visibleSheets();
  bar.who.replaceChildren(
    ...shown.map((sheet) => {
      const option = document.createElement('option');
      option.value = sheet.id;
      option.textContent = sheet.pc ? sheet.name : `${sheet.name} (NPC)`;
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
  // One read of both documents for all three: the sheets, where each is kept, and
  // anything left in both by a half-done move. Asking separately meant a
  // `getMetadata` per character, because rendering is synchronous and `scopeOf`
  // is not.
  const snapshot = await roster.snapshotFull();
  sheets = snapshot.sheets;
  scopes = snapshot.scopes;
  const clashes = snapshot.duplicates;
  if (clashes.length) {
    // The residue of a move that wrote the copy and then failed to remove the
    // original. Harmless — the room copy is the one in play — but it is spending
    // scene bytes on a ghost, and nothing else would ever mention it.
    notify(
      `${clashes.length} character(s) are stored in both the room and the scene; ` +
        `the room copy is the one in use. Press Kept twice to clear the other.`,
    );
  }
  bennies = await bank.all();
  renderMarshal();
  mineId = await myCharacter();
  const mySheets = visibleSheets();
  if (!mySheets.some((s) => s.id === selectedId)) {
    const mine = mineId;
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
async function applyToTarget(
  entry: RollEntry,
  // Passed rather than read from the selection. The targeting table puts an
  // Apply on every row, and a function that resolved its own target from
  // whatever happened to be selected would quietly hit the wrong one.
  target: ReturnType<typeof damageTarget>,
  // What the Marshal said actually happened — halved for a Construct, doubled
  // for a Weakness. Absent for the ordinary case.
  adjust?: DamageAdjustment,
): Promise<void> {
  if (!target || entry.total === undefined) return;
  const outcome = applyDamage(
    target.sheet,
    target.state,
    {
      damage: entry.total,
      ...(entry.ap ? { ap: entry.ap } : {}),
    },
    adjust,
  );
  // `outcome.state` already carries `soakable`, so the offer travels with the
  // wound to every client rather than staying on this one.
  await updateTokenState(target.token.id, () => outcome.state);
  await refreshTokens();
  // No `total`: this line is the *outcome* of applying damage, and offering to
  // apply it again to whoever is selected next would only ever be a mistake.
  publish({
    // The token, not `named()`. Both screen an NPC the same way, but `named`
    // finds *a* token bound to the sheet — with five bandits sharing one, that
    // is as likely to be the wrong bandit as the right one, and this call has
    // the token that was actually hit in its hand.
    character: wireName(target.sheet, mapName(target.token)),
    label: 'takes damage',
    expression: `${entry.total}`,
    explained: outcome.description,
    // Local when the thing hit is hidden on the map. It cannot be shot at
    // through the target list — that already screens the eye — but the Marshal
    // can select one and apply by hand, and "Robed Figure takes damage" is the
    // ambush introducing itself.
    //
    // Kept here rather than deferred to `named`, for the same reason `character`
    // is: this call has the token that was *actually hit*, where `named` asks
    // `activeToken` and with five bandits on one sheet that is as likely to be a
    // different bandit. The rule is the same; the token it is asked about is not.
    ...(target.token.visible === false ? { secret: true } : {}),
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
  colour?: string,
  /** The rolling token, when there is one, so the damage table can show ranges. */
  from?: string,
  /** Who it was declared against — see `RollEntry.target`. */
  target?: string,
): string | undefined {
  const trimmed = expression.trim();
  if (!trimmed) return undefined;
  try {
    const dice: DieEvent[] = [];
    const explained = new RollInterpreter(
      new CommandContext(new JavaRandom(), (die) => dice.push(die)),
    )
      .run(parse([trimmed]))
      .trim();
    return publish(
      {
        expression: trimmed,
        explained,
        // The only things that may be applied as damage: a weapon's damage roll
        // and anything typed into the box.
        applicable: true,
        ...(label ? { label } : {}),
        ...(character ? { character } : {}),
        ...(ap ? { ap } : {}),
        ...(from ? { from } : {}),
        ...(target ? { target } : {}),
      },
      dice,
      colour,
    );
  } catch (error) {
    // A typo is not worth broadcasting; show it to whoever typed it.
    const failed: RollEntry = {
      id: newRollId(),
      at: Date.now(),
      by: me,
      expression: trimmed,
      explained: `${trimmed}: ${describe(error)}`,
      secret: true,
    };
    log.add(failed);
    // Collapses whatever was open, like any other new line. An error is never
    // expandable itself, so this only ever closes.
    focusLatest(failed);
    renderLog();
    return undefined;
  }
}

// ---------------------------------------------------------------- animated dice

/**
 * Open the overlay the dice are drawn on.
 *
 * A full-screen modal with no backdrop, no paper and — the part that makes it a
 * dice tray rather than a dialog — `disablePointerEvents`, so it draws over the map
 * without taking a single click away from it.
 *
 * Called before every throw rather than once at startup, because the tray tears
 * itself down when the table has been quiet for a while: reopening it is cheaper
 * than leaving a WebGL context and an animation loop running over the map all
 * session. Opening one that is already open is a no-op we do not need to detect.
 */
async function openTray(): Promise<void> {
  try {
    await OBR.modal.open({
      id: TRAY_MODAL_ID,
      // Same origin, and under whatever prefix this build was deployed to — the
      // `/<repo>/` problem the manifest has, answered by the bundler.
      url: `${window.location.origin}${import.meta.env.BASE_URL}dice.html`,
      fullScreen: true,
      hideBackdrop: true,
      hidePaper: true,
      disablePointerEvents: true,
    });
  } catch (error) {
    // Already open, or modals refused: either way the roll goes on and the line
    // appears on the fallback timer.
    console.warn('could not open the dice tray', error);
  }
}

/** My OBR party colour, borrowed to tint my dice so nobody has to read a name. */
let myColour: string | undefined;

/**
 * Work out everyone's place at the table and remember it.
 *
 * Run by the GM only. Places are shared state — two players cannot each decide
 * independently which chair is theirs — and a room with several players all writing
 * the same keys is how a place ends up flip-flopping between sessions. Players read
 * what the Marshal's client wrote.
 *
 * Nobody chooses a place, so there is no picker to keep in step; the only thing that
 * changes one is somebody joining a table where their old chair is taken.
 */
async function refreshPlaces(): Promise<void> {
  const others = await OBR.party.getPlayers();
  const current = storedPlaces(await store.readAll());

  // `getPlayers` is everyone *else*, so we are added by hand or the roller's own
  // place would be missing from the room the roller is in.
  party = [
    { id: OBR.player.id, name: me, gm: isGM },
    ...others.map((player) => ({
      id: player.id,
      name: player.name,
      gm: player.role === 'GM',
    })),
  ];
  places = assignPlaces(party, current);
  myPlace = places[OBR.player.id] ?? myPlace;

  if (!isGM) return;
  // Nothing cosmetic gets written into a room that is nearly full. The whole-document
  // limit is a band rather than a number and overflow is silent, so the cost of
  // guessing wrong is somebody's roster — and a chair that is handed out again next
  // session is not worth going anywhere near that.
  //
  // Nothing this session breaks: every client works its own place out from the party
  // list and whatever *is* stored, so an unwritten place is the same on every screen.
  // What is lost is only the memory of it — next week the chairs may be dealt out in a
  // different order, and dice come in from somewhere new.
  const { fraction } = await store.usage();
  if (fraction > 0.85) {
    console.warn('room storage %d%% full — not saving table places', Math.round(fraction * 100));
    return;
  }
  for (const [id, place] of Object.entries(places)) {
    if (current[id] === place) continue;
    await savePlace(id, place);
  }
}

async function savePlace(id: string, place: number): Promise<void> {
  try {
    await store.write(`${PLACE_PREFIX}${id}`, place);
  } catch (error) {
    // A place is a nicety; the room budget and the roster come first.
    console.warn('could not save a table place', error);
  }
}

/**
 * Read my own animation preference back out of the room.
 *
 * It does **not** read my place. It used to read my seat, back when the Marshal picked
 * seats and the stored value was the decision; a place is derived now, so reading the
 * raw number here would overwrite the resolved one `refreshPlaces` just computed —
 * reinstating, for a player who arrives before the Marshal's client has written
 * anything, exactly the double booking that assignment had broken.
 */
async function readMyDiceSettings(): Promise<void> {
  // Absent means off. Animation is opt-in: it is the setting most likely to be
  // wrong for somebody's laptop, and an unasked-for physics simulation over the map
  // is a worse first impression than a plain log.
  animate = (await store.read<boolean>(`${DICE_PREFIX}${OBR.player.id}`)) === true;
}

async function toggleDice(): Promise<void> {
  animate = !animate;
  if (!animate) {
    // Reveal everything being held, or a line rolled a moment ago would be
    // stranded by the switch that was meant to make things faster.
    for (const id of [...held.keys()]) reveal(id);
    await OBR.modal.close(TRAY_MODAL_ID).catch(() => {
      // Nothing open, which is the state we wanted.
    });
  } else {
    await openTray();
  }
  try {
    await store.write(`${DICE_PREFIX}${OBR.player.id}`, animate);
  } catch (error) {
    // Not worth interrupting anyone over; it is a preference.
    console.warn('could not save the dice preference', error);
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

/**
 * Run one startup step, and do not let it take the panel with it.
 *
 * `onReady` is a long sequence of awaits, and it used to be one failure long: a
 * throw anywhere in it meant everything after it never ran. That is how a stale
 * listener for a deleted button — `el('anim')`, one line — produced a panel with no
 * characters in it and the appearance of a wiped roster.
 *
 * So each step that is not load-bearing for the roster is wrapped. The failure of any
 * one of them costs exactly itself: no seats, or no auto-binding, or no initiative
 * state, with a named warning in the console. The roster is loaded *first*, because it
 * is the one thing here that is irreplaceable.
 */
async function step(what: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.warn(`${what} failed at startup; the rest of the panel is fine`, error);
  }
}

OBR.onReady(async () => {
  // No notice-bar sink for the store's capacity warning: the footer already shows
  // the percentage the moment it passes 80%, and `reload` refreshes it after every
  // write. The same fact in two places meant the top of the panel was permanently
  // occupied by something the bottom said better, and a notice you cannot dismiss
  // is a notice you learn to read past. It still goes to the console.
  store = roomStore();
  // The roster's own warnings do keep the notice bar — "saved without their
  // descriptions" is a thing that happened to a character, not a running total.
  // The book is passed in so an edge the catalogue knows is stored as a name and
  // its text comes out of the bundle — see `roster.ts`. Keeps `roster.ts` free of
  // the catalogue, the same way `rebuildRulesText` takes its lookup.
  roster = await characterRoster(notify);
  bank = new BennyBank(store);

  // Who I am, which the roster needs: a player sees their own sheets, the Marshal
  // sees all of them. Defaults stand if this fails, and a wrong default here shows
  // the wrong sheets rather than none.
  await step('reading your name and role', async () => {
    me = await OBR.player.getName();
    isGM = (await OBR.player.getRole()) === 'GM';
  });
  // A guard rail, not a permission: any client could still write these keys.
  // What it prevents is a player hitting "New session" by accident and wiping
  // the party's Bennies, which has no undo.
  el('tab-table').hidden = !isGM;

  // The characters, before anything else and before any listener is attached. Nothing
  // below this line can stop them appearing.
  await step('loading the roster', () => reload());


  OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
    if (!isRollEntry(event.data)) return;
    // `secret` is meaningless on the wire; never honour a claim of it.
    const { secret, ...entry } = event.data;
    void secret;
    if (log.add(entry)) show(entry);
  });

  // The dice for a roll, on their own channel — see `sendDice`. This panel listens
  // as well as its tray, because knowing how many waves are coming is what turns
  // the fallback reveal from a flat six seconds into roughly how long the throw
  // will actually take.
  OBR.broadcast.onMessage(DICE_CHANNEL, (event) => {
    if (!isDiceThrow(event.data)) return;
    const thrown = event.data;
    if (!held.has(thrown.id)) return;
    clearTimeout(held.get(thrown.id));
    held.set(
      thrown.id,
      setTimeout(() => reveal(thrown.id), revealDelay(thrown.dice)),
    );
  });

  // My own tray, telling me its dice have stopped. The line it has been holding
  // goes up now rather than on the fallback timer.
  OBR.broadcast.onMessage(DICE_SETTLED_CHANNEL, (event) => {
    const data = event.data as { id?: unknown };
    if (data && typeof data.id === 'string') reveal(data.id);
  });

  OBR.player.onChange((player) => {
    me = player.name;
    myColour = player.color;
    void onSelectionChange();
  });

  // Somebody joining changes the shape of the table. The Marshal's client is the one
  // that writes the places, but everybody re-reads: a player who arrives second still
  // has to learn where they are sitting.
  OBR.party.onChange(() => {
    void refreshPlaces().then(() => {
      if (tab === 'table') renderSheetArea();
    });
  });

  // Bindings live in item metadata, which is per-scene — so every new map starts
  // unbound, and the party would have to be re-bound by hand without this.
  OBR.scene.onReadyChange((ready) => {
    void (async () => {
      // The roster is rebuilt first and on *both* edges, because half of it lives
      // in the scene that just arrived or left. Opening a board brings its
      // villains with it; closing one takes them away, and a stale Roster would
      // go on listing characters whose store is gone and fail every save to them.
      roster = await characterRoster(notify);
      await reload();
      if (!ready) return;
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
    rollFreeform(expr.value, undefined, typedRollName());
    secretRolls = false;
    expr.select();
  };
  el<HTMLFormElement>('freeform').addEventListener('submit', (event) => {
    event.preventDefault();
    rollTyped(false);
  });
  el('roll-secret').addEventListener('click', () => rollTyped(true));

  el('marshal-spend').addEventListener('click', () => void marshalBenny(-1));
  el('marshal-award').addEventListener('click', () => void marshalBenny(1));
  // The animated-dice switch is in the character editor now, wired through
  // `renderEditor`'s hooks. There is deliberately no footer button to bind here.

  // Another player editing their own sheet must show up here without a reload.
  // Our own writes are skipped: re-rendering mid-edit would blow away focus.
  OBR.room.onMetadataChange(() => {
    if (!saving) void reload();
  });

  // Everything from here is a nicety, in rough order of how much it is missed.
  await step('reading the round', async () => {
    initiative = await readInitiative();
    renderSheetArea();
  });
  await step('binding tokens by name', async () => {
    if (!(await OBR.scene.isReady())) return;
    const count = await autoBind(sheets);
    if (count) notify(`Bound ${count} token(s) to characters by name`);
  });
  await step('reading the selection', () => onSelectionChange());
  await step('setting the panel height', () =>
    // Set at runtime as well as in the manifest: OBR caches the manifest, so a
    // height change there alone would not reach an already-installed extension.
    OBR.action.setHeight(900),
  );
  await step('setting up dice', async () => {
    myColour = await OBR.player.getColor();
    // Places before settings: the GM's client is what writes them, and my own place
    // is read back out of what it wrote.
    await refreshPlaces();
    await readMyDiceSettings();
    if (animate) await openTray();
  });
});
