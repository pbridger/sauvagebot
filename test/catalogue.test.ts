import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EDGES,
  HINDRANCES,
  findEdge,
  findEntry,
  findHindrance,
  normaliseName,
  suggest,
} from '../src/rules/catalogue.js';
import { parseArchetypeCards } from '../src/rules/importArchetypeCard.js';
import { parseGear } from '../src/rules/gear.js';
import {
  GEAR,
  describeGear,
  findGear,
  suggestGear,
} from '../src/rules/gearCatalogue.js';

describe('the extracted catalogue', () => {
  it('has the whole book in it', () => {
    expect(EDGES.length).toBeGreaterThan(200);
    expect(HINDRANCES.length).toBeGreaterThan(35);
  });

  it('gives every entry rules text and every edge its requirements', () => {
    for (const edge of EDGES) {
      expect(edge.text.length, edge.name).toBeGreaterThan(40);
      expect(edge.requirements, edge.name).toBeDefined();
    }
    for (const hindrance of HINDRANCES) {
      expect(hindrance.text.length, hindrance.name).toBeGreaterThan(40);
      expect(hindrance.severity, hindrance.name).toMatch(/Minor|Major/);
    }
  });

  it('did not clip the first character off a line', () => {
    // The column crop used to eat them, giving "otals" for "totals". These are
    // the words it mangled, and a few more that would show the same fault.
    const all = [...EDGES, ...HINDRANCES].map((e) => e.text).join(' ');
    for (const broken of [' otals ', ' nch ', ' hreat ', ' heir ', ' oll ']) {
      expect(all, broken).not.toContain(broken);
    }
  });

  it('did not swallow a heading into the previous entry', () => {
    // "e    LEVEL HEADED" was a real failure when the right-hand crop caught the
    // last character of the left column.
    expect(findEdge('Level Headed')).toBeDefined();
    expect(findEdge('LEVEL HEADED (IMP)')).toBeDefined();
  });
});

describe('matching a name from a card', () => {
  it('ignores case, hyphens and spacing', () => {
    expect(findEdge('level-headed')?.name).toBe('LEVEL HEADED');
    expect(findEdge('Level Headed')?.name).toBe('LEVEL HEADED');
    expect(findEdge('LEVELHEADED')?.name).toBeUndefined();
    expect(normaliseName('Rock and Roll!')).toBe('ROCK AND ROLL');
  });

  it('strips the severity a card puts in a hindrance name', () => {
    expect(findHindrance('HEROIC (MAJOR)')?.name).toBe('HEROIC');
    expect(findHindrance('LOYAL (MINOR)')?.severity).toMatch(/Minor/);
  });

  it('falls back to the base entry for a bracketed variant', () => {
    // The book has ARCANE BACKGROUND; the cards name the flavour.
    expect(findEdge('ARCANE BACKGROUND (BLESSED)')?.name).toMatch(/ARCANE BACKGROUND/);
  });

  it('finds either kind when the sort is not known', () => {
    expect(findEntry('GUTS')).toBeDefined();
    expect(findEntry('HESITANT (MINOR)')).toBeDefined();
    expect(findEntry('not a real edge')).toBeUndefined();
  });
});

describe('autocomplete', () => {
  it('prefers entries that start with what was typed', () => {
    const found = suggest('lev', 'edges');
    expect(found[0]?.name).toMatch(/^LEVEL HEADED/);
  });

  it('falls back to a contains match', () => {
    expect(suggest('headed', 'edges').some((e) => e.name.includes('LEVEL HEADED'))).toBe(true);
  });

  it('returns a starting list for an empty query', () => {
    expect(suggest('', 'hindrances').length).toBeGreaterThan(0);
  });
});

/**
 * The test that matters: does the catalogue actually recognise what the party
 * are carrying? Anything unmatched is a name the extension could not offer
 * canonical text for, so it is worth knowing exactly which.
 */
describe('against the real party sheets', () => {
  const dir = fileURLToPath(new URL('./fixtures', import.meta.url));
  const sheets = readdirSync(dir)
    .filter((f) => f.endsWith('.html') && f !== 'archetype-card.html')
    .flatMap((f) => parseArchetypeCards(readFileSync(`${dir}/${f}`, 'utf8')));

  it('reads five characters', () => {
    expect(sheets).toHaveLength(5);
  });

  it('recognises every hindrance on every card', () => {
    const missing = sheets.flatMap((s) =>
      s.hindrances.filter((h) => !findHindrance(h.name)).map((h) => `${s.name}: ${h.name}`),
    );
    expect(missing).toEqual([]);
  });

  it('recognises every edge on every card', () => {
    const missing = sheets.flatMap((s) =>
      s.edges.filter((e) => !findEdge(e.name)).map((e) => `${s.name}: ${e.name}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('the equipment catalogue', () => {
  const dir = fileURLToPath(new URL('./fixtures', import.meta.url));
  const partySheets = readdirSync(dir)
    .filter((f) => f.endsWith('.html') && f !== 'archetype-card.html')
    .flatMap((f) => parseArchetypeCards(readFileSync(`${dir}/${f}`, 'utf8')));

  it('has weapons with usable stats', () => {
    expect(GEAR.length).toBeGreaterThan(50);
    const peacemaker = findGear('Colt Peacemaker');
    expect(peacemaker).toMatchObject({
      range: '12/24/48',
      damage: '2d6+1',
      ap: '1',
      rof: '1',
      shots: '6',
      cost: '$15',
    });
  });

  it('reads a melee table, whose Notes column sits inline and wraps', () => {
    // Splitting these rows from the right mangled them; matching each column by
    // shape is what fixed it.
    expect(findGear('Bowie knife')).toMatchObject({ damage: 'Str+d4+1', notes: 'AP 1' });
  });

  it('keeps a second firing mode with its weapon', () => {
    const lemat = findGear('LeMat Revolver');
    expect(lemat?.modes?.[0]).toMatchObject({ name: 'Shotgun (20-ga)', damage: '1–3d6' });
  });

  it('matches the names the cards use, including reversed compounds', () => {
    expect(findGear('Colt Rainmaker')?.name).toBe('Colt Rainmaker (.32)');
    expect(findGear('Springfield rifled musket')?.name).toBe('Springfield Rifled Musket');
    // The book files this as "Knife, Bowie".
    expect(findGear('Bowie knife')?.name).toBe('Knife, Bowie');
  });

  it('finds all but one of the weapons the party actually carry', () => {
    const weapons = partySheets.flatMap((s) => parseGear(s.gear).weapons);
    const missing = weapons.filter((w) => !findGear(w.name)).map((w) => w.name);
    // "Hickory stick" is improvised and genuinely not in the book.
    expect(missing).toEqual(['Hickory stick']);
  });

  it('describes an item the way a card would', () => {
    expect(describeGear(findGear('Colt Peacemaker')!)).toContain('Range 12/24/48');
  });

  it('suggests by prefix', () => {
    expect(suggestGear('colt').every((g) => g.name.toLowerCase().includes('colt'))).toBe(true);
  });
});
