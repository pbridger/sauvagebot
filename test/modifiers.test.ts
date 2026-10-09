import { describe, expect, it } from 'vitest';
import {
  MANUAL_RANGE,
  SITUATIONS,
  clearModifiers,
  conditionBadges,
  describeMods,
  formatMod,
  hasCondition,
  setManualMod,
  scopeOfSkill,
  situationalMods,
  situationalTotal,
  situationsOf,
  targetMods,
  targetPills,
  targetTotal,
  toggleCondition,
} from '../src/rules/modifiers.js';
import { isTokenState, newTokenState, type TokenState } from '../src/obr/binding.js';
import { rollBreakdown, statusMods, traitPenalty } from '../src/rules/status.js';

const state = (over: Partial<TokenState> = {}): TokenState => ({
  ...newTokenState('reggie'),
  ...over,
});

describe('the condition list', () => {
  it('carries the values the book prints', () => {
    const value = (key: string): number | undefined =>
      SITUATIONS.find((s) => s.key === key)?.value;
    // Illumination, p157.
    expect(value('dim')).toBe(-2);
    expect(value('dark')).toBe(-4);
    expect(value('pitch')).toBe(-6);
    // Unstable Platform p165, Distracted p154, Running p151.
    expect(value('unstable')).toBe(-2);
    expect(value('distracted')).toBe(-2);
    expect(value('running')).toBe(-2);
  });

  it('holds nothing that depends on the target of one attack', () => {
    // Cover, The Drop, Gang Up and Range belong to a single attack against a
    // single target. Left standing on a character they would follow them into
    // their next Notice roll — see the module comment.
    const labels = SITUATIONS.map((s) => s.label.toLowerCase()).join(' ');
    for (const excluded of ['cover', 'drop', 'gang up', 'range', 'called shot']) {
      expect(labels, excluded).not.toContain(excluded);
    }
  });

  it('gives every condition a note saying where it comes from', () => {
    for (const situation of SITUATIONS) {
      expect(situation.note.length, situation.key).toBeGreaterThan(20);
    }
  });
});

