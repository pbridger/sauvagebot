/**
 * How the dice look, and where anything fancier will go.
 *
 * Kept apart from `tray.ts` on purpose. The tray's job — take values the engine
 * already rolled, stage them into waves, tell the panel when to reveal — is
 * finished business that should not be reopened to change a colour. Everything
 * about appearance lives here.
 *
 * ## Room to grow
 *
 * `three` and `cannon-es` are **peer** dependencies, so this project pins the
 * versions rather than inheriting whatever the dice library was built against.
 * That is what makes the following possible later without touching the tray:
 *
 *   - **Emissive materials** — a hexslinger's die glowing as it lands. The library
 *     exposes its live `THREE.Scene`, so `decorate()` can walk the dice meshes and
 *     swap in a material with an `emissiveMap`.
 *   - **Textures** — bone, weathered wood, gunmetal. Cheapest route is
 *     `theme_customColorset.texture`; a bespoke material goes through `decorate()`.
 *   - **Particles** — smoke off a die that aced, a fire trail on a Fear Level
 *     roll. These want the scene *and* the per-die resting positions, which is why
 *     `decorate()` is handed the results as well as the scene, and why the library
 *     was chosen partly for reporting each die's `position` and `screenPosition`.
 *
 * The two functions below are the whole contract. Both are called from the tray at
 * points where an exception must not cost anybody a dice roll, so both are wrapped
 * by the caller — but neither should throw in the first place.
 */
import type DiceBox from '@drdreo/dice-box-threejs';
import type { DiceResult } from '@drdreo/dice-box-threejs';
import type * as THREE from 'three';
import { LinearMipmapLinearFilter, Quaternion, Vector3 } from 'three';
import type { DieEvent } from '../../src/dice/roller.js';

/**
 * One consistent set of units, derived from a real die.
 *
 * Everything here follows from measuring the geometry the library already draws and
 * asking what it would be in metres. A d6 comes out **104 world units** on edge
 * (`baseScale` 100 × die scale 0.9, over √3); calling that a 16mm die fixes the scale
 * of the whole world at **~6,495 units per metre**. Every other number below is then a
 * real quantity converted once, not a value picked because it looked right:
 *
 *   | in the world       | which is          |
 *   |--------------------|-------------------|
 *   | tray ~1400 units   | 21.6 cm across    |
 *   | spawn 200–400      | 3–6 cm above felt |
 *   | 13,000 u/s         | 2 m/s, a real toss|
 *   | 130 u/s            | 2 cm/s, "stopped" |
 *
 * The scale was already coherent — the geometry never needed rescaling. What was wrong
 * was the dynamics: gravity sixteen times too weak for that size, which made falls
 * about four times too slow, which reads as weight.
 *
 * ## Why the first attempt at fixing it clunked
 *
 * Raising gravity alone makes it worse, and this is the part worth remembering.
 * `cannon` resolves contacts with a spring whose stiffness is an **absolute** number
 * (`contactEquationStiffness`, default 1e7). The library gives dice a mass of 300–400,
 * so at gravity 16,000 a die's own weight is ~5e6 — within an order of magnitude of the
 * contact spring. The die sinks into the table under its own weight and is shoved back
 * out: contact, penetration, correction. That is the clunk.
 *
 * Two things fix it together: dice weigh what dice weigh (4 g), and the contact spring
 * is stiff relative to that. Then a landing is a landing rather than a collision with a
 * trampoline.
 */
const UNITS_PER_METRE = 6495;

/** Metres per second, in world units. */
function ms(metresPerSecond: number): number {
  return metresPerSecond * UNITS_PER_METRE;
}

/**
 * Every physical parameter in one place, in real terms.
 *
 * Mutable, and applied per throw, so the tuning page can change any of it live and
 * report the numbers back — see `extension/dice-spike.html`. Watching a change while
 * you make it beats a round trip through a rebuild, and none of this can be judged from
 * arithmetic alone.
 */
