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
import { seatLabel } from '../../src/obr/seats.js';
import type { Seat } from '../../src/obr/diceThrow.js';
import {
  PHYSICS,
  TRAY_THEME,
  applyPhysics,
  colourset,
  evenLabelSizes,
  levelDice,
} from './effects.js';
import { aimThrow, seedRandom } from './throwing.js';
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
// The same adjustments the tray makes, or the spike would be measuring a different
// renderer from the one in the room.
evenLabelSizes(box);
applyPhysics(box);
const ready = box.initialize();

/**
 * The seat every test throw comes from, and the seed it uses.
 *
 * Fixed by default, and this is the point of the page: a physics parameter cannot be
 * judged by eye if the throw underneath it changes too. With the seed held, two throws
 * differ only by what a slider moved.
 */
let seat: Seat = 'n';
let seed = 12_345;
let repeatable = true;

/**
 * Throw, exactly the way the real tray throws.
 *
 * The three things this page was getting wrong, in one function: physics is re-applied
 * per throw (so a slider means something), the throw goes through the same `aimThrow`
 * the tray uses (so the speed and spin sliders are actually in the path), and the
 * randomness is seeded (so the difference between two throws is the slider you moved).
 */
async function throwDice(notationString: string, add = false): Promise<{ value: number; sides: number }[]> {
  await ready;
  applyPhysics(box);
  const restoreThrow = aimThrow(box, seat);
  // Every draw happens synchronously inside the call, so the seed is restored as soon as
  // it returns — see `seedRandom`.
  const restoreRandom = repeatable ? seedRandom(seed) : () => {};
  try {
    const rolling = add ? box.add(notationString) : box.roll(notationString);
    restoreRandom();
    const result = await rolling;
    const rolls = Array.isArray(result) ? result : result.sets.flatMap((set) => set.rolls);
    levelDice(box);
    return rolls;
  } finally {
    restoreRandom();
    restoreThrow();
  }
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
  say(`asked ${wanted} → reported ${reported(await throwDice(wanted))} (check the faces)`);
});

// 2. add() onto a settled tray, which is the staged ace.
button('2. add() — one d8 showing 8, then another showing 2', async () => {
  await ready;
  await throwDice('1d8@8');
  say('first wave down; adding in a moment…');
  await new Promise((r) => setTimeout(r, 600));
  say(`add() reported ${reported(await throwDice('1d8@2', true))}`);
});

// 3. The d4, whose face swap is arithmetic on material indices rather than a swap.
button('3. d4 — must show 3', async () => {
  await ready;
  say(`d4 reported ${reported(await throwDice('1d4@3'))}`);
});

// 6. Edge cases, literally: throw a handful hard and watch for a die frozen on an
// edge. Levelling should tip any of them onto the face the result names.
button('6. Twelve d6, then level whatever stopped on an edge', async () => {
  await ready;
  const values = Array.from({ length: 12 }, (_, i) => (i % 6) + 1);
  await throwDice(`12d6@${values.join(',')}`);
  say(`asked ${values.join(',')} — every die should read one of those, flat`);
});

// 4. Seats. Watch which edge they come in from.
for (const from of ['n', 's', 'w', 'e'] as Seat[]) {
  button(`4. Seat ${seatLabel(from)}`, async () => {
    seat = from;
    await throwDice('3d6@6,6,6');
    say(`threw from seat "${from}" (${seatLabel(from)}) — did they enter from there?`);
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
    say(`wave ${index}: ${shown} → ${reported(await throwDice(shown, index > 0))}`);
  }
  say('expect d8=6, then the wild d6=6, then its ace d6=4');
});


// ---------------------------------------------------------------- tuning

/**
 * Live physics controls.
 *
 * None of this can be judged from arithmetic — "heavy" is a thing you see — so the
 * numbers are on sliders and every throw re-reads them. The panel prints the current
 * set as it would appear in `PHYSICS`, so a good arrangement can be copied straight
 * back into the source rather than described.
 */
