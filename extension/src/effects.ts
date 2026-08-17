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
import { LinearMipmapLinearFilter } from 'three';
import type { DieEvent } from '../../src/dice/roller.js';

/**
 * The look of the table itself.
 *
 * `green-felt` is the library's default and reads as a card table, which is
 * exactly right for a game whose initiative is a deck of cards.
 */
export const TRAY_THEME = {
  theme_surface: 'green-felt',
  theme_material: 'plastic',
  // Off by default and not currently exposed: four clatter tracks over Discord
  // voice is not a feature. The assets are shipped, so it is a config change away.
  sounds: false,
  shadows: true,
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
 * How long a die must lie still before the physics world calls it settled.
 *
 * Not a timer of ours — it is `cannon`'s `sleepTimeLimit`, and its default is a whole
 * **second**. That second is the gap between a die visibly stopping and everything
 * that keys off it: the flare on an ace, the next die of a chain being thrown, and the
 * log line being revealed. Nothing was waiting on purpose; the world simply had not
 * admitted the die had stopped yet.
 *
 * A quarter of a second is enough dwell to tell "stopped" from "rolling slowly", given
 * the speed threshold is left alone. The risk of going lower is a die that is still
 * teetering being frozen where it stands, which reads as a snap.
 */
export const SETTLE_MS = 250;

/**
 * Have dice admit they have stopped as soon as they have.
 *
 * Wraps the box's own `spawnDice`, because the bodies are built inside `roll()` and
 * `cannon` has no global default to set — every `Body` writes its own
 * `sleepTimeLimit` in its constructor. Applied to the whole list each time rather than
 * to the new die alone: it is a handful of numbers and the list is short.
 *
 * The speed threshold (`sleepSpeedLimit`, 0.1) is deliberately untouched. That one
 * decides *whether* a die counts as still, and loosening it would freeze dice that are
 * genuinely rolling.
 */
export function settleSooner(box: DiceBox, ms: number = SETTLE_MS): void {
  const self = box as unknown as {
    spawnDice?: (vector: unknown, existing?: unknown) => unknown;
    diceList?: { body?: { sleepTimeLimit?: number } }[];
  };
  const original = self.spawnDice?.bind(box);
  if (!original) return;
  self.spawnDice = (vector: unknown, existing?: unknown): unknown => {
    const made = original(vector, existing);
    for (const die of self.diceList ?? []) {
      if (die.body) die.body.sleepTimeLimit = ms / 1000;
    }
    return made;
  };
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
