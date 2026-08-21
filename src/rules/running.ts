/**
 * The Running die — how much further than Pace a character gets this turn.
 *
 * `"A hero can choose to 'run,' increasing their Pace for the round by their
 * Running die (a d6 by default) at the cost of a −2 penalty to all actions that
 * turn. Running dice never Ace."` — p151.
 *
 * Three things in that decide this module:
 *
 * 1. **d6 by default**, stepped by Edges, Hindrances and creature abilities.
 * 2. **Never Aces.** So it is rolled as a plain `d6`, not as the `s`/`e` savage
 *    expression every other trait on the sheet uses. Getting this wrong would
 *    hand out the occasional 11" sprint and look like good luck.
 * 3. **The −2 is on the character, not on the die.** It is a situational
 *    modifier that lasts the turn, so it belongs on the modifier track where it
 *    can be cleared — the `running` entry in `modifiers.ts` — and not here.
 */
import type { NamedEntry, Sheet } from './sheet.js';

/** The die a character runs with, absent anything that changes it. */
export const DEFAULT_RUNNING_DIE = 6;

/**
 * The steps a running die moves along.
 *
 * `"if already d4, reduce to d4−1"` — the Slow Hindrance, p26, which is why the
 * bottom of this ladder is a modifier rather than a smaller die. There is nothing
 * below d4 in Savage Worlds.
 */
const LADDER = [4, 6, 8, 10, 12] as const;

export interface RunningDie {
  die: number;
  /** `−1` for a character stepped below d4. Zero otherwise. */
  mod: number;
  /** What moved it, in the order it was applied. Empty for a plain d6. */
  why: string[];
}

/**
 * A creature whose stat block states its running die outright.
 *
 * The bestiary is full of them — *"Fleet Footed: Antelopes have a Pace 10 and
 * roll a d10 for running"* — and the number is written in prose because that is
 * how the book prints a special ability. It **wins over the Edge**: the block has
 * already done the arithmetic, and stepping the stated d10 up again because the
 * ability happens to be called Fleet Footed would double it.
 */
const STATED = /\broll(?:s)?\s+(?:a\s+)?d(4|6|8|10|12)\b[^.]*\bfor\s+running\b|\brunning\s+die\s+is\s+(?:a\s+)?d(4|6|8|10|12)\b/i;

/** Fleet-Footed and the Harrowed's Supernatural Speed: one step up, and they stack. */
const FASTER = /\bfleet[\s-]?footed\b|\bsupernatural\s+speed\b/i;

/** Slow and Obese: one step down each. Both say so in as many words. */
const SLOWER = /\bslow\b|\bobese\b/i;

/**
 * A flat penalty to the *roll*, which is a different thing from a smaller die.
 *
 * Elderly is the one in play — Sir Ed has it: `"Their Pace is reduced by 1 and
 * they subtract 1 from running rolls (minimum 1)"`. The die stays a d6 and the
 * total comes down by one, so this cannot be modelled as a step; a d4 is not a
 * d6−1. Matched on the text rather than the name because the name says nothing
 * about running.
 *
 * The `(minimum 1)` is the book's, and is not enforced: it is one point on a
 * movement roll, and clamping it would need the roll rather than the request.
 */
const PENALISED = /\bsubtracts?\s+(\d+)\s+from[^.]*\brunning\b/i;

/** An entry's name and its rules text together, since either can carry the answer. */
function prose(entries: readonly NamedEntry[]): { name: string; text: string }[] {
  return entries.map((entry) => ({
    name: entry.name,
    text: `${entry.name} ${entry.text ?? ''}`,
  }));
}

function step(die: number, by: number): number {
  const at = LADDER.indexOf(die as (typeof LADDER)[number]);
  const next = Math.min(LADDER.length - 1, Math.max(0, (at === -1 ? 1 : at) + by));
  return LADDER[next]!;
}

/**
 * What this character rolls when they run.
 *
 * Read from the sheet's own prose rather than from a field, because that is where
 * the answer is: a bestiary block states its die in a special ability and a PC's
 * comes from an Edge. Nothing on `Sheet` records it, and adding a field would
 * mean every imported sheet carrying a default that silently disagreed with the
 * text printed two inches below it.
 *
 * Deliberately generous about what it matches and deliberately unenforcing about
 * the result: a wrong step here costs a couple of inches of movement and is
 * visible in the tooltip, which is the cheapest kind of wrong this app has.
 */
export function runningDie(sheet: Pick<Sheet, 'edges' | 'hindrances' | 'powers'>): RunningDie {
  // Edges and Hindrances are the things a *character* has. `powers` is read too,
  // but only for the stated-die match below: it holds a creature's special
  // abilities on an imported stat block — and, on a Huckster or a Blessed, their
  // arcane powers. One of those is called **slow**, and matching Hindrance names
  // across it would step every spellcaster in the party down to a d4.
  const own = prose([...sheet.edges, ...sheet.hindrances]);
  const entries = [...own, ...prose(sheet.powers ?? [])];

  for (const entry of entries) {
    const stated = STATED.exec(entry.text);
    if (stated) {
      return { die: Number(stated[1] ?? stated[2]), mod: 0, why: [entry.name] };
    }
  }

  let die: number = DEFAULT_RUNNING_DIE;
  let mod = 0;
  const why: string[] = [];
  for (const entry of own) {
    // Matched on the *name* for these, not the whole text. "Slow" turns up in the
    // prose of half the Hindrances in the book — the one that steps the die is
    // the one called it.
    if (FASTER.test(entry.name)) {
      die = step(die, 1);
      why.push(entry.name);
    } else if (SLOWER.test(entry.name)) {
      if (die === LADDER[0]) mod -= 1;
      else die = step(die, -1);
      why.push(entry.name);
    }
    // Not an `else`: a character could in principle have both, and they are
    // different kinds of thing — one changes the die, the other the total.
    const penalty = PENALISED.exec(entry.text);
    if (penalty) {
      mod -= Number(penalty[1]);
      why.push(entry.name);
    }
  }
  return { die, mod, why };
}

/** `d6`, or `d4−1` for a character stepped off the bottom of the ladder. */
export function runningExpression({ die, mod }: RunningDie): string {
  return `d${die}${mod === 0 ? '' : mod > 0 ? `+${mod}` : `${mod}`}`;
}
