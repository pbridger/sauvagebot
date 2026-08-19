import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_CARDS,
  ArchetypeCardError,
  parseArchetypeCards,
} from '../src/rules/importArchetypeCard.js';
import { BESTIARY, SAVAGE_FREE_BESTIARY, creatureSheet } from '../src/rules/bestiary.js';
import { emptySheet, sheetFromJson, sheetToJson, sourceOf, traitDie, type Sheet } from '../src/rules/sheet.js';

const html = readFileSync(
  fileURLToPath(new URL('./fixtures/archetype-card.html', import.meta.url)),
  'utf8',
);
const [lucky, silas] = parseArchetypeCards(html);

describe('parsing an archetype card', () => {
  it('finds every card in the file', () => {
    expect(parseArchetypeCards(html)).toHaveLength(2);
  });

  it('reads the header, decoding entities', () => {
    expect(lucky!.name).toBe('MADAME "LUCKY" DELACROIX');
    expect(lucky!.rank).toBe('NOVICE');
    expect(lucky!.quote).toBe(
      'The cards never lie — they just don’t always tell you everything.',
    );
    expect(lucky!.id).toBe('madame-lucky-delacroix');
  });

  it('reads attributes from the selected option, with modifiers', () => {
    expect(lucky!.attributes).toEqual({
      agility: { die: 6 },
      smarts: { die: 10, mod: 1 },
      spirit: { die: 8 },
      strength: { die: 4 },
      vigor: { die: 6 },
    });
  });

  it('reads derived stats out of the same table as the attributes', () => {
    expect(lucky!.pace).toBe(6);
    expect(lucky!.parry).toBe(5);
  });

  it('splits "6(5)" into toughness and armour, keeping the original', () => {
    expect(lucky!.toughness).toBe(6);
    expect(lucky!.armor).toBe(1);
    expect(lucky!.toughnessRaw).toBe('6(5)');
    // A card with no armour has no bracket and no armour value.
    expect(silas!.toughness).toBe(7);
    expect(silas!.armor).toBeUndefined();
  });

  it('omits untrained skills rather than storing a zero', () => {
    expect(lucky!.skills).toEqual({
      Gambling: { die: 10 },
      Notice: { die: 6 },
      Occult: { die: 8 },
    });
    expect(lucky!.skills.Academics).toBeUndefined();
    expect(lucky!.skills.Shooting).toBeUndefined();
  });

  it('rolls an untrained skill at d4-2, as SWADE does', () => {
    expect(traitDie(lucky!, 'Gambling')).toEqual({ die: 10, mod: 0 });
    expect(traitDie(lucky!, 'Shooting')).toEqual({ die: 4, mod: -2 });
  });

  it('splits edges and hindrances into name and rules text', () => {
    expect(lucky!.hindrances).toEqual([
      { name: 'HABIT (MINOR)', text: 'Never turns down a hand of poker.' },
      { name: 'OUTSIDER (MINOR)', text: 'Folks hereabouts don’t trust a fortune teller.' },
    ]);
    expect(lucky!.edges[0]).toEqual({
      name: 'ARCANE BACKGROUND (HUCKSTER)',
      text: 'You deal with the Devil for your hexes.',
    });
  });

  it('handles an entry with a name and no rules text', () => {
    expect(silas!.edges).toEqual([{ name: 'ARCANE BACKGROUND (BLESSED)' }]);
  });

  it('keeps gear and advances as the free text they are on the card', () => {
    expect(lucky!.gear).toBe('Derringer (Range 5/10/20, damage 2d6), marked deck, tarot cards, $40.');
    expect(lucky!.advances).toBe('Occult d8, Luck.');
    expect(silas!.gear).toContain('.12 shells (×20)');
    expect(silas!.advances).toBeUndefined();
  });

  it('rejects a file with no cards rather than returning nothing', () => {
    expect(() => parseArchetypeCards('<html><body>nope</body></html>')).toThrow(
      ArchetypeCardError,
    );
  });

  it('rejects a card with no name rather than importing a blank character', () => {
    const broken = html.replace(/<h2 class="character-name"[\s\S]*?<\/h2>/g, '');
    expect(() => parseArchetypeCards(broken)).toThrow(/no character name/);
  });
});

/**
 * The party's real card, not a stand-in. This is the test that would actually
 * catch a template change, and it pins the budget figures the storage design
 * rests on rather than leaving them in a comment.
 */
