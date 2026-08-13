/**
 * Bennies.
 *
 * **This replaces an earlier `chips.ts` that was wrong.** I built a Fate Chip
 * pot from memory — a finite bag of coloured chips drawn without replacement —
 * and wrote that its structure was "not in doubt". The rulebook says otherwise:
 * Deadlands: The Weird West uses plain SWADE **Bennies**, and the only mention
 * of chips in the whole book is a suggestion that poker chips make thematic
 * tokens. There is no pot, no colours, and nothing is drawn.
 *
 * That also dissolves the strongest argument for leader election, which was the
 * shared pot. Election stays — it is still right for anything one client must do
 * on behalf of the table — but bennies do not need it: every count is per-owner.
 *
 * Rules below are from DLWW_Core_player_extract.pdf p141–142, not memory.
 */

/** Every Wild Card starts a session with three. */
export const STARTING_BENNIES = 3;
/** A GM Wild Card comes with two, on top of the Marshal's session pool. */
export const GM_WILD_CARD_BENNIES = 2;

/**
 * What a Benny buys. The Marshal may allow others — "Influence the Story" is
 * explicitly open-ended — so this is a list for the UI, not a restriction.
 */
export const BENNY_USES = [
  'Reroll a Trait',
  'Soak Rolls',
  'Remove Shaken',
  'Draw a new Action Card',
  'Reroll damage',
  'Regain 5 Power Points',
  'Influence the story',
] as const;

export type BennyUse = (typeof BENNY_USES)[number];

/**
 * The Marshal's session pool: one Benny per player character at the table.
 */
export function marshalPool(playerCharacters: number): number {
  return Math.max(0, Math.trunc(playerCharacters));
}

/**
 * Bennies at the start of a session.
 *
 * Unused ones do not carry over — "use 'em or lose 'em" — so this replaces the
 * previous count rather than adding to it. An Edge such as Luck grants extras,
 * which the caller adds.
 */
export function startOfSession(bonus = 0): number {
  return Math.max(0, STARTING_BENNIES + Math.trunc(bonus));
}

export function spend(current: number, count = 1): number {
  if (current < count) throw new NoBenniesError();
  return current - count;
}

export function award(current: number, count = 1): number {
  return Math.max(0, current + Math.trunc(count));
}

export class NoBenniesError extends Error {
  constructor() {
    super('no Bennies left to spend');
    this.name = 'NoBenniesError';
  }
}

/**
 * Joker's Wild: when a player draws a Joker from the action deck, **every**
 * player character gets a Benny — and only one, even if two Jokers come up.
 *
 * The villains' side works the same way in reverse: a Joker for their pool and
 * one for each enemy Wild Card.
 *
 * This is why it lives next to initiative rather than in a benny screen: the
 * award is a consequence of the deal, and the extension already knows when a
 * Joker was dealt.
 */
export function jokersWild(
  counts: ReadonlyMap<string, number>,
  jokerDealt: boolean,
): Map<string, number> {
  const next = new Map(counts);
  if (!jokerDealt) return next;
  for (const [id, count] of next) next.set(id, award(count));
  return next;
}
