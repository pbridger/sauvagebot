/**
 * The dice tray: a transparent, click-through overlay across the whole window.
 *
 * It is its own page, opened as a full-screen modal with `hideBackdrop`,
 * `hidePaper` and `disablePointerEvents`, so it draws over the map without taking
 * a single click away from it. It runs its own `OBR.onReady` and listens to the
 * dice channel itself, which means it keeps working after the panel popover is
 * closed.
 *
 * ## What this file may and may not do
 *
 * It **may not decide anything about a roll**. Every value has already been rolled
 * by the conformance-verified engine; this page is told what to show. That is the
 * whole architecture (`docs/OBR-DICE-PLAN.md` §1), and the reason the dice can be
 * predetermined without lying: the library pre-simulates the throw, reads where the
 * die landed, and swaps the two faces' materials before playing the animation back,
 * so the face pointing up really does read what the log says.
 *
 * It **must never cost anybody a result**. The log is the source of truth and this
 * is decoration, so every path that can fail ends in `settled()` being sent anyway.
 * A missing texture, a lost WebGL context or a physics library that throws should
 * cost the table a nice animation and nothing else.
 */
import OBR from '@owlbear-rodeo/sdk';
import DiceBox from '@drdreo/dice-box-threejs';
import {
  ACE_BEAT_MS,
  DICE_CHANNEL,
  DICE_SETTLED_CHANNEL,
  acedIn,
  inNotationOrder,
  isDiceThrow,
  notation,
  waves,
  type DiceThrow,
} from '../../src/obr/diceThrow.js';
import { jitter, seatVector } from '../../src/obr/seats.js';
import { TRAY_THEME, colourset, decorate, flare } from './effects.js';

/**
 * How long without a roll before the renderer is released.
 *
 * Three minutes, not thirty seconds: a fight goes several rolls to the minute, and
 * rebuilding the box between rounds would trade a WebGL context for a stutter at
 * exactly the wrong moment. The long gaps this is for are the roleplay ones.
 */
const IDLE_MS = 180_000;
/** How long dice stay on the felt once they have stopped. */
const LINGER_MS = 4_000;

const container = document.getElementById('tray') as HTMLDivElement;

let box: DiceBox | undefined;
let ready: Promise<DiceBox> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let lingerTimer: ReturnType<typeof setTimeout> | undefined;
/** Serialises throws: two players rolling at once share one tray. */
let queue: Promise<void> = Promise.resolve();
/** The colour currently loaded into the box, so it is only rebuilt when it changes. */
let shownColour: string | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tell this client's own panel that the dice have stopped, so it can print the
 * line it has been holding back.
 *
 * `LOCAL`, because reveal is a local matter: nobody should wait on another
 * client's frame rate. The panel reveals on a timer as well, so a lost message
 * here delays a line rather than losing it.
 */
function settled(id: string): void {
  void OBR.broadcast
    .sendMessage(DICE_SETTLED_CHANNEL, { id }, { destination: 'LOCAL' })
    .catch(() => {
      // The panel's own cap covers this; there is nobody here to tell.
    });
}

/**
 * Build the box on first use, not on load.
 *
 * The renderer plus its textures is the largest thing this extension ships, and a
 * player who has animation switched off should never pay for it — hence the dynamic
 * import of this whole page, and hence not initialising WebGL until dice actually
 * arrive.
 */
function diceBox(): Promise<DiceBox> {
  if (!ready) {
    ready = (async () => {
      const created = new DiceBox(container, {
        ...TRAY_THEME,
        // Served from the same place as the manifest, which under GitHub Pages is
        // `/<repo>/` rather than a domain root — the same prefix problem the
        // `manifestBase()` plugin fixes for the manifest.
        assetPath: `${import.meta.env.BASE_URL}dice/`,
      });
      await created.initialize();
      box = created;
      return created;
    })();
    ready.catch(() => {
      // Leave `ready` rejected: every caller is wrapped, and retrying a broken
      // WebGL context on every roll would be a slow leak rather than a recovery.
    });
  }
  return ready;
}

/**
 * Throw one player's dice from their own seat.
 *
 * The library builds its throw vector in `startClickThrow`, at random, and derives
 * the spawn point from that vector's sign — dice enter from the edge opposite the
 * direction of travel. Overriding it on the instance is therefore the whole of the
 * fixed-seat feature, and is why no fork of the package is needed.
 */
