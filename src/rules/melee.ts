/**
 * Melee, as the same kind of object a shot is.
 *
 * Damian and Paul, agreed at the table on 2026-09-12: *"the best way of solving
 * most of the melee issues was just to get the Fighting dialogue to match the
 * Shooting dialogue."* So this is not a second panel. It is the same panel with
 * the ranged half switched off and the melee-only modifiers switched on, and
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
 * The things the book gives a melee attacker, none of which existed anywhere in
 * this app before: Gang Up, the way you swing (ordinary, Wild, or Desperate at
 * either size), an unarmed foe, and Two Weapons. They are all `'other'` for the
 * same reason the dial is: Aim's category list is exact, and being outside it is
 * the truth about them.
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

/**
 * How the attacker swings — one choice, because the book makes it one.
 *
 * Wild Attack: *"+2 to the character's Fighting attacks and resulting damage
 * rolls, but they are Vulnerable until the end of their next turn"* (p165).
 *
 * Desperate Attack: *"The attacker adds +2 or +4 to any Fighting roll and
 * subtracts a like amount from damage if they hit. This can be determined per
 * attack (before rolling), and can't be combined with Wild Attack."* (p165)
 *
 * A union rather than a Wild checkbox beside a Desperate one, so the exclusivity
 * is a property of the type and not a rule somebody has to remember to enforce.
 * Damian asked for Desperate twice — 2026-09-14 from memory, 2026-10-09 with the
 * page photographed — and Paul chose this shape on 10-09.
 */
export type Swing = 'ordinary' | 'wild' | 'desperate2' | 'desperate4';

export const SWINGS: readonly Swing[] = ['ordinary', 'wild', 'desperate2', 'desperate4'];

/** `"A Wild Attack adds +2 to the character's Fighting attacks and resulting damage rolls"` — p165. */
export const WILD_ATTACK = 2;

/** What each swing adds to the attack. Desperate's cost is on the damage — see `swingDamage`. */
const SWING_ATTACK: Record<Swing, number> = {
  ordinary: 0,
  wild: WILD_ATTACK,
  desperate2: 2,
  desperate4: 4,
};

/**
 * What a swing adds to the attack roll.
 *
 * Wild Attack's other cost is Vulnerable, which is a condition on the attacker
 * and not a modifier. Paul's call on 2026-10-09 was that the app **sets it** when
 * the attack is rolled, rather than leaving it in a note for the Marshal — so it
 * lives with the roll, in the panel, and `costsVulnerable` is how the panel asks.
 */
export function swingMod(swing: Swing): ShotMod | undefined {
  const value = SWING_ATTACK[swing];
  if (!value) return undefined;
  if (swing === 'wild') {
    return {
      key: 'wild',
      label: 'Wild Attack',
      value,
      category: 'other',
      kind: 'choice',
      scope: 'shot',
      note: `+${value} to the attack and to damage; you are Vulnerable until the end of your next turn (p165).`,
    };
  }
  return {
    key: 'desperate',
    label: `Desperate +${value}`,
    value,
    category: 'other',
    kind: 'choice',
    scope: 'shot',
    note: `+${value} to the attack and −${value} to damage if it hits. Cannot be combined with a Wild Attack (p165).`,
  };
}

/**
 * What a swing does to the damage roll: +2 for Wild, −2 or −4 for Desperate.
 *
 * Separate from the attack because damage is rolled from a different expression
 * at a different moment. The first negative number this path has ever carried,
 * so whoever spends it must write it with `formatMod` and not with a bare `+`.
 */
export function swingDamage(swing: Swing): number {
  if (swing === 'wild') return WILD_ATTACK;
  if (swing === 'ordinary') return 0;
  return -SWING_ATTACK[swing];
}

/** Whether rolling this swing leaves the attacker Vulnerable. */
export function costsVulnerable(swing: Swing): boolean {
  return swing === 'wild';
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

/**
 * `"A character armed with two melee weapons adds +1 to their Fighting rolls if
 * the foe has a single weapon or is unarmed, and has no shield. It adds no bonus
 * against creatures with Natural Weapons (page 159)."` — p165.
 *
 * Damian's half-remembered *"+1 if you're fighting two-handed against a foe with
 * only one hand weapon"* (2026-09-14). A checkbox, like the unarmed foe, for the
 * same reason: carrying two knives on a gear line is not the same as holding one
 * in each hand, and what the defender holds is not on any sheet the app can read.
 *
 * It **stacks** with the unarmed foe — "or is unarmed" is in its condition — and
 * natural weapons cancel it, which is in the note rather than enforced.
 */
export const TWO_WEAPONS = 1;

export function twoWeaponsMod(on: boolean): ShotMod | undefined {
  if (!on) return undefined;
  return {
    key: 'two-weapons',
    label: 'Two weapons',
    value: TWO_WEAPONS,
    category: 'other',
    kind: 'fact',
    scope: 'shot',
    note:
      `A melee weapon in each hand, against a foe with one weapon or none and no shield: ` +
      `+${TWO_WEAPONS} (p165). Nothing against claws, fangs or other natural weapons.`,
  };
}

export interface MeleeRequest {
  /** Points of Gang Up bonus, already netted off against the defender's allies. */
  gangUp?: number | undefined;
  swing?: Swing | undefined;
  unarmedFoe?: boolean | undefined;
  twoWeapons?: boolean | undefined;
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

  const swing = swingMod(request.swing ?? 'ordinary');
  if (swing) mods.push(swing);

  const unarmed = unarmedDefenderMod(request.unarmedFoe ?? false);
  if (unarmed) mods.push(unarmed);

  const pair = twoWeaponsMod(request.twoWeapons ?? false);
  if (pair) mods.push(pair);

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
