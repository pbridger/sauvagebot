/**
 * Situational modifiers — the green half of the number on every trait roll.
 *
 * Wounds and Fatigue (the red half, in `status.ts`) are a property of the
 * character. This is everything else the Marshal calls: it's dark, you're on a
 * horse, you're Distracted.
 *
 * ## What belongs here, and what deliberately does not
 *
 * The test is **persistence**, not sign. A modifier belongs in this track if it
 * stays true across more than one roll by this character:
 *
 *   - Illumination, Running, Distracted, off-hand, improvised weapon — all true
 *     of the *roller* until something changes. They apply to every trait roll,
 *     which is exactly what this track does.
 *   - Unstable Platform and Mounted — just as persistent, but the book scopes
 *     their −2 to shots and throws. They are marked `rolls: 'ranged'`, kept off
 *     the every-roll track, and charged by `platform.ts` where the roll is known
 *     to be one.
 *
 * Cover (−2/−4/−6/−8), a prone target (which the book scores *as* Medium Cover),
 * The Drop (+4), Gang Up, Range and Called Shots are all **excluded**, and that
 * is not an oversight. They depend on the target of one particular attack, so a
 * persistent track holding them would still be subtracting 4 next round when the
 * same character shoots someone standing in the open — and would be subtracting
 * it from their Notice roll and their Soak as well. Those want a modifier box
 * next to the attack, which is a different feature.
 *
 * Values are from the Weird West core rules: Illumination p157, Unstable
 * Platform p165, Distracted p154, Running p151. Multi-Action is the one figure
 * taken from SWADE rather than the player extract, whose p159 was trimmed.
 */

export type ModifierKind = 'status' | 'situational';

/** One named contribution to a roll, for showing the breakdown. */
export interface RollMod {
  label: string;
  value: number;
  kind: ModifierKind;
  /**
   * Two or three characters for the log, where a line is read at a glance and a
   * row of full labels would push the result off the end: `2W`, `1F`, `-4`.
   * The full label stays in the tooltip.
   */
  short?: string;
}

export interface Situation {
  key: string;
  label: string;
  value: number;
  /**
   * Mutually exclusive set. You cannot be in Dim and Pitch Darkness at once, so
   * picking one clears the other rather than quietly summing to −8.
   */
  group?: string;
  /**
   * Whose rolls this changes.
   *
   * `'self'` is the ordinary case and the only one that reaches a roll today.
   * `'others'` marks a condition whose effect lands on whoever is rolling
   * *against* this character — Vulnerable gives the attacker +2, not the victim.
   * There is no target in the roll path, so those contribute nothing to this
   * character's own total and `situationalMods` filters them out. Recording the
   * real number anyway means a later target-aware feature has it to hand.
   */
  affects: 'self' | 'others';
  /**
   * Which of this character's own rolls it reaches. Absent means every trait
   * roll, which is the ordinary case.
   *
   * `'ranged'` is for the platform conditions: *"A character attempting to fire
   * or throw a ranged weapon from the back of a horse or other mount, a moving
   * vehicle, or other 'unstable platform' subtracts 2"* (p165). Until 2026-10-09
   * Unstable Platform sat on the every-roll track and charged its −2 to Notice,
   * Fighting and Soak as well, and ignored Steady Hands. `situationalMods` leaves
   * these out; `platformPenalty` puts them back on shots and throws.
   *
   * `'attack'` and `'sight'` are the same correction for three more, 2026-10-09
   * (§27 (fff)) — each reaches the rolls in `REACHES` and no others:
   *
   *   - `'attack'` — Off-hand: *"actions that require precise eye-hand
   *     coordination, such as Fighting or Shooting"* (p158). Improvised weapon:
   *     *"count as armed but subtract 2 from attack rolls"* (p158).
   *   - `'sight'` — Illumination: *"Subtract the following penalties from rolls
   *     affected by Illumination, such as attacks, Notice rolls, the use of
   *     powers, etc."* (p157). Read as its examples and no further: a climb, a
   *     Persuasion or a Spirit roll against Fear in the dark is not penalised. The
   *     "etc." is the Marshal's, through the hand dial.
   */
  rolls?: 'ranged' | 'attack' | 'sight';
  /**
   * Short text for the token badge, when this is worth drawing on the map.
   *
   * Absent for the environmental ones: a row of DARK markers over six tokens
   * says nothing a Marshal who set the light level does not already know. Kept
   * to five characters, because the badge is placed without knowing its width.
   */
  badge?: string;
  note: string;
}