const knobs: { label: string; get: () => number; set: (n: number) => void; min: number; max: number; step: number; show: (n: number) => string }[] = [
  {
    // First, because it is the one that decides whether this looks like dice being
    // rolled or dice being fired. The tray is 21.6cm across and fills the screen.
    label: 'Time scale',
    get: () => PHYSICS.timeScale,
    set: (n) => (PHYSICS.timeScale = n),
    min: 0.15, max: 1, step: 0.05,
    show: (n) => `${n.toFixed(2)}x real time`,
  },
  {
    // On the page because it changes how a landing feels, not just how safe the
    // simulation is — a set of parameters is only meaningful at the step it was judged
    // at, which is a lesson this page exists to make cheap.
    label: 'Timestep',
    get: () => 1 / PHYSICS.timestep,
    set: (n) => (PHYSICS.timestep = 1 / n),
    min: 60, max: 480, step: 60,
    show: (n) => `1/${n.toFixed(0)} s`,
  },
  {
    label: 'Gravity',
    get: () => PHYSICS.gravity,
    set: (n) => (PHYSICS.gravity = n),
    min: 6495, max: 130_000, step: 1000,
    show: (n) => `${(n / 6495).toFixed(1)} m/s²`,
  },
  {
    label: 'Throw speed',
    get: () => PHYSICS.throwSpeed,
    set: (n) => (PHYSICS.throwSpeed = n),
    min: 3000, max: 30_000, step: 500,
    show: (n) => `${(n / 6495).toFixed(2)} m/s`,
  },
  {
    label: 'Spin',
    get: () => PHYSICS.spin.max,
    set: (n) => ((PHYSICS.spin.max = n), (PHYSICS.spin.min = n * 0.55)),
    min: 5, max: 80, step: 1,
    show: (n) => `${n.toFixed(0)} rad/s`,
  },
  {
    label: 'Friction',
    get: () => PHYSICS.friction,
    set: (n) => (PHYSICS.friction = n),
    min: 0.05, max: 1, step: 0.01,
    show: (n) => n.toFixed(2),
  },
  {
    label: 'Bounce',
    get: () => PHYSICS.restitution,
    set: (n) => (PHYSICS.restitution = n),
    min: 0, max: 0.9, step: 0.05,
    show: (n) => n.toFixed(2),
  },
  {
    label: 'Mass',
    get: () => PHYSICS.mass,
    set: (n) => (PHYSICS.mass = n),
    min: 1, max: 400, step: 1,
    show: (n) => `${n} g`,
  },
  {
    label: 'Contact stiffness',
    get: () => Math.log10(PHYSICS.stiffness),
    set: (n) => (PHYSICS.stiffness = Math.pow(10, n)),
    min: 6, max: 11, step: 0.25,
    show: (n) => `1e${n.toFixed(2)} — raise it if dice sink and clunk`,
  },
  {
    label: 'Damping (angular)',
    get: () => PHYSICS.angularDamping,
    set: (n) => (PHYSICS.angularDamping = n),
    min: 0, max: 0.4, step: 0.01,
    show: (n) => n.toFixed(2),
  },
];

const tuning = document.getElementById('tuning');
if (tuning) {
  // The seed first: without it, none of the sliders below can be judged, because two
  // throws of the same parameters land differently.
  const repeat = document.createElement('label');
  repeat.className = 'knob';
  const repeatName = document.createElement('span');
  repeatName.textContent = 'Repeatable';
  const repeatBox = document.createElement('input');
  repeatBox.type = 'checkbox';
  repeatBox.checked = repeatable;
  repeatBox.addEventListener('change', () => (repeatable = repeatBox.checked));
  const seedBox = document.createElement('input');
  seedBox.type = 'number';
  seedBox.value = String(seed);
  seedBox.style.width = '90px';
  seedBox.addEventListener('change', () => (seed = Number(seedBox.value) || 1));
  const seedNote = document.createElement('em');
  seedNote.textContent = 'same throw every time — change the seed for a different one';
  const seedRow = document.createElement('span');
  seedRow.append(repeatBox, seedBox);
  repeat.append(repeatName, seedRow, seedNote);
  tuning.append(repeat);
  const readout = document.createElement('pre');
  const refresh = (): void => {
    readout.textContent = [
      `gravity: ${Math.round(PHYSICS.gravity)},   // ${(PHYSICS.gravity / 6495).toFixed(1)} m/s²`,
      `mass: ${PHYSICS.mass},`,
      `friction: ${PHYSICS.friction},`,
      `restitution: ${PHYSICS.restitution},`,
      `stiffness: ${PHYSICS.stiffness.toExponential(1)},`,
      `throwSpeed: ${Math.round(PHYSICS.throwSpeed)},   // ${(PHYSICS.throwSpeed / 6495).toFixed(2)} m/s`,
      `spin: { min: ${PHYSICS.spin.min.toFixed(0)}, max: ${PHYSICS.spin.max.toFixed(0)} },`,
      `angularDamping: ${PHYSICS.angularDamping},`,
      `timeScale: ${PHYSICS.timeScale.toFixed(2)},`,
      `timestep: 1 / ${(1 / PHYSICS.timestep).toFixed(0)},`,
    ].join('\n');
  };

  for (const knob of knobs) {
    const row = document.createElement('label');
    row.className = 'knob';
    const name = document.createElement('span');
    name.textContent = knob.label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(knob.min);
    slider.max = String(knob.max);
    slider.step = String(knob.step);
    slider.value = String(knob.get());
    const value = document.createElement('em');
    value.textContent = knob.show(knob.get());
    slider.addEventListener('input', () => {
      knob.set(Number(slider.value));
      value.textContent = knob.show(Number(slider.value));
      refresh();
    });
    row.append(name, slider, value);
    tuning.append(row);
  }
  refresh();
  tuning.append(readout);

  button('Throw a trait roll (d8 + wild d6)', async () => {
    await throwDice('1d8+1d6@5,3');
    say('thrown with the current settings');
  });
  button('Throw six d6', async () => {
    await throwDice('6d6@1,2,3,4,5,6');
    say('six thrown — watch for clumping and for dice sinking on landing');
  });
}