export const PHYSICS = {
  /** 9.81 m/s², converted. The old value was 3,920 — a sixteenth of true. */
  gravity: 9.81 * UNITS_PER_METRE,
  /**
   * 4 grams, the mass of a 16mm acrylic die, against the library's 300–400.
   *
   * Mass never affected how fast a die falls; what it changes is how hard the contact
   * solver has to work, and lighter dice sit on the table instead of sinking into it.
   */
  mass: 4,
  /**
   * Acrylic on baize. The library used 0.6 — rubber on concrete — which made dice bite
   * and stop dead instead of running out.
   */
  friction: 0.35,
  /** A die on felt is a dead bounce; the walls are harder and hold dice in. */
  restitution: 0.4,
  wallRestitution: 0.7,
  /**
   * Stiff enough that 4 g of die does not push into the felt. Two orders above the
   * weight it has to hold, which is the rule of thumb that keeps SPOOK contacts from
   * sagging.
   */
  stiffness: 1.8e6,
  relaxation: 3,
  iterations: 20,
  /**
   * A 2 m/s toss, which is what a hand actually does.
   *
   * The step has to be small enough that a die does not cross its own width between two
   * of them: there is no continuous collision detection here, and at 2 m/s a die covers
   * 108 units in 1/120 s against a body 104 units wide. At 1/240 it is half that.
   */
  throwSpeed: ms(2),
  /**
   * How finely the simulation is stepped — part of the tuning, not an implementation
   * detail. See `timestep()` for why deriving it went wrong.
   */
  timestep: 1 / 240,
  /** Real dice tumble hard off the hand; below this they barely turn in flight. */
  spin: { min: 18, max: 34 },
  /** Air on a die is nothing. Just enough to stop numerical drift. */
  linearDamping: 0.02,
  angularDamping: 0.03,
  /** 2 cm/s, and a quarter second of it, before a die counts as stopped. */
  stillSpeed: ms(0.02),
  stillFor: 0.25,
  /**
   * How fast to play the whole thing back.
   *
   * The one number here that is not physics, and it is needed *because* the rest of it
   * now is. The tray is 21.6 cm across and it fills the screen, so a die is magnified
   * perhaps sixfold over how you would ever see one on a table. At that magnification a
   * true 2 m/s throw crosses the entire visible area in **a tenth of a second** — it
   * reads as being fired from a cannon, which is exactly what happens when correct
   * physics is watched through a magnifying glass. Every sports replay of a small fast
   * object has the same problem and the same answer.
   *
   * Scaling time is not the same as weakening gravity, which is what went wrong before.
   * Weaken gravity alone and dice fly *further* before landing — flatter, skating
   * trajectories. Scale time properly and the trajectory is identical, just slower:
   * positions follow `p(kt)`, so velocities scale by `k`, accelerations by `k²`, spin by
   * `k`, and damping (a rate) by `k`. All of which is what `scaled()` does below.
   *
   * 0.45 is a starting point, not a truth. It is a slider on the tuning page.
   */
  timeScale: 0.15,
};

/**
 * The parameters as the simulation should actually receive them, with the time scale
 * folded in.
 *
 * Kept apart from `PHYSICS` so that what is written there stays *real* — 9.81, 4 grams,
 * 2 m/s — and can be checked against the world. This is the only place the pretence
 * happens, and it is one consistent transformation rather than a set of fudges.
 */