export const SITUATIONS: readonly Situation[] = [
  { key: 'dim', label: 'Dim', value: -2, group: 'light', affects: 'self', rolls: 'sight', note: 'Twilight, light fog, night with a full moon. Attacks, Notice and powers only (p157)' },
  { key: 'dark', label: 'Dark', value: -4, group: 'light', affects: 'self', rolls: 'sight', note: 'Typical night with some ambient light; targets invisible beyond 10″. Attacks, Notice and powers only (p157)' },
  { key: 'pitch', label: 'Pitch Dark', value: -6, group: 'light', affects: 'self', rolls: 'sight', note: 'Complete darkness, or the target is hidden or invisible. Attacks, Notice and powers only (p157)' },
  { key: 'unstable', label: 'Unstable Platform', value: -2, group: 'platform', affects: 'self', rolls: 'ranged', note: 'Shooting and throwing from a moving vehicle or other unsteady footing: \u22122, unless Steady Hands (p165). Nothing on any other roll. On a horse, use Mounted' },
  // Unstable Platform, plus Horsemanship. Same group, because a horse *is* an
  // unstable platform and holding both would charge the −2 twice; same `value`
  // and `rolls`, because Horsemanship's −2 is the Unstable Platform penalty
  // restated. What only a horse adds is the Fighting die — the lower of Fighting
  // and Riding — which lives in `mounted.ts`. Paul, 2026-10-09: a condition on
  // the token, applied automatically.
  { key: 'mounted', label: 'Mounted', value: -2, group: 'platform', affects: 'self', rolls: 'ranged', badge: 'MOUNT', note: 'Unstable Platform \u2014 shooting and throwing at \u22122 unless Steady Hands \u2014 and Fighting rolls the lower of Fighting and Riding (p165). A still horse counts' },
  // Running is its own group, not part of 'action': the book penalises "all
  // actions that turn" for running (p151), and a Multi-Action costs a further −2
  // per extra action. Someone who runs and shoots twice is at −4, so grouping the
  // two together would have silently thrown one of them away.
  { key: 'running', label: 'Running', value: -2, group: 'running', affects: 'self', note: 'All actions this turn, when the Running die was added to Pace (p151)' },
  { key: 'multi2', label: 'Multi-Action ×2', value: -2, group: 'action', affects: 'self', note: 'Two actions this turn — each is at −2 (p159)' },
  { key: 'multi3', label: 'Multi-Action ×3', value: -4, group: 'action', affects: 'self', note: 'Three actions this turn — each is at −4 (p159)' },
  { key: 'distracted', label: 'Distracted', value: -2, group: 'distracted', affects: 'self', badge: 'DISTR', note: 'Subtract 2 from all Trait rolls until the end of their next turn (p154)' },
  { key: 'offhand', label: 'Off-hand', value: -2, group: 'hand', affects: 'self', rolls: 'attack', note: 'Attacking with the off-hand. Fighting, Shooting and throws only (p158)' },
  { key: 'improvised', label: 'Improvised weapon', value: -2, group: 'weapon', affects: 'self', rolls: 'attack', note: 'A chair, a bottle, a pistol used as a club. Attack rolls only (p158)' },

  // ---------------------------------------------------------------------------
  // States a body is in, rather than modifiers the Marshal called on a roll.
  //
  // Written from memory until 2026-10-09 and carrying 0; checked against the book
  // in §27 (ggg), and what each does is now in `targetMods` and `situationalMods`:
  //
  //   - Vulnerable: *"Actions and attacks against the target are made at +2"*
  //     (p155).
  //   - Stunned: *"Are Distracted… Are Vulnerable… Fall prone (or to their knees,
  //     GM's call)"* (p162). Prone is left to the Marshal, as the book leaves it.
  //   - Entangled: *"can't move and is Vulnerable"*. Bound: *"Distracted and
  //     Vulnerable"* (p153).
  //   - Prone: *"Ranged attacks suffer a −4 penalty to hit prone characters from
  //     a range of 3″ or greater (this does not stack with Cover)… If a prone
  //     defender is caught in melee, their Parry is reduced by 2 and they must
  //     subtract 2 from their Fighting rolls."* (p160)
  //
  // "Counts as Vulnerable" is one +2, however many of them apply — which is why
  // the number lives in `targetMods` and not in `value` below, where four of them
  // would sum. `value` is what the pill shows.
  //
  // Every one has its own group, so a character can be Prone and Vulnerable and
  // Stunned at once. Only Entangled and Bound share one, being two degrees of
  // the same thing.
  { key: 'prone', label: 'Prone', value: 0, group: 'posture', affects: 'others', badge: 'PRONE', note: 'Lying down. Ranged attacks from 3″ or more at \u22124, which does not stack with cover; in melee their Parry is 2 lower and they are at \u22122 to Fighting (p160)' },
  { key: 'vulnerable', label: 'Vulnerable', value: 2, group: 'vulnerable', affects: 'others', badge: 'VULN', note: 'Attackers add 2 to rolls against this character' },
  { key: 'stunned', label: 'Stunned', value: 2, group: 'stunned', affects: 'others', badge: 'STUN', note: 'Cannot act; counts as Vulnerable and Distracted until they recover' },
  { key: 'entangled', label: 'Entangled', value: 2, group: 'restraint', affects: 'others', badge: 'ENTGL', note: 'Held but with limbs free — may attempt to break out' },
  { key: 'bound', label: 'Bound', value: 2, group: 'restraint', affects: 'others', badge: 'BOUND', note: 'Wholly restrained: cannot move or act physically' },
];