describe('setting conditions', () => {
  it('toggles one on and off', () => {
    const dark = toggleCondition(state(), 'dark');
    expect(hasCondition(dark, 'dark')).toBe(true);
    expect(situationalTotal(dark, 'ranged')).toBe(-4);
    expect(hasCondition(toggleCondition(dark, 'dark'), 'dark')).toBe(false);
  });

  it('replaces rather than stacks within a group', () => {
    // You cannot be in Dim light and Pitch Darkness at once; summing them to −8
    // would be a quiet wrong answer.
    const lit = toggleCondition(toggleCondition(state(), 'dim'), 'pitch');
    expect(situationsOf(lit).map((s) => s.key)).toEqual(['pitch']);
    expect(situationalTotal(lit, 'notice')).toBe(-6);
  });

  it('sums across different groups', () => {
    const rough = toggleCondition(toggleCondition(state(), 'dark'), 'running');
    expect(situationalTotal(rough, 'melee')).toBe(-6);
  });

  /**
   * p165 scopes the platform penalty to *"fire or throw a ranged weapon"*. Until
   * 2026-10-09 Unstable Platform charged every roll — Notice, Fighting, Soak.
   */
  it('keeps the platform conditions off the every-roll track', () => {
    expect(situationalTotal(toggleCondition(state(), 'unstable'))).toBe(0);
    expect(situationalTotal(toggleCondition(state(), 'mounted'))).toBe(0);
    expect(situationalTotal(toggleCondition(toggleCondition(state(), 'dark'), 'unstable'), 'ranged')).toBe(-4);
  });

  /**
   * §27 (fff): the book scopes Illumination to *"attacks, Notice rolls, the use of
   * powers"* (p157), Off-hand to Fighting and Shooting, Improvised to attacks.
   */
  it('scopes the dark, the off hand and an improvised weapon to the rolls they reach', () => {
    const dark = toggleCondition(state(), 'dark');
    expect(situationalTotal(dark, 'melee')).toBe(-4);
    expect(situationalTotal(dark, 'ranged')).toBe(-4);
    expect(situationalTotal(dark, 'notice')).toBe(-4);
    expect(situationalTotal(dark, 'arcane')).toBe(-4);
    expect(situationalTotal(dark, 'other')).toBe(0);
    expect(situationalTotal(dark)).toBe(0);
    const clumsy = toggleCondition(toggleCondition(state(), 'offhand'), 'improvised');
    expect(situationalTotal(clumsy, 'melee')).toBe(-4);
    expect(situationalTotal(clumsy, 'notice')).toBe(0);
  });

  it('reads the scope off the skill', () => {
    expect(scopeOfSkill('Fighting')).toBe('melee');
    expect(scopeOfSkill('Shooting')).toBe('ranged');
    expect(scopeOfSkill('Notice')).toBe('notice');
    expect(scopeOfSkill('Faith')).toBe('arcane');
    expect(scopeOfSkill('Weird Science')).toBe('arcane');
    // A climb, off the skills list. Only a throw from the weapons table is an attack.
    expect(scopeOfSkill('Athletics')).toBe('other');
    expect(scopeOfSkill('Persuasion')).toBe('other');
  });

  /** Stunned and Bound are Distracted — once, even with Distracted also set. */
  it('makes Stunned and Bound Distracted, once', () => {
    expect(situationalTotal(toggleCondition(state(), 'stunned'))).toBe(-2);
    expect(situationalTotal(toggleCondition(state(), 'bound'))).toBe(-2);
    expect(situationalTotal(toggleCondition(state(), 'entangled'))).toBe(0);
    expect(situationalTotal(toggleCondition(toggleCondition(state(), 'stunned'), 'distracted'))).toBe(-2);
  });

  it('puts a prone character at −2 to their own Fighting only', () => {
    const down = toggleCondition(state(), 'prone');
    expect(situationalTotal(down, 'melee')).toBe(-2);
    expect(situationalTotal(down, 'ranged')).toBe(0);
  });

  it('stacks Running with a Multi-Action, which the book does', () => {
    // Running is −2 to "all actions that turn" (p151); a Multi-Action costs a
    // further −2 per extra action. Someone who runs and shoots twice is at −4.
    const busy = toggleCondition(toggleCondition(state(), 'running'), 'multi2');
    expect(situationsOf(busy).map((s) => s.key).sort()).toEqual(['multi2', 'running']);
    expect(situationalTotal(busy)).toBe(-4);
  });

  it('still swaps one Multi-Action for the other', () => {
    const three = toggleCondition(toggleCondition(state(), 'multi2'), 'multi3');
    expect(situationsOf(three).map((s) => s.key)).toEqual(['multi3']);
  });

  it('ignores a key it does not know', () => {
    expect(toggleCondition(state(), 'nonsense')).toEqual(state());
    expect(situationsOf({ conditions: ['nonsense'] })).toEqual([]);
  });

  it('adds the manual dial on top, clamped', () => {
    expect(setManualMod(state(), 2).mod).toBe(2);
    expect(setManualMod(state(), 99).mod).toBe(MANUAL_RANGE);
    expect(setManualMod(state(), -99).mod).toBe(-MANUAL_RANGE);
    expect(situationalTotal(setManualMod(toggleCondition(state(), 'dim'), 1), 'melee')).toBe(-1);
  });

  /**
   * The dial reaches as far as the worst thing the book can name, or the pips
   * cannot express by hand what the condition list expresses by name.
   */
  it('reaches at least as far as the deepest named penalty', () => {
    const worst = Math.min(...SITUATIONS.map((s) => s.value));
    expect(MANUAL_RANGE).toBeGreaterThanOrEqual(Math.abs(worst));
  });

  it('clears everything at once, which is what keeps a stale -4 from riding along', () => {
    const messy = setManualMod(toggleCondition(state(), 'dark'), -2);
    expect(situationalTotal(clearModifiers(messy))).toBe(0);
  });

  it('is nothing at all when never set', () => {
    expect(situationalTotal(state())).toBe(0);
    expect(situationalTotal(undefined)).toBe(0);
  });
});

/**
 * Conditions worn by a body, as opposed to modifiers called on a roll. The one
 * that matters here is that a target-side condition cannot reach the roll of the
 * character wearing it.
 */
