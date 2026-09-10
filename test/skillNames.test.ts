import { describe, expect, it } from 'vitest';
import { baseSkillOf, emptySheet, skillNames, type Sheet } from '../src/rules/sheet.js';

const withSkills = (skills: Sheet['skills']): Sheet => ({ ...emptySheet('x', 'X'), skills });

describe('what a skill is a specialisation of', () => {
  it('reads the base out of the parentheses', () => {
    expect(baseSkillOf('Trade (Journalism)')).toBe('Trade');
    expect(baseSkillOf('Language (Spanish)')).toBe('Language');
  });

  it('leaves a plain name alone', () => {
    expect(baseSkillOf('Fighting')).toBe('Fighting');
  });

  it('is structural, so homebrew groups without being on a list', () => {
    expect(baseSkillOf('Language (Sioux)')).toBe('Language');
  });
});

describe('the skills a sheet shows', () => {
  /**
   * Damian, 2026-09-08: *"there is no point in having a blank one with no specifics
   * or specialism… characters have a blank 'Trade' skill. Not such a problem unless
   * you 'show all' on skills."*
   */
  it('drops the bare name once a specialisation exists', () => {
    const names = skillNames(withSkills({ 'Trade (Journalism)': { die: 6 } }));
    expect(names).toContain('Trade (Journalism)');
    expect(names).not.toContain('Trade');
  });

  it('keeps the bare name when the character actually has a die in it', () => {
    // Hiding a trait somebody set would be losing data in order to tidy a list.
    const names = skillNames(withSkills({ Trade: { die: 4 }, 'Trade (Journalism)': { die: 6 } }));
    expect(names).toContain('Trade');
    expect(names).toContain('Trade (Journalism)');
  });

  it('keeps the bare name when there is no specialisation', () => {
    expect(skillNames(withSkills({}))).toContain('Trade');
    expect(skillNames(withSkills({}))).toContain('Language');
  });

  it('puts a specialisation beside its own base, not at the end', () => {
    const names = skillNames(withSkills({ 'Language (Spanish)': { die: 8 } }));
    expect(names.indexOf('Language (Spanish)')).toBe(names.indexOf('Notice') - 1);
  });

  it('does not do this to skills the book does not specialise', () => {
    // Only Language and Trade are written this way in the book; an arcane skill's
    // parenthetical is a different thing entirely.
    const names = skillNames(withSkills({ 'Occult (Hexes)': { die: 6 } }));
    expect(names).toContain('Occult');
    expect(names).toContain('Occult (Hexes)');
  });

  it('still lists a skill that is on no list at all', () => {
    const names = skillNames(withSkills({ Faith: { die: 8 }, 'Spellcasting (Huckster)': { die: 6 } }));
    expect(names).toContain('Faith');
    expect(names).toContain('Spellcasting (Huckster)');
  });

  it('lists every printed skill exactly once on an empty sheet', () => {
    const names = skillNames(withSkills({}));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Fighting');
  });

  /**
   * Damian, 2026-09-09: *"it would be good if skills could be sorted in alphabetical
   * order; currently added skills (such as 'Faith' on a Blessed) are at the bottom."*
   */
  describe('the order', () => {
    it('files a skill the book does not print in its alphabetical place', () => {
      const names = skillNames(withSkills({ Faith: { die: 8 } }));
      expect(names.indexOf('Faith')).toBe(names.indexOf('Fighting') - 1);
      expect(names.indexOf('Faith')).toBeGreaterThan(names.indexOf('Driving'));
    });

    it('is alphabetical throughout, base names and additions alike', () => {
      const names = skillNames(
        withSkills({ Faith: { die: 8 }, Weirdness: { die: 4 }, Alchemy: { die: 6 } }),
      );
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
      expect(names[0]).toBe('Academics');
      expect(names.at(-1)).toBe('Weirdness');
    });

    it('keeps a specialisation with its base rather than sorting it away', () => {
      // "Trade (Journalism)" must not file under J, and must not drift from Trade.
      const names = skillNames(withSkills({ Trade: { die: 4 }, 'Trade (Journalism)': { die: 6 } }));
      expect(names.indexOf('Trade (Journalism)')).toBe(names.indexOf('Trade') + 1);
    });

    it('files a lower-case homebrew where a reader would look for it', () => {
      const names = skillNames(withSkills({ 'gunsmithing': { die: 6 } }));
      expect(names.indexOf('gunsmithing')).toBe(names.indexOf('Gambling') + 1);
    });
  });
});
