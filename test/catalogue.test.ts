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
  gearLine,
  suggestGear,
  uncomma,
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

  /**
   * The digits that a too-greedy page-footer substitution used to eat. It deleted
   * any 1-3 digit number followed by a capitalised word, which in a rules text is
   * usually the number that matters — these five entries had lost their mechanic
   * outright. See MECHANICS-INVENTORY.md §12.6.
   */
  it('kept the numbers that carry the rule', () => {
    expect(findEdge('Power Points')?.text).toContain('additional 5 Power Points');
    expect(findEdge('Improved Rapid Recharge')?.text).toContain('regains 20 Power Points');
    expect(findEdge('Power Surge')?.text).toContain('recovers 10 Power Points');
    expect(findEdge('Extra Effort')?.text).toMatch(/\+1 for 1 Power Point.*\+2 for 3/);
    expect(findEdge('Agency Promotion')?.text).toContain('Grade 1 Agent');
  });

  it('left no page footer stranded in the text', () => {
    // "…along a particular route they've traveled before. 5" — the crop clips a
    // three-digit page number to its last digit, so this is a bare 1-3 digits at
    // the very end.
    for (const entry of [...EDGES, ...HINDRANCES]) {
      expect(entry.text, entry.name).not.toMatch(/\s\d{1,3}$/);
      expect(entry.text, entry.name).not.toContain('\u00ad');
    }
  });

  it('did not swallow a heading into the previous entry', () => {
    // "e    LEVEL HEADED" was a real failure when the right-hand crop caught the
    // last character of the left column.
    expect(findEdge('Level Headed')).toBeDefined();
    expect(findEdge('IMPROVED LEVEL HEADED')).toBeDefined();
  });
});

/**
 * The book's own one-line version of each entry, off its summary tables. This is
 * what shows on a sheet; the full text is behind a control, because six full
 * entries at once is more than anyone reads.
 */