describe('token conditions', () => {
  it('keeps Vulnerable out of the victim\'s own total', () => {
    // Vulnerable gives *attackers* +2. If it summed into this character's green
    // number they would get +2 to their own Shooting for being an easy target.
    const easy = toggleCondition(state(), 'vulnerable');
    expect(hasCondition(easy, 'vulnerable')).toBe(true);
    expect(situationalTotal(easy)).toBe(0);
    expect(situationalMods(easy)).toEqual([]);
    expect(rollBreakdown(easy).total).toBe(0);
  });

  it('records the real figure anyway, for a later target-aware roll', () => {
    expect(SITUATIONS.find((s) => s.key === 'vulnerable')?.value).toBe(2);
  });

  it('lets a character be Prone and Vulnerable and Stunned at once', () => {
    // Distinct groups. Sharing one would silently clear the others — the shape
    // of the Running/Multi-Action bug.
    let hapless = state();
    for (const key of ['prone', 'vulnerable', 'stunned']) {
      hapless = toggleCondition(hapless, key);
    }
    expect(situationsOf(hapless).map((s) => s.key).sort()).toEqual([
      'prone',
      'stunned',
      'vulnerable',
    ]);
  });

  it('swaps Entangled for Bound, being two degrees of one thing', () => {
    const tied = toggleCondition(toggleCondition(state(), 'entangled'), 'bound');
    expect(situationsOf(tied).map((s) => s.key)).toEqual(['bound']);
  });

  it('still lets Distracted count against its own rolls, and draw a badge', () => {
    const rattled = toggleCondition(state(), 'distracted');
    expect(situationalTotal(rattled)).toBe(-2);
    expect(conditionBadges(rattled)).toEqual(['DISTR']);
  });

  it('draws only the conditions worth drawing, in list order', () => {
    // Switched on back-to-front; the column comes out in list order regardless,
    // so it does not reshuffle as conditions come and go. Dark is not drawn: a
    // DARK marker over every token says nothing the Marshal does not know.
    let messy = state();
    for (const key of ['bound', 'vulnerable', 'dark']) messy = toggleCondition(messy, key);
    expect(conditionBadges(messy)).toEqual(['VULN', 'BOUND']);
  });

  it('keeps every badge short enough to place without measuring it', () => {
    for (const situation of SITUATIONS) {
      if (situation.badge !== undefined) {
        expect(situation.badge.length, situation.key).toBeLessThanOrEqual(5);
        expect(situation.badge).toBe(situation.badge.toUpperCase());
      }
    }
  });

  it('draws nothing for a character in no particular state', () => {
    expect(conditionBadges(state())).toEqual([]);
    expect(conditionBadges(undefined)).toEqual([]);
  });
});

describe('formatting', () => {
  it('signs a modifier and shows nothing for zero', () => {
    expect(formatMod(2)).toBe('+2');
    expect(formatMod(-2)).toBe('-2');
    expect(formatMod(0)).toBe('');
  });

  it('itemises a breakdown', () => {
    expect(
      describeMods([
        { label: '2 wounds', value: -2, kind: 'status' },
        { label: 'Dark', value: -4, kind: 'situational' },
      ]),
    ).toBe('2 wounds -2, Dark -4');
  });
});

/**
 * The breakdown is what a trait button labels itself with *and* what it rolls.
 * They used to be computed separately, which is a disagreement nobody sees.
 */
describe('the whole breakdown', () => {
  it('adds the red half to the green half', () => {
    const hurt = toggleCondition(state({ wounds: 2, fatigue: 1 }), 'dark');
    const breakdown = rollBreakdown(hurt, 'notice');
    expect(breakdown.status).toBe(-3);
    expect(breakdown.situational).toBe(-4);
    expect(breakdown.total).toBe(-7);
  });

  it('never disagrees with traitPenalty about the status half', () => {
    for (const wounds of [0, 1, 2, 3, 4]) {
      for (const fatigue of [0, 1, 2, 3]) {
        const s = state({ wounds, fatigue });
        expect(rollBreakdown(s).status, `${wounds}w ${fatigue}f`).toBe(traitPenalty(s));
        expect(statusMods(s).reduce((sum, m) => sum + m.value, 0)).toBe(traitPenalty(s));
      }
    }
  });

  it('names each part so the sheet and log can colour it', () => {
    const parts = rollBreakdown(
      setManualMod(toggleCondition(state({ wounds: 1, fatigue: 2 }), 'distracted'), 1),
    ).parts;
    expect(parts).toEqual([
      { label: '1 wound', value: -1, kind: 'status', short: '1W' },
      { label: 'Exhausted', value: -2, kind: 'status', short: '2F' },
      { label: 'Distracted', value: -2, kind: 'situational', short: '-2' },
      { label: 'Modifier', value: 1, kind: 'situational', short: '+1' },
    ]);
  });

  it('shortens the status parts the way the token badge does', () => {
    // 1W / 2F on the map, in the log, and nowhere a third notation.
    expect(statusMods(state({ wounds: 2, fatigue: 1 })).map((m) => m.short)).toEqual(['2W', '1F']);
  });

  it('is empty for a character with no token bound', () => {
    expect(rollBreakdown(undefined)).toEqual({
      status: 0,
      situational: 0,
      total: 0,
      parts: [],
    });
  });
});

/**
 * Paul's room has tokens bound since before any of this existed. A guard that
 * required the new fields would reject those bindings, and every wound on the
 * map would appear to vanish.
 */
