/**
 * Melee, as the same kind of object a shot is.
 *
 * Damian and Paul, agreed at the table on 2026-09-12: *"the best way of solving
 * most of the melee issues was just to get the Fighting dialogue to match the
 * Shooting dialogue."* So this is not a second panel. It is the same panel with
 * the ranged half switched off and three melee-only modifiers switched on, and
 * that is why the modifiers here are `ShotMod`s rather than a parallel type.
 *
 * ## What melee does *not* have
 *
 * Rate of Fire, Recoil, range bands, cover and a scope are all properties of
 * shooting something from a distance. Aim goes with them: the manoeuvre reads
 * *"if a character spends their entire turn Aiming a **ranged weapon**"* (p152),
 * and Marksman is *"a lesser version of the Aim manoeuvre"* with the same
 * restriction. None of them appear on a melee attack, and none of the five
 * categories Aim could spend points on can arise, so there is nothing for the
 * aimable dial to do either.
 *
 * ## What it has instead
 *
 * Three things the book gives a melee attacker, none of which existed anywhere in
 * this app before. They are all `'other'` for the same reason the dial is: Aim's
 * category list is exact, and being outside it is the truth about them.
 */
import type { ModCategory, ShotMod } from './shot.js';

/**
 * `"Each additional adjacent foe (who isn't Stunned) adds +1 to all the
 * attackers' Fighting rolls, up to a maximum of +4."` — p156.
 *
 * The cap is on the bonus, not on the crowd. *"If three gremlins attack a single
 * hero, for example, each of them adds +2"* — three attackers, two of them
 * "additional", +2 each.
 */
export const GANG_UP_MAX = 4;

/**
 * Counted rather than worked out from the map, and deliberately.
 *
 * The rule needs adjacency to the *defender*, and then the second half —
 * *"each ally adjacent to the defender cancels out one point of Gang Up bonus
 * from an attacker adjacent to both"* — needs to know which of the tokens near
 * them are allies of whom. The app has no notion of sides (§19.2: tagging every
 * NPC friend or foe is state that goes wrong in the heat of a fight, and Paul's
 * call was against it), so a computed number here would be confidently wrong
 * about half the time. The Marshal can see the map; this is a number they set.
 */
export function gangUpMod(bonus: number): ShotMod | undefined {
  const value = Math.max(0, Math.min(GANG_UP_MAX, Math.round(bonus)));
  if (!value) return undefined;
  return {
    key: 'gang-up',
    label: 'Gang Up',
    value,
    category: 'other',
    kind: 'fact',
    scope: 'shot',
    note:
      'Each additional adjacent foe adds +1, up to +4 — less one for each ally ' +
      'adjacent to the defender (p156).',
  };
}

/** `"A Wild Attack adds +2 to the character's Fighting attacks and resulting damage rolls"` — p165. */
export const WILD_ATTACK = 2;

/**
 * The other half of a Wild Attack is a cost, and it is not a modifier.
 *
 * *"…but they are Vulnerable until the end of their next turn (not this one)."*
 * Vulnerable is a condition on the attacker, already in `SITUATIONS`, and setting
 * it is a change to a token rather than to a roll. The panel says so where the
 * control is; applying it is the Marshal's, for the same reason nothing else here
 * reaches across and edits the attacker mid-roll.
 */
export function wildAttackMod(on: boolean): ShotMod | undefined {
  if (!on) return undefined;
  return {
    key: 'wild',
    label: 'Wild Attack',
    value: WILD_ATTACK,
    category: 'other',
    kind: 'choice',
    scope: 'shot',
    note: `+${WILD_ATTACK} to the attack and to damage; Vulnerable until the end of your next turn (p165).`,
  };
}

/** `"An attacker armed with a melee weapon adds +2 to their Fighting attacks if their foe has no weapon or shield."` — p165. */
export const UNARMED_DEFENDER = 2;

/**
 * A property of the *defender*, offered as a control on the attack.
 *
 * It cannot be worked out: whether the character on the other end is holding
 * anything is a question about their gear line, and an Extra off a stat block may
 * have no gear line at all. The book also notes it *"doesn't stack with the
 * Drop"*, which is not enforced — the Drop is not modelled, and saying so in the
 * note is the same treatment `PARRY_VISIBLE_CELLS` gives the rules it cannot see.
 */
export function unarmedDefenderMod(on: boolean): ShotMod | undefined {
  if (!on) return undefined;
  return {
    key: 'unarmed-foe',
    label: 'Unarmed foe',
    value: UNARMED_DEFENDER,
    category: 'other',
    kind: 'fact',
    scope: 'shot',
    note: `Your foe has no weapon or shield: +${UNARMED_DEFENDER} (p165). Does not stack with the Drop.`,
  };
}

export interface MeleeRequest {
  /** Points of Gang Up bonus, already netted off against the defender's allies. */
  gangUp?: number | undefined;
  wild?: boolean | undefined;
  unarmedFoe?: boolean | undefined;
  /** A called shot, as the Scale of what is aimed at — the same rule as a shot. */
  calledShot?: ShotMod | undefined;
  /** Wounds, Fatigue, the dark: already summed, and none of it melee-specific. */
  situation?: number | undefined;
  /** The hand dial, for every rule this app will never know. */
  dial?: number | undefined;
}

export interface MeleeTotal {
  mods: ShotMod[];
  total: number;
}

/**
 * Everything on a Fighting attack, in the order it should be read.
 *
 * Deliberately has no `applyAim` step. There is nothing to aim with and nothing
 * aimable to spend it on — see the module note — so unlike `shotTotal` this is a
 * sum and not a negotiation.
 */
export function meleeTotal(request: MeleeRequest): MeleeTotal {
  const mods: ShotMod[] = [];

  const gang = gangUpMod(request.gangUp ?? 0);
  if (gang) mods.push(gang);

  const wild = wildAttackMod(request.wild ?? false);
  if (wild) mods.push(wild);

  const unarmed = unarmedDefenderMod(request.unarmedFoe ?? false);
  if (unarmed) mods.push(unarmed);

  if (request.calledShot) mods.push(request.calledShot);

  if (request.situation) {
    mods.push({
      key: 'situation',
      label: 'Situation',
      value: request.situation,
      category: 'other' satisfies ModCategory,
      kind: 'fact',
      scope: 'shot',
      note: 'From the token: wounds, fatigue and whatever the Marshal has dialled in there.',
    });
  }

  if (request.dial) {
    mods.push({
      key: 'dial',
      label: 'Modifier',
      value: request.dial,
      category: 'other',
      kind: 'choice',
      scope: 'shot',
      note: 'Dialled by hand.',
    });
  }

  return { mods, total: mods.reduce((sum, mod) => sum + mod.value, 0) };
}

/**
 * What a Wild Attack adds to the damage roll.
 *
 * Separate from the attack total because damage is rolled from a different
 * expression at a different moment, and the two numbers happen to be the same
 * only by coincidence of the rule's wording.
 */
export function wildAttackDamage(wild: boolean): number {
  return wild ? WILD_ATTACK : 0;
}
