/**
 * Fighting from horseback.
 *
 * > *"**Horsemanship:** Characters who wish to fight from horseback must use the
 * > lowest of their Fighting or Riding skills… Athletics (throwing) and Shooting
 * > rolls are made at −2 unless the rider has the Steady Hands Edge (page 47)."*
 * > — p165
 *
 * Damian asked for a toggle on 2026-10-09 (*"automatically picks the minimum out
 * of Fighting and Riding"*), and Paul made it a **condition on the token** and
 * asked for the ranged −2 to apply automatically too. So `mounted` sits in
 * `SITUATIONS` beside Unstable Platform, in the same group — a horse *is* an
 * unstable platform, and holding both would charge the −2 twice — and this module
 * is what it does, because neither half is a flat number on every roll.
 *
 * ## Two different kinds of effect
 *
 * The ranged half is an ordinary penalty, charged where a shot or a throw is
 * known to be one. The Fighting half is not a modifier at all: it changes **which
 * die is rolled**. That makes it the first thing in the app to do so, and it has
 * to reach every place a Fighting die is shown as well as every place one is
 * rolled — Paul's rule is that a button says what it will roll (§25.5), and a
 * button reading `d8` that rolls a `d4` is precisely what that rule forbids.
 *
 * The skill keeps its name. Routing it as "Riding" would lose the targeting table
 * (`isTargeted` keys on Fighting) and log the wrong thing; it is a Fighting
 * attack, made with whichever die is worse.
 */
import { traitDie, type DieSides, type NamedEntry, type Sheet } from './sheet.js';
import { hasCondition, type ModifierState } from './modifiers.js';

export const MOUNTED = 'mounted';

/** `"Athletics (throwing) and Shooting rolls are made at −2"` — p165. */
export const MOUNTED_RANGED = -2;

export function isMounted(state: ModifierState | undefined): boolean {
  return hasCondition(state, MOUNTED);
}

/**
 * Steady Hands: *"They ignore the Unstable Platform penalty (page 165)."*
 *
 * Matched on the name, as `negatesRecoil` matches Rock and Roll!: the edge list
 * is what was imported off a card, and the card writes the name.
 */
export function hasSteadyHands(edges: readonly Pick<NamedEntry, 'name'>[]): boolean {
  return edges.some((edge) => /^\s*steady\s+hands\b/i.test(edge.name));
}

/**
 * The die a Fighting roll uses on horseback: the lower of Fighting and Riding.
 *
 * "Lower" compares the whole trait, die **and** modifier. An untrained Riding is
 * `d4−2`, which is lower than a `d4` Fighting although the dice match, and a
 * comparison on die size alone would have let an unskilled rider swing at full
 * Fighting. The measure is the mean of the die plus its modifier, which orders
 * every case a card produces the same way a person would.
 *
 * Returns the Fighting die unchanged, with `from: 'Fighting'`, whenever the rule
 * does not bite — not mounted, a skill other than Fighting, or a rider whose
 * Riding is at least as good.
 */
export function horsemanship(
  sheet: Sheet,
  skill: string,
  state: ModifierState | undefined,
): { die: DieSides; mod: number; from: 'Fighting' | 'Riding' | undefined } {
  const own = traitDie(sheet, skill);
  if (skill !== 'Fighting' || !isMounted(state)) return { ...own, from: undefined };
  const riding = traitDie(sheet, 'Riding');
  return worth(riding) < worth(own) ? { ...riding, from: 'Riding' } : { ...own, from: 'Fighting' };
}

function worth(trait: { die: number; mod: number }): number {
  return (trait.die + 1) / 2 + trait.mod;
}

/**
 * The sheet a roll should be made from: the same sheet, with Fighting swapped
 * for Riding when the rider's Riding is the worse of the two.
 *
 * **For rolling and for button faces only.** It is a sheet that does not exist —
 * one whose Fighting is somebody's Riding — and anything that saves, edits or
 * exports it would write that into the character permanently. The original is
 * returned untouched (same object) whenever nothing changes, which is nearly
 * always, so the common case cannot leak at all.
 */
export function rollingSheet(sheet: Sheet, state: ModifierState | undefined): Sheet {
  const swing = horsemanship(sheet, 'Fighting', state);
  if (swing.from !== 'Riding') return sheet;
  return {
    ...sheet,
    skills: { ...sheet.skills, Fighting: { die: swing.die, ...(swing.mod ? { mod: swing.mod } : {}) } },
  };
}

/** Why the Fighting face shows the die it does, for a tooltip and the log. */
export function horsemanshipNote(sheet: Sheet, state: ModifierState | undefined): string | undefined {
  const swing = horsemanship(sheet, 'Fighting', state);
  if (swing.from === undefined) return undefined;
  const show = (t: { die: number; mod: number }): string =>
    `d${t.die}${t.mod ? (t.mod > 0 ? `+${t.mod}` : `${t.mod}`) : ''}`;
  const fighting = traitDie(sheet, 'Fighting');
  const riding = traitDie(sheet, 'Riding');
  return (
    `Mounted: the lower of Fighting ${show(fighting)} and Riding ${show(riding)} ` +
    `— rolling ${swing.from} (p165)`
  );
}

/**
 * The −2 for shooting or throwing from the saddle, or nothing.
 *
 * `ranged` is the caller's to say, because the skill name cannot: Athletics is a
 * throw from the weapons table and a climb from the skills list, and only the
 * throw is penalised — the same split `attackCanStray` makes.
 */
export function mountedRangedPenalty(
  state: ModifierState | undefined,
  ranged: boolean,
  edges: readonly Pick<NamedEntry, 'name'>[],
): number {
  if (!ranged || !isMounted(state) || hasSteadyHands(edges)) return 0;
  return MOUNTED_RANGED;
}