describe('tokens bound before modifiers existed', () => {
  it('still validates without the new fields', () => {
    expect(isTokenState({ sheetId: 'reggie', wounds: 2, fatigue: 0, shaken: true })).toBe(true);
  });

  it('validates with them', () => {
    expect(isTokenState({ ...state(), mod: -1, conditions: ['dark'] })).toBe(true);
  });

  it('rejects a malformed one', () => {
    expect(isTokenState({ ...state(), mod: 'lots' })).toBe(false);
    expect(isTokenState({ ...state(), conditions: [4] })).toBe(false);
  });
});

/**
 * The counterpart to `situationalMods`. These numbers were recorded from the
 * start with nothing to reach; the targeting table is what they now reach.
 */
describe("a target's own conditions, which change the attacker's roll", () => {
  it('gives the attacker Vulnerable\'s +2', () => {
    const vulnerable = state({ conditions: ['vulnerable'] });
    expect(targetTotal(vulnerable)).toBe(2);
    expect(targetMods(vulnerable).map((m) => m.label)).toEqual(['Vulnerable']);
  });

  it('keeps target-side conditions out of the target\'s own rolls', () => {
    const vulnerable = state({ conditions: ['vulnerable'] });
    expect(situationalTotal(vulnerable)).toBe(0);
  });

  it('keeps the attacker\'s own conditions out of the target-side total', () => {
    expect(targetTotal(state({ conditions: ['dark'] }))).toBe(0);
  });

  it('is nothing for a target in no condition at all', () => {
    expect(targetTotal(state())).toBe(0);
    expect(targetPills(state())).toEqual([]);
  });

  /**
   * Prone and Stunned are drawn but carry 0 — Prone is direction-dependent and
   * Stunned is noted as counting for Vulnerable without the number. Both pend
   * the book, so the pill appears and the arithmetic does not.
   */
  it('shows a pill for a condition it does not apply', () => {
    const prone = state({ conditions: ['prone'] });
    expect(targetPills(prone).map((p) => p.letter)).toEqual(['P']);
    expect(targetTotal(prone)).toBe(0);
  });

  it('gives one letter per condition, and they do not collide', () => {
    const letters = SITUATIONS.filter((s) => s.affects === 'others').map((s) =>
      s.label.charAt(0).toUpperCase(),
    );
    expect(new Set(letters).size).toBe(letters.length);
  });

  it('stacks conditions from different groups', () => {
    const both = toggleCondition(state({ conditions: ['prone'] }), 'vulnerable');
    expect(targetPills(both).map((p) => p.letter).sort()).toEqual(['P', 'V']);
    expect(targetTotal(both)).toBe(2);
  });
});

/** §27 (ggg), checked against the book: what a target's state gives the attacker. */
describe('a target that counts as Vulnerable', () => {
  it('is one +2, however many of the conditions are set', () => {
    expect(targetTotal(state({ conditions: ['stunned'] }))).toBe(2);
    expect(targetTotal(state({ conditions: ['entangled'] }))).toBe(2);
    expect(targetTotal(state({ conditions: ['bound'] }))).toBe(2);
    expect(targetTotal(state({ conditions: ['stunned', 'vulnerable'] }))).toBe(2);
    expect(targetTotal(state({ conditions: ['bound', 'vulnerable', 'stunned'] }))).toBe(2);
  });

  it('says why when it is not Vulnerable itself', () => {
    expect(targetMods(state({ conditions: ['stunned'] }))[0]?.label).toBe('Vulnerable (Stunned)');
  });
});

/** p160: −4 to ranged attacks from 3″ or more, not with cover; Parry −2 in melee. */
describe('a prone target', () => {
  const prone = state({ conditions: ['prone'] });

  it('is easier to stab', () => {
    expect(targetTotal(prone, { melee: true, cells: 1 })).toBe(2);
  });

  it('is harder to shoot from 3″ or more, and only then', () => {
    expect(targetTotal(prone, { melee: false, cells: 3 })).toBe(-4);
    expect(targetTotal(prone, { melee: false, cells: 2.9 })).toBe(0);
  });

  /** "This does not stack with Cover" — it is Medium Cover, so cover past Medium wins. */
  it('does not stack with cover', () => {
    expect(targetTotal(prone, { melee: false, cells: 6, cover: -2 })).toBe(-2);
    expect(targetTotal(prone, { melee: false, cells: 6, cover: -4 })).toBe(0);
    expect(targetTotal(prone, { melee: false, cells: 6, cover: -6 })).toBe(0);
  });

  it('is left alone when the distance was not measured', () => {
    expect(targetTotal(prone, { melee: false })).toBe(0);
  });

  it('shows on its pill what it came to', () => {
    expect(targetPills(prone, { melee: true, cells: 1 })[0]?.value).toBe(2);
    expect(targetPills(prone, { melee: false, cells: 1 })[0]?.value).toBe(0);
  });
});