/**
 * Where this lives: on the token, beside wounds, because it is true of a
 * character in a scene rather than of the character.
 *
 * Conditions are stored by **key**, not by value, so retuning a number here does
 * not require migrating every bound token in Damian's room.
 */
export interface ModifierState {
  /** Whatever the Marshal dialled in by hand, on top of the named conditions. */
  mod?: number;
  conditions?: string[];
}

/**
 * How far the manual track runs either side of zero.
 *
 * Six to begin with, because the named conditions already reach −6 (Pitch Dark)
 * and a dial that stopped at four could not express by hand what the list
 * expresses by name. Eight at Damian's request: penalties stack — Pitch Dark and
 * a called shot, say — and the dial was bottoming out before the situation did.
 *
 * The cost is width. Seventeen pips on a line that must not wrap is what drives
 * the labelling in `modifierGroup`: only the ends of each run carry a sign.
 */
export const MANUAL_RANGE = 8;

export function findSituation(key: string): Situation | undefined {
  return SITUATIONS.find((s) => s.key === key);
}

export function situationsOf(state: ModifierState | undefined): Situation[] {
  return (state?.conditions ?? [])
    .map(findSituation)
    .filter((s): s is Situation => s !== undefined);
}

export function hasCondition(state: ModifierState | undefined, key: string): boolean {
  return (state?.conditions ?? []).includes(key);
}

/** Turn a condition on or off, clearing anything it excludes. */
export function toggleCondition<T extends ModifierState>(state: T, key: string): T {
  const situation = findSituation(key);
  if (!situation) return state;
  const current = state.conditions ?? [];
  if (current.includes(key)) return { ...state, conditions: current.filter((k) => k !== key) };
  const kept = current.filter((other) => {
    const found = findSituation(other);
    return found !== undefined && (!situation.group || found.group !== situation.group);
  });
  return { ...state, conditions: [...kept, key] };
}

export function setManualMod<T extends ModifierState>(state: T, value: number): T {
  const clamped = Math.max(-MANUAL_RANGE, Math.min(MANUAL_RANGE, Math.round(value || 0)));
  return { ...state, mod: clamped };
}

