# Animated dice — plan

Written 2026-08-17. Read `HANDOFF.md` and `OBR-DEADLANDS-PLAN.md` first.

**Status, same day:** milestones 2–5 are built and pushed — the tap, the tray, the staged explosion,
seats, the switch. Milestone 1's spikes are *not* done, because every one of them needs a browser and
a room; `dice-spike.html` exists to answer the library half of them without Owlbear. Read the
milestone list as a checklist of what to verify, not of what to write. Where the code as built
departed from the design below, the text says so rather than being quietly corrected.

Paul's requirements, which the rest of this answers:

1. **Optional** — off by default is arguable, but off must be a real switch: instant result straight
   to the log, no WebGL at all.
2. **A physical simulation**, using an existing implementation rather than a hand-rolled one.
3. **Exploding dice must animate**, with a short pause before the extra die is thrown.
4. **A fixed throwing position per player**, persistent across sessions and maps — Marshal from the
   top, players in from the sides.
5. **Hook into the ecosystem** where possible, including for custom dice.

---

## 1. The decision everything else depends on: who decides the numbers

There are exactly two architectures, and they are not a matter of taste.

**A. The engine decides, the physics performs.** `JavaRandom` produces the dice as it does today;
the tray is told what to show and animates dice that land on those values.

**B. The physics decides, the engine consumes.** The simulation *is* the random number generator.
This is what the official Owlbear Rodeo dice extension does — Rapier is deterministic, so every
client can run the same simulation from the same initial parameters and agree on the result without
anyone transmitting a number.

**Take A.** Two reasons, both load-bearing:

- **The conformance corpus is this project's premise.** Every roll in the VTT goes through the same
  bit-identical engine as every roll in Discord, which is why the two cannot drift. Under B the dice
  in OBR would be produced by a physics engine and the corpus would no longer describe what happens
  at the table. The tested thing would stop being the thing in use.
- **Explosions are synchronous and physics is not.** `Roller.roll()` decides whether to roll again
  the instant it sees a max value, in a `for(;;)` loop against a synchronous `nextInt`. Feeding it
  physics results means either an async evaluator (a rewrite of the conformance-critical path) or
  pre-rolling a queue of physics dice and hoping the count is right. Both are worse than animating a
  number that is already known.

B is the more romantic option — "the dice really decide" — and it is the wrong one here. Note that A
does *not* mean the animation is a lie: see §2, where the die genuinely comes to rest showing the
value the engine rolled.

A second consequence of A, in our favour: since one client owns the roll, cross-client agreement is
already solved by the existing broadcast. No deterministic-simulation lockstep to get wrong.

---

## 2. The renderer — verified, not assumed

Checked by unpacking the published tarballs on 2026-08-17, because the READMEs on GitHub and the npm
pages were both unreachable behind rate limits and Cloudflare.

| | `@3d-dice/dice-box` | `@3d-dice/dice-box-threejs` | `@drdreo/dice-box-threejs` | dddice |
|---|---|---|---|---|
| Engine | Babylon + ammo (WASM) | three 0.143 + cannon-es | three + cannon-es | hosted service |
| Predetermined values | **no** | **yes** (`@` notation) | **yes** | unclear |
| Add dice mid-roll | `add()` | **no** | **`add()`** | n/a |
| Types | — | — | **TS types shipped** | SDK |
| Licence | MIT | MIT | MIT | MIT SDK, hosted |
| Latest | 1.1.4 (2024) | 0.0.12 (2022) | 1.1.0 | — |

**Decision: `@drdreo/dice-box-threejs`.** It is the only candidate that has both halves of what we
need. `@3d-dice/dice-box` is the better-maintained library and cannot show a predetermined value at
all; the original `dice-box-threejs` can, but cannot add dice to a tray that already has some in it,
which is requirement 3.

### Two different meanings of "use something existing"

Worth separating, because the answer differs:

- **A renderer we bundle** — an npm package that draws dice inside a canvas we own. **Available, and
  it is what we are doing.** We write no physics, no dice geometry, no number textures, no camera or
  lighting, and no face-swap trick.
