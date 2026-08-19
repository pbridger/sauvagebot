import { describe, expect, it } from 'vitest';
import { parseGear } from '../src/rules/gear.js';
import { sourceOf } from '../src/rules/sheet.js';
import { woundLimit } from '../src/rules/status.js';
import {
  BESTIARY,
  BESTIARY_CATEGORIES,
  COFFIN_ROCK,
  SAVAGE_FREE_BESTIARY,
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

  it('brings most of them in as Extras, so a gang shares one sheet', () => {
    const extras = BESTIARY.filter((c) => !creatureSheet(c).wildCard);
    expect(extras.length).toBeGreaterThan(BESTIARY.length * 0.6);
  });

  /**
   * The collection marked its Wild Cards with a ★ on the end of the name, which
   * made the name wrong everywhere it was displayed. Moving it to a field fixed
   * that — but the glyph was load-bearing: `parseStatBlock` decides Wild Card
   * from the words "wild card" in the block, and most of those blocks never say
   * them. Stripping the star without capturing it would have demoted them all to
   * Extras, silently.
   */
  describe('the Wild Card star, now a field', () => {
    it('leaves no stars in any name', () => {
      expect(BESTIARY.filter((c) => /★/.test(c.name))).toEqual([]);
    });

    /**
     * Scoped to the fan bestiary: this figure is about *that* collection's ★
     * migration. Coffin Rock joined the list on 2026-08-18 and brought its own
     * Wild Cards, which have nothing to do with the star and would otherwise
     * make this number drift every time a book is added.
     */
    it('still knows its Wild Cards', () => {
      const wildCards = BESTIARY.filter(
        (c) => c.source === SAVAGE_FREE_BESTIARY && creatureSheet(c).wildCard,
      );
      expect(wildCards.length).toBe(72);
    });

    it('makes a starred creature a Wild Card even when its block never says so', () => {
      const eye = findCreature('Crawling Eye');
      expect(eye).toBeDefined();
      expect(/wild card/i.test(eye!.block)).toBe(false);
      expect(creatureSheet(eye!).wildCard).toBe(true);
    });

    it('finds a formerly starred creature by its clean name', () => {
      expect(findCreature('Crawling Eye')?.name).toBe('Crawling Eye');
    });

    it('still reads Wild Card out of a block that does say it', () => {
      const fromText = BESTIARY.filter((c) => !c.wildCard && /wild card/i.test(c.block));
      expect(fromText.length).toBe(3);
      for (const creature of fromText) expect(creatureSheet(creature).wildCard).toBe(true);
    });
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

/**
 * Coffin Rock — the adventure being run, added 2026-08-18 as the second
 * collection. Transcribed by hand from the PDF, so these tests are as much
 * about the transcription as about the code.
 */
describe('the Coffin Rock collection', () => {
  const creatures = BESTIARY.filter((c) => c.source === COFFIN_ROCK);

  it('is loaded alongside the fan bestiary, and every creature says which book it is from', () => {
    expect(creatures.length).toBeGreaterThan(30);
    expect(BESTIARY.every((c) => c.source !== undefined)).toBe(true);
  });

  /**
   * The transcription check that matters: a block that loses an attribute loses
   * a derived stat with it, and nobody would notice until the fight.
   */
  it('gives every creature five attributes and both derived stats', () => {
    for (const creature of creatures) {
      const sheet = creatureSheet(creature);
      expect(Object.keys(sheet.attributes), creature.name).toHaveLength(5);
      expect(sheet.parry, creature.name).toBeDefined();
      expect(sheet.toughness, creature.name).toBeDefined();
    }
  });

  /** Every weapon parses — the thing that was losing all of them before. */
  it('arms everyone who carries a weapon', () => {
    const bryce = creatureSheet(findCreature('Marshal Bryce', COFFIN_ROCK)!);
    const [dragoon] = parseGear(bryce.gear).weapons;
    expect(dragoon).toMatchObject({ range: '12/24/48', damage: '2d6+1', ap: 1 });
  });

  /** A natural weapon reaches the attack list by being written on the gear line. */
  it('gives the Blood Man its two attacks', () => {
    const blood = creatureSheet(findCreature('Blood Man', COFFIN_ROCK)!);
    const weapons = parseGear(blood.gear).weapons;
    expect(weapons.map((w) => w.name)).toEqual(['Bloody Mud Blast', 'Searing Touch']);
    expect(weapons[0]).toMatchObject({ range: '2/4/8', damage: '2d6' });
  });

  /**
   * The Henchman: *"Blood Men get a Wild Die as though they were Wild Cards"* —
   * a wild die without a Wild Card's wound track. This is the case
   * `Sheet.maxWounds` exists for.
   */
  it('makes the Blood Men Henchmen rather than Wild Cards', () => {
    const blood = creatureSheet(findCreature('Blood Man', COFFIN_ROCK)!);
    expect(blood.wildCard).toBe(true);
    expect(woundLimit(blood)).toBe(0);
    // A genuine Wild Card from the same book is unaffected.
    expect(woundLimit(creatureSheet(findCreature('Reverend Cheval', COFFIN_ROCK)!))).toBe(3);
  });

  /** Charisma, special abilities and arcane powers all survive on one creature. */
  it('keeps everything on Reverend Cheval', () => {
    const cheval = creatureSheet(findCreature('Reverend Cheval', COFFIN_ROCK)!);
    expect(cheval.charisma).toBe(2);
    expect(cheval.powerNotes).toContain('20 PP');
    expect(cheval.powers?.map((p) => p.name)).toEqual([
      'Ahpuch Blessing',
      'Hardy',
      'Manitou Ridden',
    ]);
    expect(cheval.edges.map((e) => e.name)).toContain('Improved Arcane Resistance');
  });

  /** It is Deadlands Reloaded, and the sheet records that rather than guessing later. */
  it('stamps its creatures as Reloaded', () => {
    expect(sourceOf(creatureSheet(creatures[0]!).source)?.edition).toBe('reloaded');
  });

  /**
   * Both books have Deputies and Cultists, so a lookup by name alone could add
   * the wrong one. The picker passes the source through with the click.
   */
  it('searches within one book when asked', () => {
    const all = searchCreatures('', 500).length;
    const justCoffinRock = searchCreatures('', 500, COFFIN_ROCK).length;
    expect(justCoffinRock).toBe(creatures.length);
    expect(justCoffinRock).toBeLessThan(all);
    expect(findCreature('Blood Man', SAVAGE_FREE_BESTIARY)).toBeUndefined();
  });
});

/**
 * Coffin Rock marks Wild Cards with a joker *image* beside the heading, which no
 * amount of text extraction can see. The eleven were read off rendered pages one
 * at a time — and that mattered: guessing from the names got five wrong in both
 * directions.
 */
describe('Coffin Rock’s jokers', () => {
  const wc = (name: string) => creatureSheet(findCreature(name, COFFIN_ROCK)!).wildCard;

  it('marks the eleven the book marks', () => {
    const marked = BESTIARY.filter((c) => c.source === COFFIN_ROCK && c.wildCard).map((c) => c.name);
    // Eleven jokers, plus the Blood Men — who carry no joker and should not.
    expect(marked).toHaveLength(12);
    for (const name of ['Marshal Bryce', 'Reverend Cheval', 'Shelly Pearl', 'Child Wraith']) {
      expect(wc(name), name).toBe(true);
    }
  });

  /** Named, unique, and still an Extra. Every one of these was guessed wrong first. */
  it('leaves the named Extras as Extras', () => {
    for (const name of [
      'Dorothy Testeverde’s Ghost',
      'Deacon Robert Plume',
      'Jonah Thurgood',
      'Laughs At Darkness',
      'Summoned Demon',
    ]) {
      expect(wc(name), name).toBe(false);
    }
  });

  /** And a nameless group that is a Wild Card, which no naming heuristic would find. */
  it('makes the Ghost Miners Wild Cards', () => {
    expect(wc('Ghost Miner')).toBe(true);
  });
});