/** One click to put a character back to square one, which is what stops a stale −4. */
export function clearModifiers<T extends ModifierState>(state: T): T {
  return { ...state, mod: 0, conditions: [] };
}

/**
 * What this character's own trait rolls pick up.
 *
 * Filtered to `affects: 'self'`, and that filter is the whole reason a
 * target-side condition can live on the same list: Vulnerable sitting in
 * `conditions` must not quietly add +2 to the victim's own Shooting roll.
 */
export function situationalMods(state: ModifierState | undefined, scope?: RollScope): RollMod[] {
  const mods: RollMod[] = situationsOf(state)
    .filter((s) => s.affects === 'self' && reaches(s, scope))
    .map((s) => ({
      label: s.label,
      value: s.value,
      kind: 'situational' as const,
      short: formatMod(s.value),
    }));
  mods.push(...bodyMods(state, scope));
  const manual = state?.mod ?? 0;
  if (manual) {
    mods.push({
      label: 'Modifier',
      value: manual,
      kind: 'situational',
      short: formatMod(manual),
    });
  }
  return mods;
}

/**
 * What kind of roll this is, for the conditions the book scopes to some rolls.
 *
 * `undefined` — the caller does not know — reaches only what reaches every roll,
 * which is the safe default for an attribute, a group roll, or the green total on
 * the modifier row.
 */
export type RollScope = 'melee' | 'ranged' | 'notice' | 'arcane' | 'other';

const REACHES: Record<'attack' | 'sight', readonly RollScope[]> = {
  attack: ['melee', 'ranged'],
  sight: ['melee', 'ranged', 'notice', 'arcane'],
};

/**
 * Whether a condition reaches a roll of this kind.
 *
 * The platform conditions (`'ranged'`) reach **nothing** here, in any scope:
 * `platformPenalty` charges them, because only it knows about Steady Hands. If a
 * ranged scope picked them up too, a shot from the saddle would pay −4.
 */
export function reaches(situation: Situation, scope: RollScope | undefined): boolean {
  if (situation.rolls === undefined) return true;
  if (situation.rolls === 'ranged') return false;
  return scope !== undefined && REACHES[situation.rolls].includes(scope);
}

/** The Deadlands arcane skills: Faith, Focus, Spellcasting, Weird Science — the skills summary lists no others. */
const ARCANE_SKILL = /^(faith|focus|spellcasting|weird\s+science)\b/i;

/**
 * The scope of a roll made from the skills list, by its skill.
 *
 * Athletics is `'other'` here: off the skills list it is a climb, and only a throw
 * from the weapons table is an attack — the same split `attackCanStray` and the
 * platform penalty make. The shot panel says `'melee'` or `'ranged'` itself.
 */
export function scopeOfSkill(skill: string): RollScope {
  const name = skill.trim();
  if (/^fighting\b/i.test(name)) return 'melee';
  if (/^shooting\b/i.test(name)) return 'ranged';
  if (/^notice\b/i.test(name)) return 'notice';
  if (ARCANE_SKILL.test(name)) return 'arcane';
  return 'other';
}

/**
 * What the body conditions do to this character's *own* rolls.
 *
 * They are `affects: 'others'` in the table, because their main effect is on
 * whoever attacks them, so the filter in `situationalMods` would never reach
 * these halves on its own:
 *
 *   - Stunned and Bound are Distracted — −2 to every trait roll — once, and not
 *     again if Distracted is set as well. Entangled is not.
 *   - A prone defender *"must subtract 2 from their Fighting rolls"* (p160).
 */
function bodyMods(state: ModifierState | undefined, scope: RollScope | undefined): RollMod[] {
  const mods: RollMod[] = [];
  const cause = ['stunned', 'bound'].find((key) => hasCondition(state, key));
  if (cause && !hasCondition(state, 'distracted')) {
    const label = findSituation(cause)?.label ?? cause;
    mods.push({ label: `Distracted (${label})`, value: -2, kind: 'situational', short: '-2' });
  }
  if (scope === 'melee' && hasCondition(state, 'prone')) {
    mods.push({ label: 'Prone', value: -2, kind: 'situational', short: '-2' });
  }
  return mods;
}