describe('the summaries', () => {
  it('covers most of the book, and every hindrance', () => {
    expect(HINDRANCES.every((h) => h.summary)).toBe(true);
    expect(EDGES.filter((e) => e.summary).length).toBeGreaterThan(140);
  });

  it('is short enough to sit on a sheet', () => {
    for (const entry of [...EDGES, ...HINDRANCES]) {
      if (!entry.summary) continue;
      expect(entry.summary.length, entry.name).toBeLessThan(300);
    }
  });

  /**
   * Not *always* shorter than the full entry, which is worth pinning rather than
   * assuming. An improved Edge is written as "As above but…" and leans on the
   * entry it improves, so the summary table — which restates the whole effect —
   * says more in fewer words. `entryList` offers no expand control for those.
   */
  it('is shorter than the entry it summarises, except where the book defers', () => {
    const longer = [...EDGES, ...HINDRANCES]
      .filter((e) => e.summary && e.summary.length > e.text.length)
      .map((e) => e.name);
    expect(longer).toEqual([
      'IMPROVED ARCANE RESISTANCE',
      'IMPROVED FIRST STRIKE',
      'IMPROVED LEVEL HEADED',
      'THIN SKINNED',
    ]);
    for (const name of longer.filter((n) => n.startsWith('IMPROVED '))) {
      expect([...EDGES].find((e) => e.name === name)?.text).toMatch(/^As above/);
    }
  });

  it('leads with the mechanic', () => {
    expect(findEdge('Alertness')?.summary).toBe('+2 to Notice rolls.');
    expect(findEdge('Elan')?.summary).toBe('+2 when spending a Benny to reroll a Trait roll.');
    expect(findEdge('Guts')?.summary).toBe('Free reroll when making Fear checks.');
    expect(findHindrance('Anemic')?.summary).toContain('Vigor when resisting Fatigue');
  });

  /**
   * The table is laid out with the name centred in a tall row, so its summary
   * straddles it. Assigning each fragment to the nearest name put the boundary
   * halfway between two names, which is wrong whenever neighbouring rows differ
   * in height: Brute began with the tail of Brawny's entry and Scout lost its own
   * first line. These are the rows that caught it.
   */
  it('did not take a line from the row above or below', () => {
    expect(findEdge('Brute')?.summary).toMatch(/^Link Athletics to Strength/);
    expect(findEdge('Brawny')?.summary).toMatch(/equipment\.$/);
    expect(findEdge('Scout')?.summary).toMatch(/^Notice/);
    expect(findEdge('Ace')?.summary).toMatch(/^Character may spend Bennies/);
  });

  it('kept the running header printed down the page edge out of the text', () => {
    for (const entry of [...EDGES, ...HINDRANCES]) {
      expect(entry.summary ?? '', entry.name).not.toMatch(/Makin|DEADLANDS/);
    }
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

  /**
   * What the party actually sees on their sheets. Agency Promotion is the one
   * exception and is not an extraction fault: the book never lists it in the
   * summary tables, because it is documented in the Agent chapter. It falls back
   * to its full text, which is the intended behaviour rather than a hole.
   */
  it('has a one-line summary for every entry the party carries but one', () => {
    const bare = sheets.flatMap((s) =>
      [...s.edges, ...s.hindrances]
        .filter((e) => !findEntry(e.name)?.summary)
        .map((e) => e.name),
    );
    expect([...new Set(bare)]).toEqual(['AGENCY PROMOTION']);
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

describe('putting a catalogue item onto a sheet', () => {
  it('writes it the way a card does', () => {
    expect(gearLine(findGear('Colt Peacemaker')!)).toBe(
      'Colt Peacemaker (Range 12/24/48, damage 2d6+1, RoF 1, AP 1, Shots 6)',
    );
  });

  it('drops the calibre, which would otherwise break our own gear parser', () => {
    // "Colt Peacemaker (.45) (Range …)" is two bracketed groups in a row, which
    // parseGear reads as one malformed item and loses the stats from.
    expect(gearLine(findGear('Colt Peacemaker')!)).not.toContain('.45');
  });

  it('round-trips every weapon in the catalogue back through the gear parser', () => {
    const weapons = GEAR.filter((g) => g.damage && !g.name.startsWith('&'));
    expect(weapons.length).toBeGreaterThan(30);

    const broken: string[] = [];
    for (const item of weapons) {
      const [parsed] = parseGear(gearLine(item)).weapons;
      if (!parsed) {
        broken.push(`${item.name}: not read as a weapon`);
        continue;
      }
      if (item.range && parsed.range !== item.range) broken.push(`${item.name}: range`);
      if (parsed.damage?.replace(/\s/g, '') !== item.damage?.replace(/\s/g, '')) {
        broken.push(`${item.name}: damage ${parsed.damage} vs ${item.damage}`);
      }
      if (item.ap && String(parsed.ap) !== item.ap) broken.push(`${item.name}: ap`);
      if (item.rof && String(parsed.rof) !== item.rof) broken.push(`${item.name}: rof`);
    }
    expect(broken).toEqual([]);
  });
});

describe('names that would break a gear line', () => {
  it('reverses a comma-filed name, which would otherwise become two items', () => {
    // A gear line is comma-separated, so "Knife, Bowie (…)" parses as a Knife
    // with no stats plus a Bowie carrying them.
    expect(uncomma('Knife, Bowie')).toBe('Bowie Knife');
    expect(uncomma('Club, War')).toBe('War Club');
    expect(uncomma('Colt Peacemaker')).toBe('Colt Peacemaker');
  });

  it('writes the Bowie knife as one item the gear parser reads whole', () => {
    const line = gearLine(findGear('Bowie knife')!);
    expect(line).toBe('Bowie Knife (damage Str+d4+1)');
    const { weapons, items } = parseGear(line);
    expect(weapons).toHaveLength(1);
    expect(items).toHaveLength(0);
    expect(weapons[0]).toMatchObject({ name: 'Bowie Knife', damage: 'Str+d4+1' });
  });

  it('leaves every catalogue name as a single gear item', () => {
    const broken = GEAR.filter((item) => {
      const { weapons, armor, items: plain } = parseGear(gearLine(item));
      return weapons.length + armor.length + plain.length !== 1;
    }).map((item) => item.name);
    expect(broken).toEqual([]);
  });
});

/**
 * The same two spellings, from the lookup's side. Ten shipped entries are
 * `X (IMP)` and eight are `IMPROVED X`, and a character card may carry either —
 * so whichever form an entry does *not* use has to resolve to it anyway, or the
 * edge shows on the sheet with no rules text.
 */
describe('upgraded edges, spelled either way', () => {
  it('finds a bracketed entry by its Improved name', () => {
    expect(findEntry('Improved Level Headed')?.name).toBe('IMPROVED LEVEL HEADED');
    expect(findEntry('Improved Dodge')?.name).toBe('IMPROVED DODGE');
  });

  it('finds an Improved entry by its bracketed name', () => {
    expect(findEntry('Rapid Recharge (Imp)')?.name).toBe('IMPROVED RAPID RECHARGE');
  });

  it('still finds each of them by its own name', () => {
    // The *old* catalogue spelling, which sheets in Damian's room still carry.
    // Renaming the data must not orphan them, and this is the line that says so.
    expect(findEntry('LEVEL HEADED (IMP)')?.name).toBe('IMPROVED LEVEL HEADED');
    expect(findEntry('IMPROVED RAPID RECHARGE')?.name).toBe('IMPROVED RAPID RECHARGE');
  });

  it('does not confuse the upgrade with the plain Edge', () => {
    expect(findEntry('Level Headed')?.name).toBe('LEVEL HEADED');
  });
});
