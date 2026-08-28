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
import {
  TRAY_THEME,
  applyPhysics,
  colourset,
  decorate,
  evenLabelSizes,
  flare,
  levelDice,
} from './effects.js';
import {
  BENNY_CHANNEL,
  LANDING,
  REACH,
  isBennyToss,
  screenPoint,
  tossPath,
  type BennyToss,
} from '../../src/obr/bennyToss.js';
import { atRest, launch, step, wallsFor, type Chip } from '../../src/obr/chipPhysics.js';
import { assignPlaces, relativeVector, storedPlaces } from '../../src/obr/seats.js';
import { aimThrow } from './throwing.js';

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
const chipLayer = document.getElementById('chips') as HTMLDivElement;

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
 * This viewer's own chair.
 *
 * A throw says where the *roller* sits; turning that into a direction on this screen
 * needs to know where the reader sits, and this page is its own iframe with its own
 * `OBR.onReady` — the panel's copy is not reachable from here.
 *
 * **Worked out, not read.** Reading `place/<me>` straight out of the room was the first
 * version and it is wrong: the stored value is only written by the Marshal's client, and
 * `refreshPlaces` deliberately skips that write when the room is nearly full. The tray
 * would then fall back to chair 0 while the panel used the computed one, and the single
 * thing this feature promises — *your own dice come from the bottom of your own screen* —
 * would quietly stop being true for anyone not actually sitting at chair 0. Running the
 * same deterministic `assignPlaces` over the same inputs cannot drift from the panel.
 *
 * Held as a promise rather than a number, and awaited inside `animate`, because the
 * first throw can easily arrive before the first read comes back. Awaiting costs
 * nothing: throws are already serialised through a promise chain.
 */
let myPlace: Promise<number> | undefined;

function readMyPlace(): Promise<number> {
  myPlace ??= Promise.all([OBR.party.getPlayers(), OBR.room.getMetadata()])
    .then(([others, metadata]) => {
      // `getPlayers` is everyone *else*, so this client is added by hand — exactly as
      // the panel does it, or the two would be resolving different tables.
      const party = [{ id: OBR.player.id }, ...others.map((player) => ({ id: player.id }))];
      return assignPlaces(party, storedPlaces(metadata as Record<string, unknown>))[
        OBR.player.id
      ] ?? 0;
    })
    .catch(() => 0);
  return myPlace;
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
      // Before `initialize()`, because it changes the size of materials that are
      // built on first use and then cached.
      evenLabelSizes(created);
      // Every physical parameter, derived from a real 16mm die — see `PHYSICS`.
      applyPhysics(created);
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
 * Throw one player's dice in from where they are sitting, as seen from here.
 *
 * The library builds its throw vector in `startClickThrow`, at random, and derives
 * the spawn point from that vector's sign — dice enter from the edge opposite the
 * direction of travel. Overriding it on the instance is therefore the whole of the
 * fixed-direction feature, and is why no fork of the package is needed.
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
  applyPhysics(active);

  // My own rolls come from the bottom of my screen, and everyone else's from where
  // they sit relative to me.
  const restoreThrow = aimThrow(
    active,
    relativeVector(await readMyPlace(), thrown.place, thrown.places),
  );

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
        // Before anything else looks at the dice: a die that stopped on an edge is
        // tipped onto the face the result refers to, so the flare below lights the
        // face you are actually reading.
        levelDice(active);
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
    restoreThrow();
    settled(thrown.id);
    lingerTimer = setTimeout(() => active.clearDice(), LINGER_MS);
    idleTimer = setTimeout(teardown, IDLE_MS);
  }
}

/**
 * Chips on the felt at once. "Bennies all round" is six messages in a breath, and a
 * table that leaves a page open all session should not accumulate divs.
 */
const MAX_CHIPS = 12;
/** How long a chip lies there once it has run out, before it fades. */
const CHIP_LINGER_MS = 900;
/** A backstop on a chip that somehow never settles. Nothing should reach it. */
const CHIP_LIFE_MS = 8_000;

/**
 * The step the simulation is tuned at.
 *
 * Fixed, and part of the tuning rather than an implementation detail — the same
 * lesson `timestep()` records for the dice. Displays run at 60Hz, 120Hz and, on a
 * laptop dropping frames, whatever they can manage; stepping by the frame time would
 * make the chip behave differently on each of them.
 */
const CHIP_STEP = 1 / 240;
/**
 * The most simulation one frame may ask for. A backgrounded tab comes back with a
 * `dt` of minutes, and an uncapped accumulator would run a quarter of a million
 * substeps in one frame and hang the overlay. Better that the chip loses the time.
 */
const MAX_CATCHUP = CHIP_STEP * 12;

interface LiveChip {
  body: Chip;
  el: HTMLDivElement;
  /** When it stopped, so it can lie there a moment before fading. */
  restedAt?: number;
  bornAt: number;
}

const live = new Set<LiveChip>();
let frame: number | undefined;
let lastFrame = 0;

/** Half the chip's drawn width, read off the element so CSS stays the one source. */
function radiusOf(el: HTMLElement): number {
  return (el.offsetWidth || 46) / 2;
}