/**
 * The conditions a Soak roll does **not** take — the rest of the track it does.
 *
 * Soak is a Vigor roll against the hit, made before the wounds land, and most of
 * this track is scoped by the book to something it is not:
 *
 *   - Illumination: *"rolls affected by Illumination, such as attacks, Notice
 *     rolls, the use of powers"* (p157). Nobody soaks a bullet worse in the dark.
 *   - Running: *"a −2 penalty to all actions that turn"* (p151), and Multi-Action
 *     is a penalty per action. A Soak is not an action.
 *   - Off-hand: *"actions that require precise eye-hand coordination, such as
 *     Fighting or Shooting"*. Improvised weapon: *"subtract 2 from attack rolls"*.
 *
 * What stays: Distracted (*"all Trait rolls"*), Fatigue and the earlier wounds
 * (which `soakBreakdown` adds), and the hand dial, which is the Marshal's.
 *
 * Soak was scoped first, earlier on 2026-10-09, because it is a roll the app makes
 * on its own and commits; (fff) then scoped the rest the same night.
 */
const NOT_ON_SOAK: ReadonlySet<string> = new Set(['running', 'multi2', 'multi3']);

/**
 * `situationalMods` for a Soak, less what a Soak roll does not take.
 *
 * Illumination, Off-hand and Improvised need no listing any more: a Soak is an
 * `'other'` roll, which none of them reach (§27 (fff)). Running and Multi-Action
 * are on every roll by their own rule and off this one only because a Soak is
 * not an action.
 */
export function soakMods(state: ModifierState | undefined): RollMod[] {
  const dropped = new Set(
    situationsOf(state)
      .filter((s) => NOT_ON_SOAK.has(s.key))
      .map((s) => s.label),
  );
  return situationalMods(state, 'other').filter((mod) => !dropped.has(mod.label));
}

export function situationalTotal(state: ModifierState | undefined, scope?: RollScope): number {
  return situationalMods(state, scope).reduce((sum, mod) => sum + mod.value, 0);
}

/** What the attacker is doing, for the target conditions that depend on it. */
export interface AttackContext {
  melee: boolean;
  /** The measured distance, when there is one. Prone at range needs it. */
  cells?: number | undefined;
  /** Cover already declared on this shot, as its (negative) modifier. */
  cover?: number | undefined;
}

/** The conditions that *"count as Vulnerable"* — one +2 between them. */
const COUNTS_AS_VULNERABLE = ['vulnerable', 'stunned', 'entangled', 'bound'] as const;

export const VULNERABLE_BONUS = 2;

/** `"Ranged attacks suffer a −4 penalty to hit prone characters from a range of 3″ or greater"` — p160. */
export const PRONE_AT_RANGE = -4;
export const PRONE_RANGE_CELLS = 3;
/** `"If a prone defender is caught in melee, their Parry is reduced by 2"` — p160. */
export const PRONE_IN_MELEE = 2;

/**
 * The conditions a *target* is in, as modifiers on whoever is attacking them.
 *
 * The bonus lands on the attacker's total rather than on the target number, which
 * matters for raises: a raise is counted off the margin, so a Vulnerable target is
 * both easier to hit *and* easier to hit well. A prone defender's Parry −2 is the
 * same arithmetic, written the same way, and labelled so the table says why.
 *
 * - **Vulnerable**, and the three that count as it — Stunned, Entangled, Bound —
 *   give **one** +2 however many are set. Stunned and Vulnerable together is +2,
 *   not +4.
 * - **Prone** depends on the attack. In melee, +2 (their Parry is 2 lower). At
 *   range, from 3″ or more, −4 — and *"this does not stack with Cover"*, which the
 *   cover table makes concrete (*"Medium Cover: Half the target is obscured (or
 *   target is prone)"*), so it is the difference between the declared cover and
 *   Medium, when that is worse. Unmeasured, nothing: the rule is a distance rule.
 *   Not something Aim can cancel here, though cover would be — a known gap, since
 *   Aim lives on the shot and this on the target.
 *
 * With no context (a roll that is not an attack) only Vulnerable applies, as
 * *"Actions and attacks against the target"* covers any action.
 */
