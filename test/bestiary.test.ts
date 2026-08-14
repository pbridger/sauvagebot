import { describe, expect, it } from 'vitest';
import {
  BESTIARY,
  BESTIARY_CATEGORIES,
  creatureSheet,
  findCreature,
  outdatedSkills,
  searchCreatures,
} from '../src/rules/bestiary.js';
import { parseStatBlock } from '../src/rules/statBlock.js';

describe('the creature presets', () => {
  it('has a usable number of creatures, in categories', () => {
    expect(BESTIARY.length).toBeGreaterThan(200);
    expect(BESTIARY_CATEGORIES).toContain('Animals');
    expect(BESTIARY_CATEGORIES).toContain('Bestiary');
  });

  it('carries a stat block for every one', () => {
    for (const creature of BESTIARY) {
      expect(creature.block, creature.name).toContain('Attributes:');
      expect(creature.name, creature.name).not.toContain('___');
    }
  });

  /**
   * The presets are read by the same parser as anything pasted by hand, so this
   * is really a test of that parser against 200-odd real blocks written by
   * someone else — far more variety than the three in the rulebook.
   */
  it('parses every single one', () => {
    const broken: string[] = [];
    for (const creature of BESTIARY) {
      try {
        const sheet = creatureSheet(creature);
        if (!Object.keys(sheet.attributes).length) broken.push(`${creature.name}: no attributes`);
        if (sheet.toughness === undefined) broken.push(`${creature.name}: no toughness`);
      } catch (error) {
        broken.push(`${creature.name}: ${(error as Error).message}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('reads a creature the way the document wrote it', () => {
    const sheet = creatureSheet(findCreature('Antelope')!);
    expect(sheet.name).toBe('Antelope');
    expect(sheet.wildCard).toBe(false);
    expect(sheet.attributes.agility).toEqual({ die: 10 });
    expect(sheet.pace).toBe(10);
    expect(sheet.parry).toBe(4);
    expect(sheet.toughness).toBe(6);
    expect(sheet.powers?.map((p) => p.name)).toContain('Fleet Footed');
  });

  it('carries the description across', () => {
    const antelope = findCreature('Antelope');
    expect(antelope?.description).toBeTruthy();
    expect(creatureSheet(antelope!).description).toBe(antelope!.description);
  });

  it('brings them in as Extras, so a gang shares one sheet', () => {
    const extras = BESTIARY.filter((c) => !creatureSheet(c).wildCard);
    expect(extras.length).toBeGreaterThan(BESTIARY.length * 0.8);
  });

  /**
   * The collection predates SWADE, and this is where that shows. Worth a test
   * so the extension can warn rather than silently hand a Marshal a character
   * with a skill the game no longer has.
   */
  it('knows which skills are from an older edition', () => {
    const antelope = creatureSheet(findCreature('Antelope')!);
    expect(antelope.skills['Guts']).toBeDefined();
    expect(outdatedSkills(antelope)).toEqual(['Guts']);
  });

  it('reports nothing outdated for a modern sheet', () => {
    const sheet = parseStatBlock('MOOK\nAttributes: Vigor d6\nSkills: Fighting d6, Notice d6');
    expect(outdatedSkills(sheet)).toEqual([]);
  });
});

describe('searching', () => {
  it('prefers a prefix match', () => {
    expect(searchCreatures('ante')[0]?.name).toBe('Antelope');
  });

  it('falls back to a contains match', () => {
    expect(searchCreatures('beetle').length).toBeGreaterThan(1);
  });

  it('returns a starting list for an empty query', () => {
    expect(searchCreatures('').length).toBeGreaterThan(0);
  });

  it('finds by exact name, case-insensitively', () => {
    expect(findCreature('antelope')?.name).toBe('Antelope');
    expect(findCreature('not a creature')).toBeUndefined();
  });
});
