import { describe, expect, it } from 'vitest';
import { JavaRandom } from '../src/dice/javaRandom.js';
import { BLACK_JOKER, COLOR_JOKER, Deck, card, cardToString, type Card } from '../src/game/cards.js';
import { emptySheet, type Sheet } from '../src/rules/sheet.js';
import { newTokenState } from '../src/obr/binding.js';
import { gangCard, type Combatant } from '../extension/src/initiativePanel.js';
import {
  NO_EDGES,
  chooseCard,
  dealOne,
  dealRound,
  drawCount,
  initiativeEdges,
  isInitiativeState,
  newInitiative,
  turnOrder,
  type InitiativeEdges,
} from '../src/rules/initiative.js';

const withEdges = (...names: string[]): Sheet => ({
  ...emptySheet('x', 'X'),
  edges: names.map((name) => ({ name })),
});

const edges = (over: Partial<InitiativeEdges> = {}): InitiativeEdges => ({ ...NO_EDGES, ...over });

describe('reading edges off a sheet', () => {
  it('finds Quick, Level Headed and Hesitant by name', () => {
    expect(initiativeEdges(withEdges('QUICK')).quick).toBe(true);
    expect(initiativeEdges(withEdges('LEVEL HEADED')).levelHeaded).toBe(true);
    expect(initiativeEdges(withEdges('Level-Headed')).levelHeaded).toBe(true);
    expect(initiativeEdges({ ...emptySheet('x', 'X'), hindrances: [{ name: 'HESITANT (MAJOR)' }] })
      .hesitant).toBe(true);
  });

  it('reads "Improved Level Headed" as improved, not as both', () => {
    // The plain name is a substring of the improved one; getting this wrong
    // would have a character drawing two cards instead of three.
    const found = initiativeEdges(withEdges('IMPROVED LEVEL HEADED'));
    expect(found.improvedLevelHeaded).toBe(true);
    expect(found.levelHeaded).toBe(false);
  });

  it('finds nothing on a plain character', () => {
    expect(initiativeEdges(withEdges('MARKSMAN', 'STEADY HANDS'))).toEqual(NO_EDGES);
  });
});

describe('how many cards are drawn', () => {
  it.each([
    [NO_EDGES, 1],
    [edges({ quick: true }), 1],
    [edges({ levelHeaded: true }), 2],
    [edges({ improvedLevelHeaded: true }), 3],
    [edges({ hesitant: true }), 2],
  ])('%o draws %i', (e, expected) => {
    expect(drawCount(e)).toBe(expected);
  });
});

describe('choosing among the drawn cards', () => {
  const low = card('CLUBS', 3);
  const high = card('SPADES', 12);

  it('takes the best by default — Level Headed as written, not as the Java bot does it', () => {
    // The port keeps Deck.getCardByParams bug-for-bug, where Level Headed takes
    // the worst. The VTT has no such obligation.
    expect(chooseCard([low, high], edges({ levelHeaded: true }))).toEqual(high);
  });

  it('takes the worst when Hesitant', () => {
    expect(chooseCard([low, high], edges({ hesitant: true }))).toEqual(low);
  });

  it('lets a joker override Hesitant', () => {
    expect(chooseCard([low, COLOR_JOKER], edges({ hesitant: true }))).toEqual(COLOR_JOKER);
  });

  it('breaks a rank tie by suit', () => {
    const clubs = card('CLUBS', 10);
    const spades = card('SPADES', 10);
    expect(chooseCard([clubs, spades], NO_EDGES)).toEqual(spades);
  });

  it('has nothing to choose from an empty hand', () => {
    expect(chooseCard([], NO_EDGES)).toBeUndefined();
  });
});