- **Another OBR dice extension we delegate to** — Owlbear's own, or Seamus's, or dddice. **Not
  available**, and §1 is exactly why: they decide their own numbers and expose no inbound "show these
  values" contract. Under engine-decides there is nothing to delegate.

So "roll our own" applies only to the ~few hundred lines of glue that are specific to us anyway: the
tray page, the `DiceTray` wrapper, turning `DieEvent[]` into notation, the seat vector, reveal timing,
and the settings. None of the hard graphics work.

### Dependency risk, stated plainly

Single maintainer, a fork of a fork of a 2015 dice roller; latest release 1.1.0, May 2025. Mitigating
facts: MIT; `three` and `cannon-es` are **peer** dependencies (`three ^0.176`, `cannon-es ^0.20`), so
we control the versions rather than inheriting the 2022 `three 0.143` the upstream package pinned;
and `dist/` is a single ES module that can be vendored and pinned if the package is ever abandoned.

Fallback ladder if the spikes go badly, in order of cost: (1) this fork; (2) the original
`@3d-dice/dice-box-threejs` plus our own `add()`, which is the ~30 lines the fork added; (3)
`@3d-dice/dice-box` plus implementing the pre-simulate-and-swap ourselves; (4) three + Rapier from
scratch, which is weeks and is not on the table.

### Why predetermined values are honest here

Worth writing down, because "forced results" can mean two very different things. The implementation
found in the bundle: the throw is **pre-simulated headlessly** (`simulateThrow()` steps the physics
world to rest with no rendering), the resting value is read, and if it differs from the required one
`swapDiceFace()` **exchanges the two faces' material indices** on a clone of the geometry before the
animation is played back. The die that rolls across the screen is a real rigid body tumbling under
real physics, and the face pointing up when it stops really does read what the log says. It is not a
post-hoc rewrite of the reported number — that version would put a 3 on screen and an 8 in the log,
and would be worth rejecting the whole feature over.

`add()` in the drdreo fork runs the same path for the appended dice (`simulateThrow`, then
`swapDiceFace` per predetermined value), so staged explosions keep the guarantee.

### What we get for free, and what needs a patch

- **Free:** `assetPath` config (see §7), `theme_colorset` / `theme_texture` / `theme_customColorset`,
  `onRollComplete` / `onAddDiceComplete`, `remove()`, per-die `screenPosition` in results (a future
  hook for drawing a label beside a die), optional collision sounds.
- **Needs a patch, one method:** the throw comes from `startClickThrow()`, which builds a random
  direction vector and derives the spawn point from its sign — dice enter from the edge opposite the
  throw direction. Requirement 4 is therefore an override of that one public method on the instance:
  build the vector from a fixed seat angle plus small jitter. No fork of the package needed.

Wrap it all behind a small `DiceTray` interface of our own (`show(dice, seat)`, `add(dice)`,
`clear()`). Two reasons: the library is a one-maintainer fork of a fork of a 2015 dice roller, and if
it needs replacing that should be one file; and it keeps dddice available as an alternative backend
later without touching the roll path.

### On the ecosystem hook (requirement 5)

The honest finding is that there is no contract to hook into for what we need. The official
extension and Seamus Finlayson's both generate their own numbers from deterministic physics; neither
documents an inbound "display these values" API, which is precisely the thing an engine-decides
architecture requires. dddice embeds its own room UI in a popover and its docs describe manual
rolling only. So:

- **Now:** custom dice means colorsets, textures and materials through `theme_*` — enough for a
  Deadlands look (bone, weathered wood, gunmetal), not new geometry.
- **Later, cheap:** `DiceTray` is the seam. If dddice turns out to accept externally-valued rolls, or
  Seamus's inter-extension messages turn out to carry values, it becomes a second implementation.
  Note `dice-extension` is **GPL-3.0**: read its message format if useful, copy no code.

---

## 3. Where the dice are drawn

