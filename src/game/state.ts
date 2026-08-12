/**
 * Per-guild/channel game state: characters, initiative, bennies, tokens and status effects.
 *
 * The Java original spreads this across `characters`, `initiative`, `apiActions` and a Redis
 * client that swallows every failure at debug level. Here persistence is an explicit, injectable
 * interface so a Redis outage is visible rather than silent.
 */

import { JavaRandom } from '../dice/javaRandom.js';
import { Deck, cardToString, compareCards, type Card } from './cards.js';

export interface Store {
  load(): Promise<Record<string, unknown> | undefined>;
  save(state: Record<string, unknown>): Promise<void>;
}

export interface Character {
  name: string;
  /** Initiative edges/hindrances: q, l, i, h. */
  initParams: string;
  cards: Card[];
  bestCard: Card | undefined;
  onHold: boolean;
  bennies: number;
  tokens: number;
  states: string[];
}

export function newCharacter(name: string, initParams = ''): Character {
  return {
    name,
    initParams,
    cards: [],
    bestCard: undefined,
    onHold: false,
    bennies: 0,
    tokens: 0,
    states: [],
  };
}

/** Recognised Savage Worlds status effects (`StatesCommands` in the Java bot). */
export const KNOWN_STATES = [
  'shaken',
  'distracted',
  'vulnerable',
  'stunned',
  'entangled',
  'bound',
  'prone',
  'fatigued',
] as const;

export class Table {
  readonly characters = new Map<string, Character>();
  deck: Deck;
  round = 0;
  fightOn = false;

  constructor(private readonly random: JavaRandom = new JavaRandom()) {
    this.deck = new Deck(this.random);
  }

  getOrCreate(name: string): Character {
    const key = name.toLowerCase();
    let c = this.characters.get(key);
    if (!c) {
      c = newCharacter(name);
      this.characters.set(key, c);
    }
    return c;
  }

  get(name: string): Character | undefined {
    return this.characters.get(name.toLowerCase());
  }

  remove(name: string): boolean {
    return this.characters.delete(name.toLowerCase());
  }

  /** `fight` — start a new fight: fresh deck, round 1, clear held cards. */
  startFight(): void {
    this.deck.shuffle();
    this.round = 0;
    this.fightOn = true;
    for (const c of this.characters.values()) {
      c.cards = [];
      c.bestCard = undefined;
      c.onHold = false;
    }
    this.newRound();
  }

  /**
   * `round` — advance a round. A joker dealt in the previous round forces a reshuffle, which is
   * the rule most home-made trackers get wrong.
   */
  newRound(): { reshuffled: boolean } {
    let reshuffled = false;
    if (this.deck.jokerDealt) {
      this.deck.shuffle();
      reshuffled = true;
    }
    this.round += 1;
    for (const c of this.characters.values()) {
      if (!c.onHold) {
        c.cards = [];
        c.bestCard = undefined;
      }
    }
    this.dealAll();
    return { reshuffled };
  }

  /** Deals an initiative card to every character not on hold. */
  dealAll(): void {
    for (const c of this.characters.values()) {
      if (c.onHold) continue;
      this.dealTo(c);
    }
  }

  dealTo(c: Character): void {
    if (this.deck.isEmpty()) this.deck.shuffle();
    const result = this.deck.getCardByParams(c.initParams);
    c.cards = result.cards;
    c.bestCard = result.bestCard;
  }

  /** Initiative order: highest card first. Characters without a card sort last. */
  order(): Character[] {
    return [...this.characters.values()].sort((a, b) => {
      if (a.bestCard === undefined && b.bestCard === undefined) return a.name.localeCompare(b.name);
      if (a.bestCard === undefined) return 1;
      if (b.bestCard === undefined) return -1;
      return compareCards(b.bestCard, a.bestCard);
    });
  }

  toJSON(): Record<string, unknown> {
    return {
      round: this.round,
      fightOn: this.fightOn,
      characters: [...this.characters.values()],
    };
  }

  loadFrom(data: Record<string, unknown>): void {
    this.round = typeof data.round === 'number' ? data.round : 0;
    this.fightOn = data.fightOn === true;
    this.characters.clear();
    const list = Array.isArray(data.characters) ? (data.characters as Character[]) : [];
    for (const c of list) {
      this.characters.set(c.name.toLowerCase(), {
        ...newCharacter(c.name, c.initParams ?? ''),
        ...c,
      });
    }
  }
}

export function describeCards(c: Character): string {
  if (c.cards.length === 0) return '—';
  const all = c.cards.map(cardToString).join(' ');
  if (c.cards.length > 1 && c.bestCard) {
    return `${all} (${cardToString(c.bestCard)})`;
  }
  return all;
}

/** Keyed per channel, matching how the Java bot scopes table state. */
export class Tables {
  private readonly tables = new Map<string, Table>();

  constructor(private readonly store?: Store) {}

  get(channelId: string): Table {
    let t = this.tables.get(channelId);
    if (!t) {
      t = new Table();
      this.tables.set(channelId, t);
    }
    return t;
  }

  async persist(): Promise<void> {
    if (!this.store) return;
    const snapshot: Record<string, unknown> = {};
    for (const [channelId, table] of this.tables) {
      snapshot[channelId] = table.toJSON();
    }
    await this.store.save(snapshot);
  }

  async restore(): Promise<void> {
    if (!this.store) return;
    const data = await this.store.load();
    if (!data) return;
    for (const [channelId, raw] of Object.entries(data)) {
      const table = new Table();
      table.loadFrom(raw as Record<string, unknown>);
      this.tables.set(channelId, table);
    }
  }
}
