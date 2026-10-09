/**
 * Shooting and throwing from something that will not keep still.
 *
 * > *"A character attempting to fire or throw a ranged weapon from the back of a
 * > horse or other mount, a moving vehicle, or other 'unstable platform'
 * > subtracts 2 from the total."* — p165
 *
 * > *"Athletics (throwing) and Shooting rolls are made at −2 unless the rider has
 * > the Steady Hands Edge."* — p165, Mounted Combat
 *
 * One penalty, reached by either platform condition — Unstable Platform, or
 * Mounted, which is Unstable Platform plus Horsemanship's Fighting die. Paul,
 * 2026-10-09: they are the same −2 and must not be two implementations that can
 * drift. The figure and the label come off `SITUATIONS`, so there is one place
 * the number is written.
 *
 * Scoped to shots and throws, and that is the caller's to say: the skill name
 * cannot, since Athletics is a throw off the weapons table and a climb off the
 * skills list.
 *
 * A still horse still counts — the book qualifies the vehicle ("a moving
 * vehicle") and not the horse. A parked wagon is not a platform at all, which is
 * the Marshal not ticking it rather than anything here.
 */
import type { NamedEntry } from './sheet.js';
import { situationsOf, type ModifierState } from './modifiers.js';

/**
 * Steady Hands: *"They ignore the Unstable Platform penalty (page 165)."*
 *
 * Matched on the name, as `negatesRecoil` matches Rock and Roll!: the edge list is
 * what was imported off a card, and the card writes the name.
 */
export function hasSteadyHands(edges: readonly Pick<NamedEntry, 'name'>[]): boolean {
  return edges.some((edge) => /^\s*steady\s+hands\b/i.test(edge.name));
}

/**
 * The −2, labelled by whichever condition charged it, or nothing.
 *
 * Nothing for a roll that is not a shot or a throw, for a character on solid
 * ground, and for anyone with Steady Hands.
 */
export function platformPenalty(
  state: ModifierState | undefined,
  ranged: boolean,
  edges: readonly Pick<NamedEntry, 'name'>[],
): { label: string; value: number } | undefined {
  if (!ranged || hasSteadyHands(edges)) return undefined;
  const platform = situationsOf(state).find((s) => s.rolls === 'ranged' && s.affects === 'self');
  return platform ? { label: platform.label, value: platform.value } : undefined;
}