function draw(chip: LiveChip): void {
  const { x, y, angle } = chip.body;
  // The body's `x, y` is the chip's *centre*, and an element is positioned by its
  // corner, so the half-width comes off in the transform rather than as a margin —
  // which keeps the size a thing only the stylesheet knows.
  chip.el.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) rotate(${angle}rad)`;
}

/**
 * One loop for every chip on the table, not one per chip.
 *
 * "Bennies all round" would otherwise be six `requestAnimationFrame` loops each
 * writing a transform, which tear against each other and do six times the layout
 * work for one frame of animation. The loop stops itself when the felt is clear.
 */
function tick(now: number): void {
  frame = undefined;
  const dt = Math.min((now - lastFrame) / 1000, MAX_CATCHUP);
  lastFrame = now;

  // Read every frame rather than captured at launch: a window resized mid-slide
  // would otherwise leave the chip outside its own walls, colliding continuously.
  const width = window.innerWidth;
  const height = window.innerHeight;

  for (const chip of live) {
    if (chip.restedAt === undefined) {
      const walls = wallsFor(width, height, chip.body.radius);
      let remaining = dt;
      while (remaining > 0) {
        const slice = Math.min(CHIP_STEP, remaining);
        step(chip.body, slice, walls);
        remaining -= slice;
      }
      draw(chip);
      if (atRest(chip.body) || now - chip.bornAt > CHIP_LIFE_MS) {
        chip.restedAt = now;
        // The fade is a CSS transition, because a fade is not motion and there is
        // nothing to simulate about one.
        chip.el.style.transition = `opacity 400ms ease-in ${CHIP_LINGER_MS}ms`;
        chip.el.style.opacity = '0';
      }
    } else if (now - chip.restedAt > CHIP_LINGER_MS + 400) {
      chip.el.remove();
      live.delete(chip);
    }
  }

  if (live.size) frame = requestAnimationFrame(tick);
}

function run(): void {
  if (frame !== undefined) return;
  lastFrame = performance.now();
  frame = requestAnimationFrame(tick);
}

/**
 * Slide a Benny across the table.
 *
 * The motion is simulated, not choreographed: `chipPhysics` integrates a rigid disc
 * under friction against the four walls of the window, and this writes the result
 * onto a transform every frame. The div is the *renderer* — nothing about the path
 * comes from CSS, which is why a chip that clips a wall spins up and walks off it
 * rather than replaying a curve somebody drew.
 *
 * Still not in the three.js scene, and for the reason that has not changed: a chip on
 * felt has no interesting third axis, so all of the physics worth having is planar and
 * fits in a hundred tested lines, where a mesh and a collider in a world the dice
 * library owns and does not expose would be neither.
 *
 * Deliberately **not** gated on `prefers-reduced-motion`. It was, for one deploy, and
 * it cost the whole feature: the Marshal's Mac had Reduce Motion on, so the chip
 * silently did nothing on every window of that machine while the dice — which have
 * never consulted the setting — rolled as usual. Honouring it in one of two moving
 * things on screen is not honouring it, it is an undiscoverable off-switch. The dice
 * toggle turns the whole overlay off, and that is a control the table can find.
 *
 * Nothing here may throw into the caller: a chip is decoration on top of decoration,
 * and the Benny itself was banked and logged before this message was sent.
 */
function slideChip(toss: BennyToss, mine: number): void {
  const path = tossPath(mine, toss);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const point = (p: { left: number; top: number }): { x: number; y: number } => ({
    x: (p.left / 100) * width,
    y: (p.top / 100) * height,
  });

  const el = document.createElement('div');
  el.className = 'chip';
  chipLayer.append(el);
  const radius = radiusOf(el);

  const body = launch({
    // Launched from beyond the border and aimed at a spot inside it, so it enters the
    // window rather than appearing in it, and finishes where it can be seen.
    from: point(screenPoint(path.from, REACH)),
    to: point(screenPoint(path.to, LANDING)),
    radius,
  });
  const chip: LiveChip = { body, el, bornAt: performance.now() };
  draw(chip);
  live.add(chip);

  while (live.size > MAX_CHIPS) {
    const oldest = live.values().next().value;
    if (!oldest) break;
    oldest.el.remove();
    live.delete(oldest);
  }
  run();
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
  // Both inputs can change under us: the party when somebody joins, the room when the
  // Marshal's client writes the places out.
  const recompute = (): void => {
    myPlace = undefined;
    void readMyPlace();
  };
  recompute();
  OBR.room.onMetadataChange(recompute);
  OBR.party.onChange(recompute);

  // Not queued behind the dice. A Benny is often handed over *because* of the roll
  // being animated, and holding the chip until the dice settle would put the reward
  // a beat after the moment it belongs to.
  OBR.broadcast.onMessage(BENNY_CHANNEL, (event) => {
    if (!isBennyToss(event.data)) return;
    const toss = event.data;
    void readMyPlace()
      .then((mine) => slideChip(toss, mine))
      .catch((error: unknown) => {
        console.warn('could not slide a Benny', error);
      });
  });

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