async function animate(thrown: DiceThrow): Promise<void> {
  const staged = waves(thrown.dice);
  if (!staged.length) {
    settled(thrown.id);
    return;
  }

  // Stop the idle teardown *before* the await, not after: building the box takes
  // long enough for the timer to fire and dispose the very box being awaited.
  clearTimeout(lingerTimer);
  clearTimeout(idleTimer);
  const active = await diceBox();

  const direction = jitter(seatVector(thrown.seat));
  // The method being replaced lives on the prototype, so there is no own property to
  // put back — the restore in `finally` deletes ours and lets the prototype's random
  // throw show through again. (Reaching for `getOwnPropertyDescriptor` here returns
  // undefined and quietly restores nothing.)
  //
  // A per-throw override rather than a subclass: the seat changes with whoever
  // rolled, and this instance is shared by everyone at the table.
  (active as unknown as { startClickThrow: (n: string) => unknown }).startClickThrow = function (
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
    const boost = (Math.random() + 3) * distance * self.strength;
    const thrownVectors = self.getNotationVectors(notationString, reach, boost, distance) as {
      vectors: { pos: { x: number; y: number; z: number } }[];
    };

    // One hand, one point of release. The library derives each die's spawn point
    // from its own randomised direction, so a trait die and its Wild Die could
    // enter from opposite ends of the same edge and read as two people rolling.
    // Overwriting every position with the first die's — after the library has
    // worked it out, so its aspect-ratio correction still applies — puts them all
    // in one hand while leaving their directions and spins untouched, which is what
    // makes them scatter on the way out.
    const first = thrownVectors.vectors[0]?.pos;
    if (first) {
      for (const vector of thrownVectors.vectors) {
        // A little height between them, or dice launched from one point start
        // interpenetrating and the solver flings them apart.
        vector.pos = { x: first.x, y: first.y, z: first.z + (vector.pos.z - first.z) * 0.25 };
      }
    }
    return thrownVectors;
  };

  try {
    // Only when it actually changes. `updateConfig` rebuilds materials, and a table
    // where the same player rolls five times in a round should not pay for that
    // five times to arrive at the same colour.
    const wanted = colourset(thrown.colour);
    if (wanted.background !== shownColour) {
      await active.updateConfig({ theme_customColorset: wanted });
      shownColour = wanted.background;
    }

    for (const [index, wave] of staged.entries()) {
      const results =
        index === 0
          ? (await active.roll(notation(wave))).sets.flatMap((set) => set.rolls)
          : await active.add(notation(wave));
      try {
        decorate(active, wave, results);
        // The dice that bought another one flare where they lie, and the beat that
        // follows is that flare: cause, then effect, rather than two throws in a row.
        for (const [at, die] of inNotationOrder(wave).entries()) {
          if (!acedIn(wave, staged[index + 1]).has(die.chain)) continue;
          const shown = results[at];
          if (shown) flare(active, shown.id, die.value, ACE_BEAT_MS);
        }
      } catch (error) {
        // An effect is the least important thing on this page.
        console.warn('dice effect failed', error);
      }
      // A deliberate pause, not a wait on anything: the whole chain was rolled
      // before this page heard about it.
      if (staged[index + 1]) await sleep(ACE_BEAT_MS);
    }
  } finally {
    delete (active as unknown as { startClickThrow?: unknown }).startClickThrow;
    settled(thrown.id);
    lingerTimer = setTimeout(() => active.clearDice(), LINGER_MS);
    idleTimer = setTimeout(teardown, IDLE_MS);
  }
}

/**
 * Give the GPU back when nothing has been rolled for a while.
 *
 * The renderer goes, **not the page**. Closing the modal was the first design and
 * it is wrong: this page is what listens for dice, so a torn-down overlay would
 * miss the very message that should bring it back, and the panel would have to
 * reopen the modal and then re-send a throw it had already sent. Keeping the page —
 * a transparent div and one broadcast listener — costs nothing, and the animation
 * loop stops on its own once the dice settle, so what is actually worth reclaiming
 * is the WebGL context. The next throw builds a new box.
 */
function teardown(): void {
  const going = box;
  box = undefined;
  ready = undefined;
  // The next box starts with no colourset loaded, so the cache above has to forget
  // what this one had or the first throw after an idle spell would come out bone.
  shownColour = undefined;
  try {
    going?.clearDice();
    // Not in the published types, but it is a `THREE.WebGLRenderer` underneath and
    // dropping the canvas without disposing leaks the context — browsers cap how
    // many a tab may hold, and a long session is a lot of rolls.
    (going as unknown as { renderer?: { dispose?: () => void } } | undefined)?.renderer?.dispose?.();
    container.replaceChildren();
  } catch (error) {
    console.warn('could not release the dice renderer', error);
  }
}

OBR.onReady(() => {
  OBR.broadcast.onMessage(DICE_CHANNEL, (event) => {
    if (!isDiceThrow(event.data)) return;
    const thrown = event.data;
    // Serialised rather than concurrent: one tray, and two throws at once would
    // fight over the felt and over the colourset.
    queue = queue
      .then(() => animate(thrown))
      .catch((error: unknown) => {
        console.warn('dice tray failed', error);
        // The result must not wait on a renderer that has given up.
        settled(thrown.id);
      });
  });
});
