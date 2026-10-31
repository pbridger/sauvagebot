/**
 * The Tactics tab's content. It is static text, so what is worth pinning is the
 * places where the SWADE sheet it is laid out after disagrees with the Deadlands
 * rulebook — see the header of `tacticsPanel.ts`.
 */
import { describe, expect, it } from 'vitest';
import { ALWAYS, CONDITIONS, PROBLEMS } from '../extension/src/tacticsPanel.js';

const tactics = [...PROBLEMS.flatMap((problem) => problem.tactics), ...ALWAYS];
const condition = (name: string) => CONDITIONS.find((c) => c.name === name)?.text ?? '';

describe('the tactics tab', () => {
  it('cites a Deadlands page for every row', () => {
    for (const row of [...tactics, ...CONDITIONS]) expect(row.page).toMatch(/^p\d+/);
  });

  /** p153: Entangled is Vulnerable. The SWADE sheet says Distracted. */
  it('has Entangled as Vulnerable', () => {
    expect(condition('Entangled')).toMatch(/Vulnerable/);
    expect(condition('Entangled')).not.toMatch(/Distracted/);
  });

  /** p162: no Drop; recovery leaves you Vulnerable. */
  it('gives Stunned no Drop', () => {
    expect(condition('Stunned')).not.toMatch(/Drop/);
    expect(condition('Stunned')).toMatch(/Vulnerable to the end of your next turn/);
  });

  /** p154: cover applies to melee and ranged attacks alike. */
  it('does not promise that melee ignores cover', () => {
    const close = tactics.find((t) => t.name === 'Close to melee');
    expect(close?.effect).toMatch(/Cover still counts in melee/);
  });

  /** p146, which the shot panel enforces. */
  it('says Aim does nothing at Extreme Range', () => {
    expect(tactics.find((t) => t.name === 'Aim')?.effect).toMatch(/Extreme Range/);
  });
});
