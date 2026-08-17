/**
 * A bare page for the four claims about the dice renderer that were read out of a
 * minified bundle rather than tested.
 *
 * It needs no Owlbear room: `npm run ext:dev` and open `/dice-spike.html`. That is
 * the point — the library questions are separable from the Owlbear questions, and
 * finding out here that predetermined values do not survive mixed sets is much
 * cheaper than finding out mid-fight.
 *
 * It is not test infrastructure and nothing depends on it. The claims it checks are
 * the ones a unit test cannot: whether the number the renderer *reports* is the
 * number a human sees on the die.
 */
import DiceBox from '@drdreo/dice-box-threejs';
import { notation, waves } from '../../src/obr/diceThrow.js';
import { jitter, seatLabel, seatVector, type SeatVector } from '../../src/obr/seats.js';
import type { Seat } from '../../src/obr/diceThrow.js';
import { TRAY_THEME, colourset, evenLabelSizes, settleSooner } from './effects.js';
import { JavaRandom } from '../../src/dice/javaRandom.js';
import { Roller, type DieEvent } from '../../src/dice/roller.js';

const out = document.getElementById('out') as HTMLDivElement;
const buttons = document.getElementById('buttons') as HTMLDivElement;

function say(text: string): void {
  out.textContent = `${text}\n${out.textContent ?? ''}`.split('\n').slice(0, 14).join('\n');
}

const box = new DiceBox(document.getElementById('tray') as HTMLElement, {
  ...TRAY_THEME,
  assetPath: `${import.meta.env.BASE_URL}dice/`,
});
// The same two adjustments the tray makes, or the spike would be measuring a
// different renderer from the one in the room.
evenLabelSizes(box);
settleSooner(box);
const ready = box.initialize();

/** The seat override the tray uses, duplicated here so the spike tests it too. */
function throwFrom(direction: SeatVector): void {
  (box as unknown as { startClickThrow: (n: string) => unknown }).startClickThrow = function (
    notationString: string,
  ) {
    const self = this as unknown as {
      display: { currentWidth: number; currentHeight: number };
      strength: number;
      getNotationVectors: (n: string, v: unknown, boost: number, dist: number) => unknown;
      rolling: boolean;
      clearDice: () => void;
    };
    if (self.rolling) {
      self.clearDice();
      self.rolling = false;
    }
    const reach = {
      x: direction.x * self.display.currentWidth,
      y: direction.y * self.display.currentHeight,
    };
    const distance = Math.sqrt(reach.x * reach.x + reach.y * reach.y) + 100;
    return self.getNotationVectors(notationString, reach, (Math.random() + 3) * distance * self.strength, distance);
  };
}

function reported(results: { value: number; sides: number }[]): string {
  return results.map((r) => `d${r.sides}=${r.value}`).join(' ');
}

function button(label: string, run: () => Promise<void>): void {
  const element = document.createElement('button');
  element.textContent = label;
  element.addEventListener('click', () => {
    element.disabled = true;
    void run()
      .catch((error: unknown) => say(`FAILED: ${String(error)}`))
      .finally(() => {
        element.disabled = false;
      });
  });
  buttons.append(element);
}

// 1. Mixed sets. Measured 2026-08-17: `1d8@7+1d6@3` throws a *single* die, because
// the parser splits on the first `@` and reads the rest as values. One list, at the
// end. `notation()` builds it; this button proves the shape.
button('1. Mixed sets — d8 must show 7, d6 must show 3', async () => {
  await ready;
  const wanted = notation([
    { sides: 8, value: 7, chain: 1, step: 0, role: 'trait' },
    { sides: 6, value: 3, chain: 2, step: 0, role: 'wild' },
  ]);
  const result = await box.roll(wanted);
  const rolls = result.sets.flatMap((set) => set.rolls);
  say(`asked ${wanted} → reported ${reported(rolls)} (check the faces)`);
});

// 2. add() onto a settled tray, which is the staged ace.
button('2. add() — one d8 showing 8, then another showing 2', async () => {
  await ready;
  await box.roll('1d8@8');
  say('first wave down; adding in a moment…');
  await new Promise((r) => setTimeout(r, 600));
  const added = await box.add('1d8@2');
  say(`add() reported ${reported(added)}`);
});

// 3. The d4, whose face swap is arithmetic on material indices rather than a swap.
button('3. d4 — must show 3', async () => {
  await ready;
  const result = await box.roll('1d4@3');
  say(`d4 reported ${reported(result.sets.flatMap((s) => s.rolls))}`);
});

// 4. Seats. Watch which edge they come in from.
for (const seat of ['n', 's', 'w', 'e'] as Seat[]) {
  button(`4. Seat ${seatLabel(seat)}`, async () => {
    await ready;
    throwFrom(jitter(seatVector(seat)));
    await box.roll('3d6@6,6,6');
    say(`threw from seat "${seat}" (${seatLabel(seat)}) — did they enter from there?`);
  });
}

// 5. A real acing roll, staged the way the tray will stage it. The end to end check.
button('5. A real trait roll that aces (seed 34)', async () => {
  await ready;
  const dice: DieEvent[] = [];
  new Roller(new JavaRandom(34), (die) => dice.push(die)).rollSavageWorlds(1, 8, 6);
  await box.updateConfig({ theme_customColorset: colourset('#b4442c') });
  for (const [index, wave] of waves(dice).entries()) {
    if (index > 0) await new Promise((r) => setTimeout(r, 450));
    const shown = notation(wave);
    const results = index === 0 ? (await box.roll(shown)).sets.flatMap((s) => s.rolls) : await box.add(shown);
    say(`wave ${index}: ${shown} → ${reported(results)}`);
  }
  say('expect d8=6, then the wild d6=6, then its ace d6=4');
});