export function scaled(): {
  gravity: number;
  throwSpeed: number;
  spin: { min: number; max: number };
  linearDamping: number;
  angularDamping: number;
  stillSpeed: number;
  stillFor: number;
} {
  const k = PHYSICS.timeScale;
  return {
    gravity: PHYSICS.gravity * k * k,
    throwSpeed: PHYSICS.throwSpeed * k,
    spin: { min: PHYSICS.spin.min * k, max: PHYSICS.spin.max * k },
    linearDamping: PHYSICS.linearDamping * k,
    angularDamping: PHYSICS.angularDamping * k,
    stillSpeed: PHYSICS.stillSpeed * k,
    // **Not** scaled, and this is the one deliberate break in the transformation.
    // Strictly it should be `stillFor / k` — 1.7 seconds at 0.15 — but this dwell is
    // not physics, it is how long we wait before believing a die has stopped, and it is
    // watched in wall-clock time by a person. Stretching it would put the pause between
    // a die stopping and its flare back where it was before it was cut to 250ms.
    // Safe because the *speed* threshold above is scaled: a die under 3 units/s for a
    // quarter second has genuinely finished.
    stillFor: PHYSICS.stillFor,
  };
}

/**
 * How finely the simulation is stepped.
 *
 * **Fixed, and not to be derived.** It was briefly computed from the throw speed — at
 * 0.15× time scale dice cover a seventh the ground, so a coarser step looked provably
 * "safe" against tunnelling, and it made the headless pre-simulation four times
 * cheaper. That reasoning is sound and the result was wrong: dice went floaty.
 *
 * The mistake was thinking of the step as a tunnelling guard, when it also sets how a
 * contact resolves. `cannon`'s SPOOK solver derives its softness from `1 / (k · dt²)`,
 * so quadrupling the step changed the feel of every landing — and, worse, it changed it
 * *after* the numbers here had been tuned by eye against 1/240. Any parameter set is
 * only meaningful at the step it was judged at, so the step is part of the tuning, not
 * an implementation detail free to be optimised underneath it.
 */
export function timestep(): number {
  return PHYSICS.timestep;
}

/** What the box has to be built with, since these are constructor options. */
function physics(): {
  gravity_multiplier: number;
  framerate: number;
  iterationLimit: number;
  strength: number;
} {
  return {
    gravity_multiplier: scaled().gravity / 9.8,
    framerate: timestep(),
    // Counts steps, not seconds. Slow motion means a longer settle in simulated
    // seconds as well as real ones, so this needs headroom: it is what stops the
    // pre-simulation looping forever, and hitting it freezes dice mid-air.
    iterationLimit: 8000,
    strength: 1,
  };
}

/**
 * The look of the table itself.
 *
 * `green-felt` is the library's default and reads as a card table, which is
 * exactly right for a game whose initiative is a deck of cards.
 */
export const TRAY_THEME = {
  // `physics()` reads `PHYSICS`, so both must be initialised above this — see the
  // regression test. A `const` used before its declaration is a load-time
  // ReferenceError, which for a whole page means it simply never runs.
  theme_surface: 'green-felt',
  theme_material: 'plastic',
  // Off by default and not currently exposed: four clatter tracks over Discord
  // voice is not a feature. The assets are shipped, so it is a config change away.
  sounds: false,
  shadows: true,
  ...physics(),
} as const;

/** Bone-white with black numbers: a plain, readable die for anyone with no colour. */
const DEFAULT_COLOURS = { background: '#e8e0cf', foreground: '#1a1a1a' };

/**
 * A colourset built from a player's OBR party colour.
 *
 * Their own colour is already how the room identifies them — it is on their cursor
 * and their tokens' rings — so borrowing it means whose dice these are needs no
 * label at all. It pairs with the seat (§6 of the plan): colour says who, the edge
 * they came in from says who as well, and both are readable at a glance mid-fight.
 */