Verified in the SDK typings (`lib/types/Modal.d.ts`): a modal takes `fullScreen`, `hideBackdrop`,
`hidePaper` **and `disablePointerEvents`**. That combination is a transparent, full-window,
click-through iframe over the map — which is exactly a dice tray, and matches dddice's description of
dice appearing "on top of your maps". No item, no scene metadata, nothing persisted, nothing that
costs anything against the ~15kB room budget.

So: a new page, `extension/dice.html` + `src/dice/tray.ts`, added to the Vite `rollupOptions.input`
beside `index.html` and `probe.html`. It runs its own `OBR.onReady`, subscribes to the roll channel
itself, and is otherwise independent of the panel.

**Spike 1 — modal lifetime.** Does a modal opened from the action popover survive the popover being
closed? If yes, the panel opens the tray once on ready and there is nothing more to build. If no, the
tray needs a manifest `background` page (the OBR docs mention a background page url; the field could
not be confirmed directly — docs are behind Cloudflare and GitHub raw was rate-limited, so this is
`!!` unverified). Test before designing around it, because the two answers have very different
amounts of work behind them.

Consequence either way: **a player with the extension closed sees no dice**. That is acceptable and
should be documented rather than engineered around.

---

## 4. Getting real dice out of the engine

Today a roll yields one string: `s8+1: [7; w3] +1 = **8**`. The tray needs `(sides, value)` pairs,
grouped into explosion chains, with the Wild Die distinguishable.

**Do not parse the explanation, and do not tap `nextInt`.** Tap `Roller.roll(facetsCount,
isOpenEnded)` — that `for(;;)` loop *is* the explosion chain, so the structure the animation needs
already exists at that point and nothing downstream has to re-derive "value equalled sides, so the
next die must be its ace". An optional observer on `Roller`:

```ts
export interface DieEvent {
  sides: number;
  value: number;
  /** Which chain this die belongs to; an ace and its follow-up share one. */
  chain: number;
  /** 0 for the first die of a chain, 1 for the die its ace bought, and so on. */
  step: number;
  /** 'wild' for the Wild Die, 'trait' for the ability dice, 'plain' otherwise. */
  role: 'trait' | 'wild' | 'plain';
}
```

`role` is set by `rollSavageWorlds` around the phases it already separates; everything else is
mechanical. The observer is **passive** — it must not call the RNG, must not reorder anything, must
not throw. The proof that it is non-breaking is the corpus: byte-identical output before and after,
because the sequence of `nextInt` calls is untouched. That is a test we already have.

**How it reaches the `Roller`** (checked, so this is not hand-waving): `Roller` is built in exactly
two places, `evaluator.ts:68` and `interpreter.ts:93`, both from `context.random`. So the route is an
optional second parameter on `CommandContext` (`evaluator.ts:26`, whose `random` is already
defaulted) threaded into both. Nothing in `src/bot/` changes — `new CommandContext(random)` keeps
meaning what it means today — and `Roller`'s own second parameter is optional, so the Discord path
never constructs an observer.

Two caveats to write into the code:

- `rollDF()` (Fudge dice) calls `nextInt(3)` and has no `rollDie` behind it. Tag it explicitly or
  exclude it — an untagged tap would ask the tray to render a d3, which does not exist in the box.
- **Struck-out dice cannot be reported from this tap, and v1 will not dim them.** Dice that are
  rolled and then discarded (`rollAndKeep`, `rollWegD6`, the dropped die in every Savage Worlds trait
  roll) still happened and should still be thrown, so they *are* emitted — but keptness is decided
  *after* every `roll()` has returned, by position in an array the caller sorts. It is not knowable
  at the tap point. The options are to drop dimming from v1, or to have the roller emit a second,
  chain-keyed keptness report after the sort. **Take the first**: the interesting thing to look at on
  a trait roll is which die aced, and that the tap does know. Revisit if the dropped die turns out to
  be confusing on screen.

The dice then travel on their own channel — see §5, which is where the interesting problem is.

---

## 5. Reveal timing — a decision, not an accident

If `publish()` renders the log line immediately, the answer is on screen in text while the dice are
still tumbling. The animation becomes a spoiler of a result the reader has already had, and the
staged explosion of requirement 3 is wasted.

