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
});
