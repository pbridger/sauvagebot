import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JavaRandom } from '../src/dice/javaRandom.js';
import { parseArchetypeCards } from '../src/rules/importArchetypeCard.js';
import { rollAttribute, rollSkill, rollTrait, traitExpression } from '../src/rules/traitRoll.js';

const reggie = parseArchetypeCards(
  readFileSync(fileURLToPath(new URL('./fixtures/reggie-kane.html', import.meta.url)), 'utf8'),
)[0]!;

describe('trait expressions', () => {
  it('uses the bot’s own syntax, so players see familiar output', () => {
    expect(traitExpression({ die: 8, wildCard: true })).toBe('s8');
    expect(traitExpression({ die: 8, mod: 1, wildCard: true })).toBe('s8+1');
    expect(traitExpression({ die: 4, mod: -2, wildCard: true })).toBe('s4-2');
    expect(traitExpression({ die: 6, mod: 0, wildCard: false })).toBe('e6');
  });
});

describe('rolling off a sheet', () => {
  it('rolls a trained skill at its die', () => {
    const { expression } = rollSkill(reggie, 'Shooting', 0, new JavaRandom(1));
    expect(expression).toBe('s8');
  });

  it('rolls an untrained skill at d4−2', () => {
    expect(rollSkill(reggie, 'Piloting', 0, new JavaRandom(1)).expression).toBe('s4-2');
  });

  it('folds a situational modifier in with the trait modifier', () => {
    expect(rollSkill(reggie, 'Shooting', -2, new JavaRandom(1)).expression).toBe('s8-2');
    expect(rollAttribute(reggie, 'vigor', 1, new JavaRandom(1)).expression).toBe('s6+1');
  });

  it('gives an Extra no Wild Die', () => {
    const extra = { ...reggie, wildCard: false };
    expect(rollSkill(extra, 'Fighting', 0, new JavaRandom(1)).expression).toBe('e8');
  });

  it('produces the engine’s explanation, showing both dice for a Wild Card', () => {
    const { explained } = rollTrait({ die: 8, wildCard: true }, new JavaRandom(42));
    // e.g. "s8: [5; w3] = **5**" — the shape the bot has always produced.
    expect(explained).toMatch(/^s8:/);
    expect(explained).toMatch(/w\d/);
    expect(explained).toMatch(/\*\*-?\d+\*\*/);
  });

  it('is deterministic for a seed, exactly as the bot is', () => {
    const a = rollTrait({ die: 8, mod: 1, wildCard: true }, new JavaRandom(7)).explained;
    const b = rollTrait({ die: 8, mod: 1, wildCard: true }, new JavaRandom(7)).explained;
    expect(a).toBe(b);
  });
});