**Decision: reveal is local.** Each client holds back **its own rendering of that line** until **its
own tray settles**. No client waits on another client's frame rate and there is no ordering problem to
get wrong.

**But the dice cannot ride on the existing roll broadcast**, and this is the one place the existing
design actively gets in the way. `publish()` sends with `{ destination: 'REMOTE' }` (`panel.ts:192`)
— deliberately, because the roller has already added the entry locally. So a `dice` field on
`RollEntry` would animate on every client *except the one who rolled*, which is precisely backwards.
Secret rolls are worse: never broadcast at all, so they would have no path to a tray whatsoever.

So: a **separate `DICE_CHANNEL`**, sent so that the local client is included, carrying
`{ id, dice, seat, colour }` — the roll id ties it to the log entry the panel already published.
Secret rolls send on this channel too, but local-only, which is what makes "the Marshal's hidden roll
throws dice on the Marshal's screen and nobody else's" true rather than aspirational.

`RollEntry` gains **one boolean**, `animated`, and nothing else: the hint that dice are coming for
this id. It is not the payload, and it is not optional to have — a receiving client that cannot tell
whether a line is going to be animated has to either print every line at once (spoiling every
animation) or delay every line against the chance that dice are on their way. Built as delivered.

**Spike 1 must also test this**: OBR's local delivery has to reach a **sibling iframe** of the same
extension (panel → tray), not merely the sending frame. If it does not, the tray cannot be a separate
page driven by broadcast, and the fallbacks are a `window.postMessage` bridge from the panel to the
modal or moving the tray inside the panel — a plan-level change, hence a spike and not a detail.

The rest falls out correctly:

- Animation off ⇒ nothing to wait for ⇒ the line appears instantly, which is exactly requirement 1.
- A stalled or failed tray must not swallow a result. Reveal anyway after a hard cap (~6s), and on
  any tray error reveal immediately and log to console. **The log is the source of truth; the tray is
  decoration.** No code path may make a result depend on WebGL working.

Staging within one roll: throw the chain's first dice, then on each `step > 0` wait ~400ms and
`add()` the die the ace bought. Since the whole chain is known up front, the pause is a deliberate
beat rather than a wait on anything.

---

## 6. Seats

**Seats are screen space, not map space.** "The Marshal rolls from the top" means the top of each
viewer's own window; the tray has no relationship to the map's coordinates or anyone's viewport.

Assignment: the GM takes the top. Players are spread over the remaining edges — left, right, bottom,
then the corners — in a stable order, so the same four people get the same four seats every week. A
seat is a direction; the throw vector is that direction plus a few degrees of jitter, so two rolls
from the same player are not identical.

Persistence: room metadata, keyed by player id, next to the existing `com.savagebot/mine/<id>` key —
that mechanism is already the precedent for "per-player, survives a tab close" and `panel.ts` records
that player metadata does *not* survive one (measured, milestone 0). A seat letter and an on/off flag
per player is tens of bytes; this is not a budget risk. **`!!` The stability of `OBR.player.id`
across sessions is assumed, not measured** — the existing `mine/` key already depends on it, so if
the assumption is wrong both features are, and the fix for both is to key on player name instead.

Colour: tint each player's dice with their OBR party colour, which is free identity information and
means you can tell whose dice those are without reading anything.

---

## 7. The unglamorous constraints

- **Assets.** Textures and sounds have to be copied into `extension/public/` and reached through the
  library's `assetPath`, which must carry the `/<repo>/` Pages prefix. Same class of bug the
  `manifestBase()` plugin in `vite.config.ts` already fixes for the manifest — cite that precedent
  and derive `assetPath` from `import.meta.env.BASE_URL` rather than hardcoding.
- **Weight.** The dist is ~3.6MB with assets, against a panel bundle that is currently small. It
  belongs to `dice.html` only, so a player with animation off pays nothing: dynamic `import()` inside
  the tray page, never a static import from `panel.ts`.