export function colourset(colour: string | undefined): {
  background: string;
  foreground: string;
} {
  if (!colour || !/^#[0-9a-f]{3,8}$/i.test(colour)) return DEFAULT_COLOURS;
  return { background: colour, foreground: readableOn(colour) };
}

/**
 * Black or white numbers, whichever can be read on this colour.
 *
 * OBR hands out mid-tone player colours, some of which are light enough that white
 * numerals disappear. Perceived brightness rather than a plain average, because
 * green reads far brighter than blue at the same value.
 */
function readableOn(colour: string): string {
  const hex = colour.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return DEFAULT_COLOURS.foreground;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1a1a1a' : '#f6f2e8';
}

/**
 * Called once per wave, after the dice have been thrown.
 *
 * @param box the live dice box; `box.scene`, `box.camera` and `box.world` are public
 * @param dice the engine's dice for this wave, so an effect can key off `role`
 *   (the Wild Die) or off a value that aced
 * @param results the renderer's own per-die results, carrying resting `position`
 *   and `screenPosition`
 */
export function decorate(
  box: DiceBox,
  dice: readonly DieEvent[],
  results: readonly DiceResult[],
): void {
  void dice;
  void results;
  if (sharpen(box)) {
    // A frame, or the change is invisible: this runs once the dice are asleep and the
    // library's own loop has stopped, so the sharpened texture would not be drawn
    // until something else happened to redraw — which, on a settled table, is never.
    const renderer = (box as unknown as { renderer?: THREE.WebGLRenderer }).renderer;
    renderer?.render(box.scene, box.camera);
  }
}

/**
 * Give the d4 the same label resolution as every other die.
 *
 * Must be called on a fresh box, before `initialize()`: materials are built on first
 * use and cached, and this changes how big they are drawn.
 *
 * The library sizes its label canvas per shape, and the d4's arithmetic comes out a
 * quarter the size of everything else's — `POT(50 + 1) · 4 = 128²`, against
 * `POT(50 + 50·2·1) · 4 = 512²` for a d6 or a d20. A d4 also carries *three* numerals
 * per face, so it is the one die that most needs the resolution and is the only one
 * that does not get it.
 *
 * That is why enabling anisotropic filtering did not touch it: anisotropy fixes
 * *minification*, where several texels fall in one pixel. A 128² label stretched
 * across a die that size is the opposite problem — one texel covering several pixels,
 * which no sampler flag can help. Both fixes are needed and they fix different things.
 *
 * Raised to 512 and no further on purpose: one material is built per face value, so a
 * d20 holds twenty of them, and 512² RGBA is already ~1MB each.
 */
export function evenLabelSizes(box: DiceBox): void {
  const factory = (box as unknown as {
    DiceFactory?: { calc_texture_size?: (n: number) => number };
  }).DiceFactory;
  if (!factory?.calc_texture_size) return;
  const original = factory.calc_texture_size.bind(factory);
  // The caller multiplies by four, so a floor of 128 here is a 512² canvas — the
  // same as every other shape already gets, rather than an arbitrary bump.
  factory.calc_texture_size = (n: number): number => Math.max(128, original(n));
}

/**
 * Push every physical parameter into a live box.
 *
 * Called before each throw rather than once, for two reasons: the library rebuilds its
 * contact materials in `makeWorldBox` on every resize — and an Owlbear panel is resized
 * whenever the browser window is — and because `PHYSICS` is mutable, so the tuning page
 * can turn a knob and see it on the next roll.
 *
 * Bodies are reached by wrapping `spawnDice`, since they are built inside `roll()` and
 * `cannon` has no per-world defaults to set: every `Body` writes its own mass, damping
 * and sleep thresholds in its own constructor.
 */
export function applyPhysics(box: DiceBox): void {
  const self = box as unknown as {
    world?: {
      gravity: { set: (x: number, y: number, z: number) => void };
      solver?: { iterations?: number };
      contactmaterials?: {
        friction: number;
        restitution: number;
        contactEquationStiffness: number;
        contactEquationRelaxation: number;
        frictionEquationStiffness: number;
      }[];
      defaultContactMaterial?: { contactEquationStiffness: number; friction: number };
    };
    spawnDice?: (vector: unknown, existing?: unknown) => unknown;
    diceList?: {
      body?: {
        mass?: number;
        updateMassProperties?: () => void;
        linearDamping?: number;
        angularDamping?: number;
        sleepTimeLimit?: number;
        sleepSpeedLimit?: number;
      };
    }[];
    physicsPatched?: boolean;
    framerate?: number;
  };

  const world = self.world;
  if (world) {
    // Down is negative z here: the felt is the z = 0 plane and the camera looks along it.
    world.gravity.set(0, 0, -scaled().gravity);
    if (world.solver) world.solver.iterations = PHYSICS.iterations;
    if (world.defaultContactMaterial) {
      world.defaultContactMaterial.contactEquationStiffness = PHYSICS.stiffness;
      world.defaultContactMaterial.friction = PHYSICS.friction;
    }
    for (const contact of world.contactmaterials ?? []) {
      contact.friction = PHYSICS.friction;
      // The walls are told apart by the restitution the library gave them — it builds
      // them bouncier than the felt on purpose, so dice stay in the tray.
      contact.restitution =
        contact.restitution >= 0.9 ? PHYSICS.wallRestitution : PHYSICS.restitution;
      contact.contactEquationStiffness = PHYSICS.stiffness;
      contact.frictionEquationStiffness = PHYSICS.stiffness;
      contact.contactEquationRelaxation = PHYSICS.relaxation;
    }
  }
  self.framerate = timestep();

  const original = self.spawnDice?.bind(box);
  if (original && !self.physicsPatched) {
    self.physicsPatched = true;
    self.spawnDice = (vector: unknown, existing?: unknown): unknown => {
      const made = original(vector, existing);
      // Read *here*, not where this wrapper was installed: it is installed once and
      // then runs for every throw for the life of the box, so a value captured at
      // install time would freeze at whatever the first throw used — and a slider that
      // moves nothing is worse than no slider.
      const now = scaled();
      for (const die of self.diceList ?? []) {
        const body = die.body;
        if (!body) continue;
        body.mass = PHYSICS.mass;
        // Inertia is computed from mass and shape at construction, so a mass set
        // afterwards means nothing until this is called.
        body.updateMassProperties?.();
        body.linearDamping = now.linearDamping;
        body.angularDamping = now.angularDamping;
        body.sleepSpeedLimit = now.stillSpeed;
        body.sleepTimeLimit = now.stillFor;
      }
      return made;
    };
  }
}

/**
 * Turn on anisotropic filtering for the dice faces.
 *
 * The numbers are drawn to a canvas and used as an ordinary texture, and the library
 * leaves the sampler at its defaults. A die face is almost never parallel to the
 * screen — the top of a d4 is nearly edge-on by construction — and a steeply
 * foreshortened texture on an isotropic sampler is exactly the case mipmapping
 * blurs: it picks a level for the *shortest* axis and throws away the detail along
 * the long one. Anisotropy is the fix, mipmaps and trilinear minification are what
 * make it apply, and the cost is a sampler flag rather than a bigger texture.
 *
 * Cheap to call after every wave: the library caches materials per die type and
 * colour, so this touches each one once and then finds it already done.
 */
function sharpen(box: DiceBox): boolean {
  const renderer = (box as unknown as { renderer?: THREE.WebGLRenderer }).renderer;
  const max = renderer?.capabilities.getMaxAnisotropy?.() ?? 1;
  if (max <= 1) return false;

  let changed = false;
  box.scene.traverse((object) => {
    const materials = (object as THREE.Mesh).material;
    if (!materials) return;
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      const map = (material as THREE.MeshStandardMaterial).map;
      if (!map || map.anisotropy === max) continue;
      map.anisotropy = max;
      map.generateMipmaps = true;
      map.minFilter = LinearMipmapLinearFilter;
      map.needsUpdate = true;
      changed = true;
    }
  });
  return changed;
}