describe('dealing one hand', () => {
  it('draws once for a plain character', () => {
    const draw = dealOne(new Deck(new JavaRandom(1)), NO_EDGES);
    expect(draw?.cards).toHaveLength(1);
    expect(draw?.card).toEqual(draw?.cards[0]);
  });

  it('redraws for Quick until the card is a six or better', () => {
    // Deterministic seed; whatever comes out, the acted-on card must not be low.
    for (let seed = 0; seed < 25; seed++) {
      const draw = dealOne(new Deck(new JavaRandom(seed)), edges({ quick: true }));
      expect(draw!.card.rank).toBeGreaterThanOrEqual(6);
      // Every card below six must have been kept in the record of what was drawn.
      expect(draw!.cards.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not redraw a joker, low rank or not', () => {
    const deck = Deck.restore([card('CLUBS', 2), BLACK_JOKER], new JavaRandom(1));
    const draw = dealOne(deck, edges({ quick: true }));
    expect(draw?.card).toEqual(BLACK_JOKER);
    expect(draw?.cards).toHaveLength(1);
  });

  it('stops rather than looping when the deck runs dry', () => {
    const deck = Deck.restore([card('CLUBS', 2)], new JavaRandom(1));
    const draw = dealOne(deck, edges({ quick: true }));
    expect(draw?.card).toEqual(card('CLUBS', 2));
  });

  it('gives nothing from an empty deck', () => {
    expect(dealOne(Deck.restore([], new JavaRandom(1)), NO_EDGES)).toBeUndefined();
  });
});

describe('turn order', () => {
  it('puts the highest card first, jokers on top', () => {
    const order = turnOrder([
      { name: 'low', card: card('CLUBS', 3) },
      { name: 'joker', card: COLOR_JOKER },
      { name: 'king', card: card('HEARTS', 13) },
    ]);
    expect(order.map((c) => c.name)).toEqual(['joker', 'king', 'low']);
  });

  it('breaks ties by suit, spades highest', () => {
    const order = turnOrder([
      { name: 'clubs', card: card('CLUBS', 10) },
      { name: 'spades', card: card('SPADES', 10) },
      { name: 'hearts', card: card('HEARTS', 10) },
    ]);
    expect(order.map((c) => c.name)).toEqual(['spades', 'hearts', 'clubs']);
  });

  it('sorts the undealt to the bottom rather than dropping them', () => {
    const order = turnOrder([
      { name: 'waiting' },
      { name: 'dealt', card: card('CLUBS', 4) },
      { name: 'also waiting' },
    ]);
    expect(order.map((c) => c.name)).toEqual(['dealt', 'also waiting', 'waiting']);
  });

  /**
   * A gang shares a card, so identical cards are now the common case rather than
   * an impossibility, and the order within one has to come from somewhere the
   * Marshal can predict. Left to the sort's stability it would be whatever order
   * the tokens arrived in, which changes when somebody moves one.
   */
  it('breaks an identical card by name, so a gang keeps its order', () => {
    const shared = card('SPADES', 9);
    const order = turnOrder([
      { name: 'Bandit 3', card: shared },
      { name: 'Bandit 1', card: shared },
      { name: 'Bandit 2', card: shared },
    ]);
    expect(order.map((c) => c.name)).toEqual(['Bandit 1', 'Bandit 2', 'Bandit 3']);
  });

  it('counts the number in a mook name, so Bandit 2 precedes Bandit 10', () => {
    const shared = card('SPADES', 9);
    const order = turnOrder([
      { name: 'Bandit 10', card: shared },
      { name: 'Bandit 2', card: shared },
    ]);
    expect(order.map((c) => c.name)).toEqual(['Bandit 2', 'Bandit 10']);
  });
});

describe('dealing a round', () => {
  const table = [
    { tokenId: 't1', edges: NO_EDGES },
    { tokenId: 't2', edges: edges({ levelHeaded: true }) },
    { tokenId: 't3', edges: edges({ hesitant: true }) },
  ];

  it('does not deal to someone who is out of the fight', () => {
    const withCasualty = [...table, { tokenId: 't4', edges: NO_EDGES, out: true }];
    const result = dealRound(newInitiative(new JavaRandom(1)), withCasualty, new JavaRandom(2));
    expect([...result.draws.keys()].sort()).toEqual(['t1', 't2', 't3']);
  });

  it('gives everyone a card and advances the round', () => {
    const result = dealRound(newInitiative(new JavaRandom(1)), table, new JavaRandom(2));
    expect(result.state.round).toBe(1);
    expect([...result.draws.keys()].sort()).toEqual(['t1', 't2', 't3']);
  });

  it('never deals the same card twice', () => {
    const result = dealRound(newInitiative(new JavaRandom(3)), table, new JavaRandom(4));
    const dealt = [...result.draws.values()].flatMap((d) => d.cards).map(cardToString);
    expect(new Set(dealt).size).toBe(dealt.length);
  });

  it('takes the dealt cards out of the deck', () => {
    const start = newInitiative(new JavaRandom(5));
    const result = dealRound(start, table, new JavaRandom(6));
    const dealt = [...result.draws.values()].reduce((n, d) => n + d.cards.length, 0);
    expect(result.state.deck.length).toBe(start.deck.length - dealt);
  });

  it('reshuffles when a joker went out last round', () => {
    const nearlyEmpty = { round: 4, deck: [card('CLUBS', 2)], jokerDealt: true };
    const result = dealRound(nearlyEmpty, table, new JavaRandom(7));
    // A full deck, minus whatever this round used.
    expect(result.state.deck.length).toBeGreaterThan(40);
    expect(result.state.round).toBe(5);
  });

  it('reshuffles rather than running out mid-table', () => {
    // Three cards cannot serve three combatants, one of whom draws two.
    const thin = {
      round: 1,
      deck: [card('CLUBS', 2), card('CLUBS', 3), card('CLUBS', 4)],
      jokerDealt: false,
    };
    const result = dealRound(thin, table, new JavaRandom(8));
    expect(result.draws.size).toBe(3);
    expect(result.state.deck.length).toBeGreaterThan(40);
  });

  /**
   * A gang of Extras acts on one Action Card. Tactician and the Command Edge
   * both give a card to *"any allied Extra (or group of Extras sharing an Action
   * Card)"*, which only means anything if sharing is ordinary.
   */
  describe('a gang sharing one card', () => {
    const gang = [
      { tokenId: 'b1', edges: NO_EDGES, group: 'bandit-sheet' },
      { tokenId: 'b2', edges: NO_EDGES, group: 'bandit-sheet' },
      { tokenId: 'b3', edges: NO_EDGES, group: 'bandit-sheet' },
    ];

    it('deals every member the same card, and each still gets a row', () => {
      const result = dealRound(newInitiative(new JavaRandom(1)), gang, new JavaRandom(2));
      expect([...result.draws.keys()].sort()).toEqual(['b1', 'b2', 'b3']);
      const cards = [...result.draws.values()].map((d) => cardToString(d.card));
      expect(new Set(cards).size).toBe(1);
    });

    /** The identity the roll log's collapse is keyed on, so it is pinned here. */
    it('hands out one Draw object rather than three equal ones', () => {
      const result = dealRound(newInitiative(new JavaRandom(1)), gang, new JavaRandom(2));
      expect(new Set(result.draws.values()).size).toBe(1);
    });

    it('spends one hand from the deck, not one per body', () => {
      const start = newInitiative(new JavaRandom(5));
      const result = dealRound(start, gang, new JavaRandom(6));
      expect(start.deck.length - result.state.deck.length).toBe(1);
    });

    it('keeps separate groups on separate cards', () => {
      const twoGangs = [
        ...gang,
        { tokenId: 'w1', edges: NO_EDGES, group: 'walkin-dead' },
        { tokenId: 'w2', edges: NO_EDGES, group: 'walkin-dead' },
      ];
      const result = dealRound(newInitiative(new JavaRandom(3)), twoGangs, new JavaRandom(4));
      expect(cardToString(result.draws.get('b1')!.card)).not.toBe(
        cardToString(result.draws.get('w1')!.card),
      );
      expect(result.draws.get('w1')).toBe(result.draws.get('w2'));
    });

    /**
     * Members are filtered before they are grouped. The other order would let a
     * single downed bandit take the whole gang's card away.
     */
    it('still acts when one of its members is down', () => {
      const mauled = [
        { tokenId: 'b1', edges: NO_EDGES, group: 'bandit-sheet', out: true },
        { tokenId: 'b2', edges: NO_EDGES, group: 'bandit-sheet' },
      ];
      const result = dealRound(newInitiative(new JavaRandom(1)), mauled, new JavaRandom(2));
      expect([...result.draws.keys()]).toEqual(['b2']);
    });

    it('leaves an ungrouped combatant alone with their own card', () => {
      const mixed = [...gang, { tokenId: 'pc', edges: NO_EDGES }];
      const result = dealRound(newInitiative(new JavaRandom(1)), mixed, new JavaRandom(2));
      expect(result.draws.get('pc')).not.toBe(result.draws.get('b1'));
    });

    /**
     * Two ungrouped combatants must not be folded together by the fallback key.
     * They are keyed by token id, which cannot collide with a group id.
     */
    it('does not group two combatants that simply have no group', () => {
      const loners = [
        { tokenId: 'x', edges: NO_EDGES },
        { tokenId: 'y', edges: NO_EDGES },
      ];
      const result = dealRound(newInitiative(new JavaRandom(1)), loners, new JavaRandom(2));
      expect(cardToString(result.draws.get('x')!.card)).not.toBe(
        cardToString(result.draws.get('y')!.card),
      );
    });

    it('draws the group its Level Headed pair of cards, once', () => {
      const clever = [
        { tokenId: 'b1', edges: edges({ levelHeaded: true }), group: 'g' },
        { tokenId: 'b2', edges: edges({ levelHeaded: true }), group: 'g' },
      ];
      const start = newInitiative(new JavaRandom(11));
      const result = dealRound(start, clever, new JavaRandom(12));
      expect(result.draws.get('b1')!.cards).toHaveLength(2);
      expect(start.deck.length - result.state.deck.length).toBe(2);
    });
  });

  it('reports a joker so the caller knows to reshuffle after the round', () => {
    // Stack the deck so a joker is certain to come out.
    const stacked = {
      round: 1,
      deck: [COLOR_JOKER, card('CLUBS', 5), card('HEARTS', 9)],
      jokerDealt: false,
    };
    // Enough cards for a single plain combatant, so no reshuffle intervenes.
    const result = dealRound(stacked, [{ tokenId: 't1', edges: NO_EDGES }], new JavaRandom(9));
    expect(result.jokerDealt).toBe(result.state.jokerDealt);
  });

  it('recognises its own serialised state', () => {
    expect(isInitiativeState(newInitiative(new JavaRandom(1)))).toBe(true);
    expect(isInitiativeState({ round: 1, deck: 'nope', jokerDealt: false })).toBe(false);
    expect(isInitiativeState(undefined)).toBe(false);
  });
});

/**
 * The row's Deal button does two jobs, and which one it does turns on whether the
 * combatant already holds a card.
 *
 * The one that matters here is the latecomer. The Marshal drags three more
 * bandits onto the map mid-fight, or reveals the pair behind the barn; they are
 * the same stat block as the gang that is already acting, so they join it. The
 * alternative — one press, one fresh card, three times — turns one gang into
 * four separate turns out of a single sheet.
 */
describe('a mook joining a gang mid-fight', () => {
  const bandit = emptySheet('bandit', 'Bandit');
  const preacher = emptySheet('preacher', 'Preacher');
  const shared = card('SPADES', 9);

  const body = (name: string, sheet: Sheet, held?: Card): Combatant => ({
    tokenId: `t-${name}`,
    name,
    sheet,
    state: newTokenState(sheet.id),
    ...(held ? { card: held } : {}),
  });

  it('takes the card the rest of its gang is on', () => {
    const table = [
      body('Bandit 1', bandit, shared),
      body('Bandit 2', bandit, shared),
      body('Bandit 3', bandit),
    ];
    expect(gangCard(table[2]!, table)).toEqual(shared);
  });

  it('ignores a gang it does not belong to', () => {
    const table = [body('Preacher', preacher, shared), body('Bandit 1', bandit)];
    expect(gangCard(table[1]!, table)).toBeUndefined();
  });

  it('draws fresh when it is the first of its kind on the map', () => {
    const table = [body('Bandit 1', bandit)];
    expect(gangCard(table[0]!, table)).toBeUndefined();
  });

  /**
   * They disagree only because somebody used the surgical redraw on one of them.
   * Picking a majority would quietly undo that, so no answer means draw.
   */
  it('draws fresh rather than choosing when the gang has already split', () => {
    const table = [
      body('Bandit 1', bandit, shared),
      body('Bandit 2', bandit, card('HEARTS', 4)),
      body('Bandit 3', bandit),
    ];
    expect(gangCard(table[2]!, table)).toBeUndefined();
  });

  it('does not count the joiner’s own card', () => {
    const table = [body('Bandit 1', bandit, shared)];
    expect(gangCard(table[0]!, table)).toBeUndefined();
  });
});

/**
 * Reported from the table, 2026-08-26: *"'Improved Level Headed' is listed as
 * 'Level Headed (imp)'"* and *"Improved Level Headed doesn't deal the 3rd card"*
 * — which are the same fact. The shipped catalogue names ten upgraded Edges
 * `X (IMP)` and eight `IMPROVED X`; only the second form was matched, so the Edge
 * fell through to plain Level Headed and dealt two.
 */
describe('the two spellings of an upgraded Edge', () => {
  const sheetWith = (name: string): Sheet => ({
    ...emptySheet('x', 'X'),
    edges: [{ name }],
  });

  it.each([
    'IMPROVED LEVEL HEADED',
    'Improved Level-Headed',
    'LEVEL HEADED (IMP)',
    'Level Headed (imp)',
    'Level-Headed (Imp.)',
    'Level Headed (Improved)',
  ])('reads %s as the improved Edge', (name) => {
    const found = initiativeEdges(sheetWith(name));
    expect(found.improvedLevelHeaded).toBe(true);
    expect(found.levelHeaded).toBe(false);
  });

  it('deals the third card, which was the symptom', () => {
    const result = dealRound(
      newInitiative(new JavaRandom(1)),
      [{ tokenId: 't1', edges: initiativeEdges(sheetWith('Level Headed (imp)')) }],
      new JavaRandom(2),
    );
    expect(result.draws.get('t1')!.cards).toHaveLength(3);
  });

  it('still reads the plain Edge as plain', () => {
    const found = initiativeEdges(sheetWith('LEVEL HEADED'));
    expect(found.levelHeaded).toBe(true);
    expect(found.improvedLevelHeaded).toBe(false);
  });
});
