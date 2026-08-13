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