/**
 * How bright an acing die flares, and for how long.
 *
 * The flare fills the beat between an ace landing and the die it bought being
 * thrown, so the two read as cause and effect rather than as two throws.
 */
const FLARE_PEAK = 0.85;

/**
 * Light up the face an acing die came to rest on.
 *
 * ## What this does and does not glow
 *
 * The **face** flares, not the numeral alone. Emissive light is added across a whole
 * material, so with the face lit the dark numeral reads as a silhouette against it —
 * dramatic and, if anything, easier to read than a white glyph. Glowing the digit by
 * itself would need an alpha mask of the numeral, and the library draws its labels
 * straight onto the die canvas without keeping one. If the silhouette turns out to
 * be the wrong look, `FLARE_PEAK` and the colour below are the two knobs.
 *
 * ## Two things worth knowing about the implementation
 *
 * The materials are **cloned onto this die first**. The library caches materials by
 * die type and colour, so every d6 in the room shares one set — lighting a face
 * without cloning would light that number on every die on the table.
 *
 * And it **renders its own frames**. The library's animation loop stops once the
 * dice are asleep, which is exactly when this runs, so nothing would be drawn.
 */
export function flare(box: DiceBox, dieId: number, value: number, ms: number): void {
  const renderer = (box as unknown as { renderer?: THREE.WebGLRenderer }).renderer;
  const dice = (box as unknown as { diceList?: THREE.Mesh[] }).diceList;
  const die = dice?.[dieId];
  if (!renderer || !die) return;

  const original = die.material;
  const materials = (Array.isArray(original) ? original : [original]).map((material) =>
    (material as THREE.MeshStandardMaterial).clone(),
  );
  die.material = materials;

  const lit = faceMaterials(box, die, value, materials);
  const started = performance.now();

  const step = (): void => {
    const t = Math.min(1, (performance.now() - started) / ms);
    // Up fast, down slow: a struck match rather than a pulse.
    const brightness = FLARE_PEAK * Math.sin(Math.PI * Math.pow(t, 0.6));
    for (const material of lit) material.emissive.setScalar(brightness);
    renderer.render(box.scene, box.camera);
    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }
    // Back to the shared materials, and the clones go: a fight is a lot of aces, and
    // a leaked material per ace is a leaked GPU program per ace.
    die.material = original;
    for (const material of materials) material.dispose();
  };
  requestAnimationFrame(step);
}

