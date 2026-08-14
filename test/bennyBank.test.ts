import { describe, expect, it } from 'vitest';
import { BENNY_PREFIX, BennyBank } from '../src/obr/bennyBank.js';
import { NoBenniesError } from '../src/rules/bennies.js';
import { emptySheet, type Sheet } from '../src/rules/sheet.js';
import { ROOM_CAPACITY, VerifiedStore, usedBytes, type Backend } from '../src/obr/store.js';

class FakeBackend implements Backend {
  data: Record<string, unknown> = {};
  async get(): Promise<Record<string, unknown>> {
    return structuredClone(this.data);
  }
  async set(update: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) delete this.data[key];
      else this.data[key] = value;
    }
  }
}

/**
 * A store that accepts a write, confirms it once — which is exactly what
 * `VerifiedStore`'s read-back sees — and has lost it by the next read. This is
 * the shape of the failure seen in the live room: the hand-out reported success
 * for a character who then showed none.
 */
class ForgetfulBackend extends FakeBackend {
  private pending: string[] = [];
  constructor(private readonly forgets: (key: string) => boolean) {
    super();
  }
  override async set(update: Record<string, unknown>): Promise<void> {
    await super.set(update);
    for (const key of Object.keys(update)) if (this.forgets(key)) this.pending.push(key);
  }
  override async get(): Promise<Record<string, unknown>> {
    const snapshot = await super.get();
    // The verifying read still sees it; anything later does not.
    const dropping = this.pending;
    this.pending = [];
    for (const key of dropping) delete this.data[key];
    return snapshot;
  }
}

const newBank = () => {
  const backend = new FakeBackend();
  return {
    backend,
    bank: new BennyBank(
      new VerifiedStore(backend, { capacity: ROOM_CAPACITY, onWarning: () => {} }),
    ),
  };
};

const wildCard = (id: string): Sheet => emptySheet(id, id.toUpperCase());
const extra = (id: string): Sheet => ({ ...emptySheet(id, id.toUpperCase()), wildCard: false });

describe('storage layout', () => {
  it('uses one key per character, so two players never share a write', async () => {
    const { backend, bank } = newBank();
    await bank.set('reggie', 3);
    await bank.set('paige', 2);
    expect(Object.keys(backend.data).sort()).toEqual([
      `${BENNY_PREFIX}paige`,
      `${BENNY_PREFIX}reggie`,
    ]);
  });

  it('costs almost nothing', async () => {
    const { backend, bank } = newBank();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) await bank.set(id, 3);
    expect(usedBytes(backend.data)).toBeLessThan(300);
  });

  it('reads zero for a character with no entry', async () => {
    const { bank } = newBank();
    expect(await bank.get('nobody')).toBe(0);
  });

  it('ignores a junk value rather than trusting it', async () => {
    const { backend, bank } = newBank();
    backend.data[`${BENNY_PREFIX}reggie`] = 'three';
    expect(await bank.get('reggie')).toBe(0);
  });
});

describe('spending and awarding', () => {
  it('spends one', async () => {
    const { bank } = newBank();
    await bank.set('reggie', 3);
    expect(await bank.spend('reggie', 'Soak Rolls')).toBe(2);
    expect(await bank.get('reggie')).toBe(2);
  });

  it('refuses to spend what is not there', async () => {
    const { bank } = newBank();
    await expect(bank.spend('reggie', 'Reroll a Trait')).rejects.toThrow(NoBenniesError);
  });

  it('awards', async () => {
    const { bank } = newBank();
    expect(await bank.award('reggie')).toBe(1);
    expect(await bank.award('reggie', 2)).toBe(3);
  });
});