describe('the real Reggie Kane card', () => {
  const reggie = parseArchetypeCards(
    readFileSync(fileURLToPath(new URL('./fixtures/reggie-kane.html', import.meta.url)), 'utf8'),
  )[0]!;

  it('reads the whole card', () => {
    expect(reggie.name).toBe('REGINALD "REGGIE" KANE');
    expect(reggie.rank).toBe('SEASONED');
    expect(reggie.attributes).toEqual({
      agility: { die: 8 },
      smarts: { die: 8 },
      spirit: { die: 6 },
      strength: { die: 4 },
      vigor: { die: 6 },
    });
    expect(reggie.pace).toBe(6);
    expect(reggie.parry).toBe(6);
    expect(Object.keys(reggie.skills)).toHaveLength(11);
    expect(reggie.skills.Shooting).toEqual({ die: 8 });
    expect(reggie.skills.Academics).toBeUndefined();
  });

  it('reads "7(5)" as Toughness 7 with 2 points of armour', () => {
    // Confirmed with Damian, and corroborated by the gear line's "armored vest (+2)".
    expect(reggie.toughness).toBe(7);
    expect(reggie.armor).toBe(2);
    expect(reggie.gear).toContain('armored vest (+2');
  });

  it('reads all five edges and both hindrances with their rules text', () => {
    expect(reggie.edges.map((e) => e.name)).toEqual([
      'AGENT',
      'AGENCY PROMOTION',
      'GUTS',
      'INVESTIGATOR',
      'ROCK AND ROLL!',
    ]);
    expect(reggie.hindrances.map((h) => h.name)).toEqual(['CURIOUS (MAJOR)', 'DRIVEN (MAJOR)']);
    expect(reggie.edges.every((e) => e.text)).toBe(true);
  });

  it('is 75% of the room budget with prose, 28% without — the split, in numbers', () => {
    const full = sheetToJson(reggie).length;
    const lean = sheetToJson({
      ...reggie,
      edges: reggie.edges.map((e) => ({ name: e.name })),
      hindrances: reggie.hindrances.map((h) => ({ name: h.name })),
      gear: undefined,
      advances: undefined,
      quote: undefined,
    }).length;
    expect(full * 6 / 15_000).toBeGreaterThan(0.7);
    expect(lean * 6 / 15_000).toBeLessThan(0.32);
  });
});

describe('the storage budget', () => {
  /**
   * Why the §1b lifecycle split exists, in numbers.
   *
   * Measured out-of-band on the party's real card (`Reggie Kane.html`, not in the
   * repo): a fully imported sheet is 1,877 chars, so six PCs would be 11,262 — 75%
   * of the room's ~15 kB. Stripped to the build it is 711, and six is 4,266 — 28%.
   * The difference is almost entirely the rules text of edges and hindrances.
   *
   * The fixture characters have shorter rules text than a real card, so this test
   * does not try to reproduce that ratio from them. It pins the two claims the
   * design actually rests on, using rules text padded to real-card length.
   */
  const strip = (sheet: typeof lucky) => ({
    ...sheet!,
    edges: sheet!.edges.map((e) => ({ name: e.name })),
    hindrances: sheet!.hindrances.map((h) => ({ name: h.name })),
  });

  it('fits six lean sheets in the room budget with room to spare', () => {
    expect(sheetToJson(strip(lucky)).length * 6).toBeLessThan(15_000 * 0.4);
  });

  it('would not comfortably fit six sheets that keep their rules text', () => {
    // Built to the profile of the real Reggie Kane card rather than the fixture's:
    // 5 edges and 2 hindrances at ~110 chars of rules text each, 380 chars of gear.
    const verbose = {
      ...lucky!,
      edges: Array.from({ length: 5 }, (_, i) => ({ name: `EDGE ${i}`, text: 'x'.repeat(110) })),
      hindrances: Array.from({ length: 2 }, (_, i) => ({
        name: `HINDRANCE ${i}`,
        text: 'x'.repeat(110),
      })),
      gear: 'x'.repeat(380),
    };
    expect(sheetToJson(verbose).length * 6).toBeGreaterThan(15_000 * 0.6);
  });
});

describe('JSON round trip', () => {
  it('survives export and re-import unchanged', () => {
    expect(sheetFromJson(sheetToJson(lucky!))).toEqual(lucky);
  });

  it('rejects something that is not a sheet', () => {
    expect(() => sheetFromJson('{"foo":1}')).toThrow(/not a character sheet/);
  });
});

/**
 * The whole party, transcribed from the PDFs Damian supplied.
 *
 * Those PDFs carry no recoverable text — no /ToUnicode, no embedded font, and a
 * /Differences array of bare numeric glyph names — so they were rendered, read,
 * and rebuilt in this template. These tests are what stops a transcription
 * error going unnoticed, and they pin the three ways the party's real cards
 * broke the importer's original assumptions.
 */