/**
 * The materials making up the face showing `value`, or all of them if that cannot be
 * worked out.
 *
 * The library keeps a `values` list per die type and lays materials out with a fixed
 * offset in front of them — the same arithmetic its own face-swapping uses, which is
 * why this can find the face at all. `d4` is excluded on purpose: it swaps faces by
 * rotating material indices rather than exchanging two, so the same reasoning does
 * not hold, and a d4 flares whole. Falling back to the whole die is always safe: it
 * is a brighter version of the right answer, never a wrong face.
 */
function faceMaterials(
  box: DiceBox,
  die: THREE.Mesh,
  value: number,
  materials: THREE.MeshStandardMaterial[],
): THREE.MeshStandardMaterial[] {
  try {
    const factory = (box as unknown as {
      DiceFactory: { get: (type: string) => { values: number[]; shape: string } };
    }).DiceFactory;
    const type = (die as unknown as { notation: { type: string } }).notation.type;
    const spec = factory.get(type);
    if (!spec || spec.shape === 'd4') return materials;
    const at = spec.values.indexOf(value);
    if (at < 0) return materials;
    const index = at + (spec.shape === 'd10' ? 1 : 2);
    const groups = die.geometry.groups.filter((group) => group.materialIndex === index);
    const found = groups
      .map((group) => materials[group.materialIndex ?? -1])
      .filter((material): material is THREE.MeshStandardMaterial => material !== undefined);
    return found.length ? found : materials;
  } catch {
    return materials;
  }
}

/**
 * How far off level a die may come to rest before it is nudged flat, and how long
 * the nudge takes.
 */
const LEVEL_TOLERANCE = 0.14; // radians, ~8°
const LEVEL_MS = 140;