describe('starting a session', () => {
  const party = [wildCard('reggie'), wildCard('paige'), extra('bandit')];

  it('sets every Wild Card to three and Extras to none', async () => {
    const { bank } = newBank();
    await bank.newSession(party);
    expect(await bank.get('reggie')).toBe(3);
    expect(await bank.get('paige')).toBe(3);
    expect(await bank.get('bandit')).toBe(0);
  });

  it('replaces rather than adds — unused Bennies are lost', async () => {
    const { bank } = newBank();
    await bank.set('reggie', 7);
    await bank.newSession(party);
    expect(await bank.get('reggie')).toBe(3);
  });

  it('tops up someone who spent everything', async () => {
    const { bank } = newBank();
    await bank.set('reggie', 0);
    await bank.newSession(party);
    expect(await bank.get('reggie')).toBe(3);
  });
});

/**
 * The bug this pins: `newSession` threw on the first write that did not fit and
 * the caller had nothing to catch it, so the rest of the party silently got
 * nothing. At the table that reads as "one player was skipped".
 */
describe('when the room runs out of space part way through', () => {
  const tiny = (capacity: number) => {
    const backend = new FakeBackend();
    return {
      backend,
      bank: new BennyBank(new VerifiedStore(backend, { capacity, onWarning: () => {} })),
    };
  };

  const party = [wildCard('aa'), wildCard('bb'), wildCard('cc'), wildCard('dd')];

  it('keeps going, and reports who missed out', async () => {
    // Room for the first couple of keys and no more.
    const { bank } = tiny(80);
    const outcome = await bank.newSession(party);

    expect(outcome.done.length).toBeGreaterThan(0);
    expect(outcome.failed.length).toBeGreaterThan(0);
    expect([...outcome.done, ...outcome.failed.map((f) => f.name)].sort()).toEqual([
      'AA',
      'BB',
      'CC',
      'DD',
    ]);
    for (const name of outcome.done) expect(await bank.get(name.toLowerCase())).toBe(3);
  });

  it('reports nothing failed when everything fits', async () => {
    const { bank } = newBank();
    const outcome = await bank.newSession(party);
    expect(outcome.failed).toEqual([]);
    expect(outcome.done).toEqual(['AA', 'BB', 'CC', 'DD']);
  });
});

describe('a write that passes verification and then vanishes', () => {
  it('is reported rather than announced as a success', async () => {
    const backend = new ForgetfulBackend((key) => key.endsWith('ed'));
    const bank = new BennyBank(
      new VerifiedStore(backend, { capacity: ROOM_CAPACITY, onWarning: () => {} }),
    );
    const party = [wildCard('reggie'), wildCard('ed')];

    const outcome = await bank.newSession(party);
    expect(outcome.done).toEqual(['REGGIE']);
    expect(outcome.failed.map((f) => f.name)).toEqual(['ED']);
    expect(outcome.failed[0]!.error.message).toMatch(/did not survive/);
  });
});

describe('a Benny for everyone', () => {
  it('adds one to every Wild Card and nothing to Extras', async () => {
    const { bank } = newBank();
    const party = [wildCard('reggie'), extra('bandit')];
    await bank.set('reggie', 1);
    const outcome = await bank.awardAll(party);
    expect(outcome.done).toEqual(['REGGIE']);
    expect(await bank.get('reggie')).toBe(2);
    expect(await bank.get('bandit')).toBe(0);
  });

  it('adds more than one when asked', async () => {
    const { bank } = newBank();
    expect((await bank.awardAll([wildCard('reggie')], 2)).done).toEqual(['REGGIE']);
    expect(await bank.get('reggie')).toBe(2);
  });
});

describe("Joker's Wild", () => {
  it('gives one to every Wild Card and nothing to Extras', async () => {
    const { bank } = newBank();
    const party = [wildCard('reggie'), wildCard('paige'), extra('bandit')];
    await bank.newSession(party);

    const lucky = await bank.jokersWild(party);
    expect(lucky).toEqual(['REGGIE', 'PAIGE']);
    expect(await bank.get('reggie')).toBe(4);
    expect(await bank.get('bandit')).toBe(0);
  });
});
