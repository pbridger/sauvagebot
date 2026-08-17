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
 * Deliberately empty. It exists so that the first fancy effect is an edit to one
 * function with everything it needs already in scope, rather than a change to how
 * the tray is wired — see the note at the top of this file.
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
  void box;
  void dice;
  void results;
}