- **Teardown — and the correction to it.** The first design closed the modal after a quiet period.
  That is wrong, and the reason is worth keeping: the overlay page is *what listens for dice*, so a
  torn-down tray would miss the very message that should bring it back, and the panel would have to
  reopen the modal and then re-send a throw it had already sent. As built, the **renderer** is
  disposed after three minutes idle and the **page stays** — a transparent div and one listener,
  costing nothing, with the WebGL context reclaimed and rebuilt lazily on the next throw. Three
  minutes rather than thirty seconds because a fight is several rolls a minute and rebuilding between
  rounds would trade a GPU context for a stutter at the worst moment.
- **Sound off by default.** Four clatter tracks over Discord voice is not a feature.
- **Simultaneous rolls.** Two players rolling at once share one tray per client. Simplest correct
  behaviour: `clear()` when a new roll arrives and the previous one has settled; queue if it has not.
  Do not attempt to keep two rolls on screen at once in the first version.

---

## 8. Milestones

1. **Spikes** (half a day, no product code). Any one of these failing changes the plan, so they come
   before anything else:
   - **Clicks pass through the overlay.** The first thing to check and the worst thing to get wrong:
     the tray covers the whole window, the popover included. If OBR stacks a modal above a popover and
     `disablePointerEvents` does not fully pass clicks through, then switching dice *on* makes the
     panel unclickable and the map undraggable — which is far worse than no animation. `pointer-events:
     none` on `body` and `#tray` is belt and braces on our side and cannot help if the host container
     captures. Open the tray, then roll from the panel and drag a token.
   - **Modal lifetime** across the popover closing (§3).
   - **Local broadcast delivery to a sibling iframe**, panel → tray (§5).
   - **Predetermined values across mixed sets.** Not `4d6@6,6,1,2`: every trait roll is a d8 *and* a
     d6 Wild Die, so the question is whether per-die values survive more than one set —
     `1d8@7+1d6@3` — and whether the result list is aligned flat across sets or per set. The minified
     `getNotationVectors` iterates `set` while indexing `result` by vector, which *suggests* flat, but
     that is inference from a bundle rather than a test. Then `add("1d8@8")` on top of a settled tray,
     which is the staged explosion in miniature.
   - **`startClickThrow` overridden** to throw from a fixed edge (§6).
   - **A d4**, which takes the separate `swapDiceFace_D4` path (§9).
2. **The tap** (§4): observer on `Roller`, threaded through `CommandContext`, plus `DieEvent` and the
   `DICE_CHANNEL` payload and its guard. Tests: the corpus unchanged byte-for-byte; a `s8` that aces
   produces one chain of two `role: 'trait'` dice; the Wild Die is tagged `wild`; a dropped die is
   still emitted; Fudge does not emit a d3.
3. **The tray** (§3, §2): `dice.html`, the `DiceTray` interface, one implementation, dice on screen
   for a roll made in the panel. Reveal still immediate.
4. **Reveal and staging** (§5): held reveal, the 400ms explosion beat, the hard cap and the
   error path.
5. **Seats and the switch** (§6, §1): per-player seat and on/off in room metadata, a small block in
   the Table pane for the Marshal to reassign seats, party-colour tinting.
6. **Polish:** Deadlands colorset, optional sounds, idle teardown.

Nothing before milestone 3 changes anything a player sees, and milestone 2 is independently useful:
structured dice are what a future "which die aced?" display in the log would want anyway.

## 9. Open questions

- **`!!` The manifest `background` field** — name and semantics unconfirmed (§3). Spike 1 may make it
  moot.
- **`!!` `OBR.player.id` stability across sessions** (§6).
- Mobile and low-end laptop performance is unmeasured. The switch in §1 is the mitigation, but the
  default state for a new player should probably be *off* until it has been seen on Damian's machine.
- d4 handling in the library takes a separate code path (`swapDiceFace_D4`, arithmetic on material
  indices rather than a swap). Hence its own spike at milestone 1 — untrained rolls are d4 and common.
- Whether the dropped die on a trait roll reads as confusing when nothing distinguishes it (§4).
  Only watching a real fight will say.
- Does `add()` behave when the tray has been idled out and torn down mid-chain? Guard it.
