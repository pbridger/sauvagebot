import { describe, it, expect } from 'vitest';
import { JavaRandom } from '../src/dice/javaRandom.js';
import { Tables, Table } from '../src/game/state.js';
import { interpret } from '../src/bot/interpreter.js';
import { findCommand, ALL_COMMANDS } from '../src/bot/commands.js';
import { splitMessage, MESSAGE_LENGTH_LIMIT } from '../src/bot/discord.js';
import { Deck, compareCards, cardToString, LOWEST_QUICK_CARD } from '../src/game/cards.js';

function say(content: string, tables = new Tables(), seed = 0) {
  return interpret(
    {
      content,
      channelId: 'chan',
      guildId: 'guild',
      authorId: 'user',
      authorName: 'Paul',
    },
    { prefix: '~', tables, random: new JavaRandom(seed) },
  );
}

describe('command interpreter', () => {
  it('rolls a bare Savage Worlds trait expression', () => {
    const r = say('~s8');
    expect(r.publicText).toMatch(/^s8: \[.+; w.+\] = \*\*\d+\*\*/);
  });

  it('echoes narration around rolls', () => {
    const r = say('~the assassin shoots ~s8');
    expect(r.publicText).toContain('the');
    expect(r.publicText).toMatch(/s8: \[/);
  });

  it('ignores messages without the prefix', () => {
    expect(say('just chatting').publicText).toBe('');
  });

  it('routes rh to the private channel only', () => {
    const r = say('~rh s8');
    expect(r.publicText).toBe('');
    expect(r.privateText).toMatch(/s8: \[/);
  });

  it('reports unknown initiative modifiers instead of throwing', () => {
    expect(say('~init Huey:z').publicText).toContain('Unknown initiative modifier');
  });

  it('rejects contradictory initiative edges', () => {
    expect(say('~init Huey:qh').publicText).toContain('incompatible');
  });

  it('help uses the caller’s prefix, not a hardcoded !', () => {
    const text = say('~help').publicText;
    expect(text).toContain('~r ');
    expect(text).not.toMatch(/(^|\s)!r\s/);
  });

  it('help for a single command', () => {
    expect(say('~help deal').publicText).toContain('Deals initiative cards');
  });
});

describe('command registry', () => {
  it('resolves aliases', () => {
    expect(findCommand('dl')?.name).toBe('deal');
    expect(findCommand('gb')?.name).toBe('givebenny');
  });

  it('has no duplicate names or aliases', () => {
    const seen = new Set<string>();
    for (const c of ALL_COMMANDS) {
      for (const n of [c.name, ...c.aliases]) {
        expect(seen.has(n), `duplicate: ${n}`).toBe(false);
        seen.add(n);
      }
    }
  });

  it('ports no music commands', () => {
    for (const name of ['play', 'queue', 'skip', 'nowplaying', 'join', 'leave']) {
      expect(findCommand(name)).toBeUndefined();
    }
  });
});

describe('initiative', () => {
  it('tracks bennies across commands', () => {
    const tables = new Tables();
    say('~givebenny Huey 3', tables);
    const r = say('~takebenny Huey', tables);
    expect(r.publicText).toContain('bennies: **2**');
  });

  it('never takes bennies below zero', () => {
    const tables = new Tables();
    const r = say('~takebenny Huey 5', tables);
    expect(r.publicText).toContain('bennies: **0**');
  });

  it('deals a card to each character and orders them highest first', () => {
    const table = new Table(new JavaRandom(1));
    table.getOrCreate('Huey');
    table.getOrCreate('Dewey');
    table.getOrCreate('Louie');
    table.startFight();
    const order = table.order();
    expect(order).toHaveLength(3);
    for (const c of order) expect(c.bestCard).toBeDefined();
    for (let i = 1; i < order.length; i++) {
      expect(compareCards(order[i - 1]!.bestCard!, order[i]!.bestCard!)).toBeGreaterThanOrEqual(0);
    }
  });

  it('reshuffles the round after a joker is dealt', () => {
    const table = new Table(new JavaRandom(3));
    table.getOrCreate('Huey');
    table.startFight();
    table.deck.jokerDealt = true;
    expect(table.newRound().reshuffled).toBe(true);
    expect(table.deck.jokerDealt).toBe(false);
  });

  it('keeps held characters’ cards across a round', () => {
    const table = new Table(new JavaRandom(5));
    const c = table.getOrCreate('Huey');
    table.startFight();
    c.onHold = true;
    const held = c.bestCard;
    table.newRound();
    expect(c.bestCard).toEqual(held);
  });
});

describe('deck', () => {
  it('contains 54 cards including two jokers', () => {
    const deck = new Deck(new JavaRandom(0));
    const drawn = [];
    for (let i = 0; i < 54; i++) drawn.push(deck.getNextCard()!);
    expect(deck.isEmpty()).toBe(true);
    expect(drawn.filter((c) => c.rank === 15)).toHaveLength(2);
    // 54 distinct cards
    expect(new Set(drawn.map(cardToString)).size).toBe(54);
  });

  it('flags when a joker leaves the deck', () => {
    const deck = new Deck(new JavaRandom(0));
    let sawJoker = false;
    for (let i = 0; i < 54; i++) {
      const c = deck.getNextCard()!;
      if (c.rank === 15) sawJoker = true;
      expect(deck.jokerDealt).toBe(sawJoker);
    }
  });

  it('Quick redraws anything below the six of clubs', () => {
    // Run enough draws that a low card is near-certain without Quick.
    const deck = new Deck(new JavaRandom(7));
    for (let i = 0; i < 8; i++) {
      const result = deck.getCardByParams('q');
      if (result.bestCard) {
        expect(compareCards(result.bestCard, LOWEST_QUICK_CARD)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('Hesitant draws two and keeps the worse', () => {
    const deck = new Deck(new JavaRandom(11));
    const result = deck.getCardByParams('h');
    expect(result.cards).toHaveLength(2);
    const worst = [...result.cards].sort(compareCards)[0];
    expect(result.bestCard).toEqual(worst);
  });

  it('Improved Level Headed draws three', () => {
    const deck = new Deck(new JavaRandom(13));
    expect(deck.getCardByParams('i').cards).toHaveLength(3);
  });
});

describe('message splitting', () => {
  it('leaves short messages alone', () => {
    expect(splitMessage('hello')).toEqual(['hello']);
  });

  it('splits on line boundaries and respects the limit', () => {
    const text = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const parts = splitMessage(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(MESSAGE_LENGTH_LIMIT);
    expect(parts.join('\n')).toBe(text);
  });

  it('hard-splits a single over-long line', () => {
    const parts = splitMessage('x'.repeat(5000));
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(MESSAGE_LENGTH_LIMIT);
    expect(parts.join('')).toHaveLength(5000);
  });
});