describe('the rest of the party', () => {
  const load = (file: string) =>
    parseArchetypeCards(
      readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8'),
    )[0]!;

  const doc = load('doc-amos-mochrane.html');
  const jed = load('father-jedidiah-jed-tuffin.html');
  const paige = load('paige-yellah.html');
  const ed = load('sir-ed-fiddlebottom-iii.html');

  it('reads all four', () => {
    expect([doc, jed, paige, ed].map((s) => s.name)).toEqual([
      'DOC AMOS MOCHRANE',
      'FATHER JEDIDIAH "JED" TUFFIN',
      'PAIGE YELLAH',
      'SIR ED FIDDLEBOTTOM III',
    ]);
  });

  it('keeps an arcane skill that is not on the printed list', () => {
    // Faith is not one of the 26 the card prints; the old fixed list dropped it.
    expect(jed.skills.Faith).toEqual({ die: 8 });
  });

  it('keeps a skill with a parenthetical specialisation', () => {
    expect(paige.skills['Trade (Journalism)']).toEqual({ die: 6 });
    expect(ed.skills['Language (Your Choice)']).toEqual({ die: 4 });
    // …and does not invent the unspecialised version alongside it.
    expect(paige.skills.Trade).toBeUndefined();
  });

  it('reads negative attribute modifiers', () => {
    // Sir Ed is Elderly: −1 to Agility, Strength and Vigor.
    expect(ed.attributes.agility).toEqual({ die: 6, mod: -1 });
    expect(ed.attributes.vigor).toEqual({ die: 8, mod: -1 });
    expect(ed.attributes.smarts).toEqual({ die: 8 });
  });

  it('reads a POWERS block, which only some characters have', () => {
    expect(jed.powers?.map((p) => p.name)).toEqual([
      'POWERS',
      'POWER POINTS',
      'BACKLASH',
      "SINNIN'",
    ]);
    expect(jed.powers?.[1]?.text).toBe('20');
    expect(doc.powers).toBeUndefined();
  });

  it('reads derived stats, including a Toughness with no armour', () => {
    expect([doc.pace, doc.parry, doc.toughness]).toEqual([6, 5, 5]);
    expect(ed.armor).toBeUndefined();
  });

  it('gets the gear, including weapons the parser must cope with', () => {
    // Paige's LeMat is two weapons in one bracket; it must not be lost.
    expect(paige.gear).toContain('LeMat Revolver');
    expect(doc.gear).toContain("Doctor's bag");
  });

  it('fits the whole party in the room budget', () => {
    const lean = [doc, jed, paige, ed].map(
      (s) =>
        sheetToJson({
          ...s,
          edges: s.edges.map((e) => ({ name: e.name })),
          hindrances: s.hindrances.map((h) => ({ name: h.name })),
        }).length,
    );
    expect(lean.reduce((a, b) => a + b, 0)).toBeLessThan(15_000 * 0.5);
  });
});

/**
 * The fields added in the 2026-08-18 mechanics pass. All optional, so an
 * existing room's sheets — which have none of them — keep working untouched.
 * That is the same absent-field-defaults rule the `pc` migration was held to.
 */
describe('the new optional fields', () => {
  const base = emptySheet('blood-man', 'Blood Man');

  it('survives a round trip', () => {
    const sheet: Sheet = {
      ...base,
      charisma: -6,
      maxWounds: 0,
      powerNotes: 'Armor, bolt, dispel; 20 PP',
      source: 'coffin-rock',
    };
    expect(sheetFromJson(sheetToJson(sheet))).toEqual(sheet);
  });

  /** A sheet written before any of this still reads, and gains nothing it did not have. */
  it('leaves an older sheet alone', () => {
    const old = sheetFromJson('{"id":"reggie","name":"Reggie","pc":true,"wildCard":true}');
    expect(old.charisma).toBeUndefined();
    expect(old.maxWounds).toBeUndefined();
    expect(old.source).toBeUndefined();
    expect(old.pc).toBe(true);
  });

  it('stamps the party cards as SWADE', () => {
    expect(lucky!.source).toBe(ARCHETYPE_CARDS);
    expect(sourceOf(lucky!.source)?.edition).toBe('swade');
  });

  /** The bestiary is a different edition, and now says so on every creature. */
  it('stamps a bestiary creature as Reloaded', () => {
    expect(creatureSheet(BESTIARY[0]!).source).toBe(SAVAGE_FREE_BESTIARY);
    expect(sourceOf(SAVAGE_FREE_BESTIARY)?.edition).toBe('reloaded');
  });

  /** A source this build has never heard of still shows, rather than vanishing. */
  it('does not lose an unknown source', () => {
    expect(sourceOf('some-later-book')).toEqual({
      id: 'some-later-book',
      name: 'some-later-book',
      edition: 'unknown',
    });
  });
});