/**
 * Settle a die that stopped on an edge or a corner.
 *
 * ## Why one stops there at all
 *
 * `cannon` decides a body is asleep from its *speed alone*, and a die teetering on an
 * edge is momentarily slow at the top of its arc — it decelerates, hangs, then topples.
 * The moment the world calls it asleep, the library sets `body.type = KINEMATIC`, which
 * freezes it exactly where it is. With the stock one-second dwell the die had almost
 * always fallen before the timer ran out; at 250ms the hang fits inside the window, so
 * shortening the dwell did not create this, it made a latent case common.
 *
 * ## Why levelling rather than more physics
 *
 * The die's *value* was never in doubt — it comes from the engine, and the library
 * picks the face nearest to up and swaps the engine's number onto it. So a die on an
 * edge is only ever a presentation problem, and the honest fix is to show the face the
 * result already refers to. Waking it for another topple would be the physical answer
 * and risks a die that never settles; this is bounded, deterministic, and lands on the
 * face the log is talking about.
 *
 * Only the mesh is rotated. The body is kinematic by this point and nothing simulates
 * it again, so the two cannot drift apart in any way that will be seen.
 */
export function levelDice(box: DiceBox): void {
  const renderer = (box as unknown as { renderer?: THREE.WebGLRenderer }).renderer;
  const dice = (box as unknown as { diceList?: THREE.Mesh[] }).diceList ?? [];
  if (!renderer || !dice.length) return;

  const tilted: { die: THREE.Mesh; from: THREE.Quaternion; to: THREE.Quaternion }[] = [];
  for (const die of dice) {
    const correction = levelling(die);
    if (!correction) continue;
    tilted.push({
      die,
      from: die.quaternion.clone(),
      to: correction.multiply(die.quaternion).clone(),
    });
  }
  if (!tilted.length) return;

  const started = performance.now();
  const step = (): void => {
    const t = Math.min(1, (performance.now() - started) / LEVEL_MS);
    // Ease out: it should look like the die tipping over the last few degrees under
    // its own weight, not like a hand straightening it.
    const eased = 1 - Math.pow(1 - t, 3);
    for (const { die, from, to } of tilted) die.quaternion.slerpQuaternions(from, to, eased);
    renderer.render(box.scene, box.camera);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * The rotation that would bring this die's nearest face to level, or nothing if it is
 * already flat enough to look settled.
 *
 * The face is found the same way the library finds the one it reports — smallest angle
 * between a group's rotated normal and up, with the d4 measured against *down*, since
 * its value is the face on the table. Reading it any other way would risk levelling a
 * die onto a face other than the one whose number is showing.
 */
function levelling(die: THREE.Mesh): THREE.Quaternion | undefined {
  const body = (die as unknown as { body?: { quaternion: THREE.Quaternion } }).body;
  const shape = (die as unknown as { shape?: string }).shape;
  const normals = die.geometry?.getAttribute('normal');
  if (!body || !normals) return undefined;

  const up = new Vector3(0, 0, shape === 'd4' ? -1 : 1);
  let closest: number | undefined;
  let best = Math.PI * 2;
  die.geometry.groups.forEach((group, index) => {
    if (group.materialIndex === 0) return;
    const at = index * 9;
    const normal = new Vector3(
      normals.array[at] as number,
      normals.array[at + 1] as number,
      normals.array[at + 2] as number,
    ).applyQuaternion(body.quaternion);
    const angle = normal.angleTo(up);
    if (angle < best) {
      best = angle;
      closest = at;
    }
  });
  if (closest === undefined || best <= LEVEL_TOLERANCE) return undefined;

  const facing = new Vector3(
    normals.array[closest] as number,
    normals.array[closest + 1] as number,
    normals.array[closest + 2] as number,
  )
    .applyQuaternion(body.quaternion)
    .normalize();
  return new Quaternion().setFromUnitVectors(facing, up);
}

