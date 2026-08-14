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
 *   - Illumination, Unstable Platform, Running, Distracted, off-hand, improvised
 *     weapon — all true of the *roller* until something changes. They apply to
 *     every trait roll, which is exactly what this track does.
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
  note: string;
}

export const SITUATIONS: readonly Situation[] = [
  { key: 'dim', label: 'Dim', value: -2, group: 'light', note: 'Twilight, light fog, night with a full moon (p157)' },
  { key: 'dark', label: 'Dark', value: -4, group: 'light', note: 'Typical night with some ambient light; targets invisible beyond 10″ (p157)' },
  { key: 'pitch', label: 'Pitch Dark', value: -6, group: 'light', note: 'Complete darkness, or the target is hidden or invisible (p157)' },
  { key: 'unstable', label: 'Unstable Platform', value: -2, group: 'platform', note: 'Firing or throwing from a horse, a moving vehicle, a rooftop (p165)' },
  // Running is its own group, not part of 'action': the book penalises "all
  // actions that turn" for running (p151), and a Multi-Action costs a further −2
  // per extra action. Someone who runs and shoots twice is at −4, so grouping the
  // two together would have silently thrown one of them away.
  { key: 'running', label: 'Running', value: -2, group: 'running', note: 'All actions this turn, when the Running die was added to Pace (p151)' },
  { key: 'multi2', label: 'Multi-Action ×2', value: -2, group: 'action', note: 'Two actions this turn — each is at −2 (p159)' },
  { key: 'multi3', label: 'Multi-Action ×3', value: -4, group: 'action', note: 'Three actions this turn — each is at −4 (p159)' },
  { key: 'distracted', label: 'Distracted', value: -2, group: 'distracted', note: 'Subtract 2 from all Trait rolls until the end of their next turn (p154)' },
  { key: 'offhand', label: 'Off-hand', value: -2, group: 'hand', note: 'Attacking with the off-hand (p158)' },
  { key: 'improvised', label: 'Improvised weapon', value: -2, group: 'weapon', note: 'A chair, a bottle, a pistol used as a club (p157)' },
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

/** How far the manual track runs either side of zero. */
export const MANUAL_RANGE = 4;

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

export function situationalMods(state: ModifierState | undefined): RollMod[] {
  const mods: RollMod[] = situationsOf(state).map((s) => ({
    label: s.label,
    value: s.value,
    kind: 'situational' as const,
    short: formatMod(s.value),
  }));
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

export function situationalTotal(state: ModifierState | undefined): number {
  return situationalMods(state).reduce((sum, mod) => sum + mod.value, 0);
}

/** `+2`, `-2`, or empty for nothing. */
export function formatMod(value: number): string {
  if (!value) return '';
  return value > 0 ? `+${value}` : String(value);
}

/** A one-line summary of what a total is made of, for a tooltip. */
export function describeMods(mods: readonly RollMod[]): string {
  return mods.map((mod) => `${mod.label} ${formatMod(mod.value)}`).join(', ');
}