export function targetMods(state: ModifierState | undefined, context?: AttackContext): RollMod[] {
  const mods: RollMod[] = [];
  const vulnerable = COUNTS_AS_VULNERABLE.filter((key) => hasCondition(state, key));
  if (vulnerable.length) {
    const why = vulnerable
      .filter((key) => key !== 'vulnerable')
      .map((key) => findSituation(key)?.label ?? key);
    mods.push({
      label: why.length && !vulnerable.includes('vulnerable') ? `Vulnerable (${why.join(', ')})` : 'Vulnerable',
      value: VULNERABLE_BONUS,
      kind: 'situational',
      short: formatMod(VULNERABLE_BONUS),
    });
  }
  if (context && hasCondition(state, 'prone')) {
    if (context.melee) {
      mods.push({ label: 'Prone (Parry \u22122)', value: PRONE_IN_MELEE, kind: 'situational', short: '+2' });
    } else if (context.cells !== undefined && context.cells >= PRONE_RANGE_CELLS) {
      const cover = Math.min(0, context.cover ?? 0);
      const worse = Math.min(cover, PRONE_AT_RANGE) - cover;
      if (worse) {
        mods.push({ label: 'Prone (as Medium Cover)', value: worse, kind: 'situational', short: formatMod(worse) });
      }
    }
  }
  return mods;
}

export function targetTotal(state: ModifierState | undefined, context?: AttackContext): number {
  return targetMods(state, context).reduce((sum, mod) => sum + mod.value, 0);
}

/**
 * One letter per target-side condition — V, P, S — for a table cell that has
 * room for almost nothing.
 *
 * The first letter of the label rather than a hand-kept list, because the five
 * of them do not collide and a second list would be a second thing to forget.
 *
 * `value` is what *this* condition is worth to the attack, so a pill can say
 * whether it was applied. The ones that count as Vulnerable each show the +2 and
 * say in their note that it is one +2 between them; Prone shows what it came to
 * against this attack, or 0 when it does not reach it.
 */
export function targetPills(
  state: ModifierState | undefined,
  context?: AttackContext,
): { letter: string; label: string; note: string; value: number }[] {
  const prone = targetMods(state, context).find((mod) => mod.label.startsWith('Prone'));
  return situationsOf(state)
    .filter((s) => s.affects === 'others')
    .map((s) => {
      const counts = (COUNTS_AS_VULNERABLE as readonly string[]).includes(s.key);
      return {
        letter: s.label.charAt(0).toUpperCase(),
        label: s.label,
        note: counts
          ? `${s.note}. Counts as Vulnerable: one +${VULNERABLE_BONUS} however many of these are set`
          : s.note,
        value: s.key === 'prone' ? (prone?.value ?? 0) : counts ? VULNERABLE_BONUS : s.value,
      };
    });
}

/** `+2`, `-2`, or empty for nothing. */
export function formatMod(value: number): string {
  if (!value) return '';
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Short text for every active condition worth drawing on the token, in list
 * order so the stack does not reshuffle as conditions come and go.
 *
 * Shaken is not here: it lives on `TokenState` as its own field, not as a
 * condition, and the caller puts it at the head of the stack.
 */
export function conditionBadges(state: ModifierState | undefined): string[] {
  // Sorted by list position rather than taken in stored order: `toggleCondition`
  // appends, so the stored order is the order they were switched on, and a stack
  // that reorders itself when one is cleared is hard to read at a glance.
  return SITUATIONS.filter(
    (s) => s.badge !== undefined && hasCondition(state, s.key),
  ).map((s) => s.badge as string);
}

/** A one-line summary of what a total is made of, for a tooltip. */
export function describeMods(mods: readonly RollMod[]): string {
  return mods.map((mod) => `${mod.label} ${formatMod(mod.value)}`).join(', ');
}
