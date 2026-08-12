# Owlbear Rodeo × Discord integration — research & plan

Written 2026-08-12. Companion to `HANDOFF.md`. Research verified against the OBR SDK source
(`github.com/owlbear-rodeo/sdk`) and this repo's own code, not just docs — `docs.owlbear.rodeo`
returns 403 to automated fetches, so API claims below come from the TypeScript sources.

Target pairing: Discord channel
`https://canary.discord.com/channels/1007423179746201671/1534124646624923668`
(guild `1007423179746201671`, channel `1534124646624923668`) ↔ one OBR room.

---

## 1. The constraint that determines the whole design

**Owlbear Rodeo extensions are pure client-side web apps.** An extension is a `manifest.json` at a
public URL; OBR loads it in an iframe inside the player's browser. The full SDK surface is
`Action, Assets, Broadcast, ContextMenu, Interaction, Modal, Notification, Party, Player, Popover,
Room, Theme, Tool, Viewport, Scene` — every one of them is a client-side API.

There is **no server-side OBR API, no REST endpoint, and no webhook receiver.** Nothing outside a
connected browser can push data into a room.

Two consequences:

- **OBR → Discord is easy.** The extension can make outbound HTTPS calls. The existing `Rumble!`
  extension already POSTs to a Discord webhook URL stored in room metadata — proof the pattern
  works from inside the iframe sandbox.
- **Discord → OBR requires a relay.** A server the extension holds an open connection to
  (WebSocket or SSE). The bot pushes to the relay; the relay fans out to connected OBR clients.
  There is no way around this.

Also from `BroadcastApi.ts`: `sendMessage(channel, data, {destination: "LOCAL"|"REMOTE"|"ALL"})`
and `onMessage(channel, cb)` where the callback receives a `connectionId`. Broadcast is
**connection-scoped and ephemeral** — it reaches only clients connected *right now* and persists
nothing. So broadcast is the right transport for live fan-out inside a room, and the wrong place
to store a roll log.

`RoomApi.ts` exposes `getMetadata / setMetadata / onMetadataChange` and permissions. Room metadata
persists. Commonly cited as capped around 16kB — **unverified**, the source documents no limit.
Doesn't matter: it should hold exactly one thing (the pairing token), because a roll log grows
without bound and must be readable by clients that were offline when it happened.

---

## 1b. How client-only extensions have shared state (added 2026-08-12)

**OBR itself is the server.** Extensions read and write OBR's own synced stores; OBR replicates to
every connected client. Four writable shared stores, each with an `onChange` subscription: **room
metadata** (room-scoped, persistent), **scene metadata** (scene-scoped, persistent), **item
metadata** (per token, persists with the scene), **player metadata** (per player). Plus
`broadcast` (ephemeral) and `scene.local` (non-synced counterpart — **sync semantics unverified**).

`SceneItemsApi.updateItems` uses **Immer draft mutation and sends only changed fields as patches**,
so two clients editing different fields of one token do not clobber each other.

Four constraints follow, and they shape every design:

1. **No trusted authority** — no secrets, no authoritative RNG, no anti-cheat. Any client can write
   any value; `getRole()` makes "GM-only" a UI convention, not security.
2. **Last-write-wins on the same field** — prefer per-owner keys over shared mutable counters.
3. **No background execution** — nothing runs when the room is closed.
4. **Every client runs your code** — N clients reacting to one event produce N duplicate writes.
   Use **leader election** (GM's client, or lowest `connectionId`). Build it in from the start.

### Scope change: the relay is deferred

Paul has deprioritised the Discord↔OBR shared log and syncing. **That removes the only reason for
a server.** The extension becomes pure static hosting (`manifest.json` on Cloudflare Pages or
Netlify, free) — no VPS, no Caddy, no pairing token, no Redis on the OBR side. §2 and §3 below are
therefore **deferred, not deleted**; revisit them if the Discord bridge returns.

The TypeScript dice engine compiles straight to the browser, so the extension gets the
conformance-verified engine locally with no round trip.

### Savage Worlds feature tiers

- **Tier 1 — sheet and state on the token.** Traits, Parry, Toughness+armour, Pace, Wounds,
  Fatigue, Wild Card vs Extra in item metadata; token badges for wounds and status; initiative card
  on the token.
- **Tier 2 — the rules loop.** One-click trait rolls with the right Wild Die; damage vs Toughness
  applying Shaken/wounds with raises; Soak (benny + Vigor); benny economy; initiative
  deal/round/joker reshuffle; multi-action penalty.
- **Tier 3 — what only a VTT can do** (needs token positions): gang-up bonus from adjacency, range
  penalties from measured distance, blast templates resolving who is underneath, cover/illumination.
- **Tier 4 — long tail.** Chase and Dramatic Task trackers, Power Points, Conviction, Support/Test.

**Recommended first slice: Tier 1 + the initiative panel.** Exercises all four state stores and
forces the leader-election decision early.

## 2. Hosting — DEFERRED (see §1b); prerequisite only if the relay returns

`HANDOFF.md` lists "self-host on what?" as optional. This plan makes it blocking:

- The extension needs a **public HTTPS static host** for `manifest.json` + assets.
- The relay needs a **public WSS/HTTPS endpoint**. `localhost` works for Paul only; every other
  player's browser needs a real hostname and a valid cert.

**Recommendation:** one small VPS running bot + relay behind **Caddy** (automatic TLS), serving the
extension's static build from the same box. One hostname, one cert, one deploy.

**For development before committing to that:** a **Cloudflare Tunnel** gives a public HTTPS/WSS URL
onto the laptop — enough to install the extension in a real room and iterate.

**Redis moves from optional to required.** The bot is currently running against
`127.0.0.1 6379` with nothing listening, and `RedisClient` swallows the failure at `log.debug`
(verified: `RedisClient.java:66-73`). Bennies and initiative therefore do not survive a restart.
Tolerable for a chat command; not tolerable for a persistent per-player widget rendered on the map.
`docker run -d -p 6379:6379 redis` and pass real args.

---

## 3. Architecture

```
   Discord channel 1534124646624923668
            │  ▲
   gateway  │  │ bot posts
            ▼  │
      ┌───────────────┐        ┌──────────────┐
      │   Savage bot  │◄──────►│    Relay     │  WSS + HTTPS, public
      │  dice engine  │        │  fan-out +   │
      │  init / benny │        │  roll log    │
      └───────┬───────┘        └──────┬───────┘
              │                       │ WSS (pairing token)
        ┌─────▼─────┐          ┌──────▼────────────────────┐
        │   Redis   │          │  OBR extension (iframe)   │
        │  state +  │          │  log · dice · bennies ·   │
        │  roll log │          │  initiative               │
        └───────────┘          └───────────────────────────┘
```

**Pairing.** Don't rely on an OBR room ID (the SDK does not clearly expose one). Instead:
`/obr link` in Discord mints a long random token bound to that channel ID → GM pastes it into the
extension → extension stores it in **room metadata** and uses it to authenticate its relay
connection. Treat the token as a **secret**: it is the only thing authenticating an inbound
connection from the internet. Make it revocable (`/obr unlink`).

**Roll log** lives in the relay's Redis, not room metadata: unbounded growth, and clients that join
late need history. The extension fetches recent history over HTTPS on load, then subscribes for
live updates over WSS.

---

## 4. Should we rewrite off Java?

**Yes — to TypeScript. Recommended.** Not because Java is bad, but because of one specific
property no other choice has.

Sizing (measured, this repo): **10,802 lines** total main, of which the R2 dice engine is
**4,204 lines** across 47 files plus a **116-line** ANTLR grammar. Tests are **2,794 lines**.

**Why TypeScript specifically:**

1. **The OBR extension must be TS/JS regardless.** TS gives one language across bot, relay and
   extension.
2. **The dice engine can then run in the browser *and* on the server — the same code.** The OBR
   widget gets instant local feedback with no round trip, and it agrees with Discord by
   construction. This is strictly better than a relay-evaluates-everything design, and it is the
   decisive argument.
3. **ANTLR4 has a TypeScript target.** `R2.g4` (116 lines) is reusable near-verbatim; only the
   eval/explain layer ports.
4. **discord.js is actively maintained.** JDA is pinned at `5.0.0-alpha.18` — an alpha.
5. **Kills the dependency rot.** The jcenter → LavaPlayer → JitPack cascade documented in
   `HANDOFF.md` disappears (or becomes `@discordjs/voice` if music is kept).
6. **Restart speed** — `tsx watch` is sub-second against a full Maven rebuild. This was Paul's
   stated pain.

**Why not Python:** `discord.py` is mature and pleasant, but you'd run three languages, share no
code with the extension, and still reimplement the dice engine — losing the one benefit that
justifies the rewrite.

### Making the rewrite verifiable rather than risky

The dice engine is the well-tested part and encodes 4+ years of edge cases (Savage Worlds, Sword
World, Ironsworn, Fudge, Carcosa, WEG D6, D66, target numbers, raises, bounded expressions). A
blind port is how you lose that. Two properties make it safe:

- **`java.util.Random` is a precisely specified 48-bit LCG.** Reimplementing it in TypeScript is
  ~20 lines and yields **bit-identical** dice sequences for the same seed.
- The existing golden-string tests already use `new Random(0)` (verified:
  `TestR2Interpreter.java:939`). With an identical PRNG they port directly as a **conformance
  corpus**: same seed + same expression must produce the same output string.

So: generate a large corpus of expressions, run it through the Java jar as an **oracle**, and hold
the TypeScript engine to byte-equality. That converts "rewrite and hope" into a mechanical,
checkable migration.

### Phasing so the game never breaks

- **Phase 0** — Java bot keeps serving the live game throughout. Stand up Redis + hosting.
- **Phase 1** — Relay + OBR extension, in TS. The widget's rolls are evaluated by the **Java**
  engine over the relay, so there is exactly one engine in play and no divergence risk. Meanwhile
  build the TS engine against the conformance corpus, unwired.
- **Phase 2** — When the corpus passes byte-identical, cut the widget over to the local TS engine
  and port the Discord bot to discord.js.
- **Phase 3** — Retire the jar.

This makes the OBR work and the rewrite the *same* effort rather than competing ones.

---

## 5. Feature plan

### 5.1 Synchronised roll log (phase 1)
Relay-backed, Redis-persisted, rendered in an extension Action popover. Every roll from either
surface appears in both, attributed to a player, with the full explanation string — including the
explosion breakdown we fixed today (`4+4+3` rather than a bare `11`).

### 5.2 Discord → OBR echo (phase 1)
Bot pushes each roll result to the relay keyed by channel ID → relay fans out to that room's
connected clients.

### 5.3 OBR → Discord echo (phase 1)
Extension → relay → bot posts to the channel **using the bot's own identity** via the Discord REST
API. Prefer this over a Discord webhook (Rumble!'s approach): consistent formatting and no second
secret to manage.

### 5.4 Dice widget (phase 1)
A text input over the R2 expression language plus quick buttons for the common Savage Worlds
cases — trait roll (`s8`), extra (`e8`), damage (`2d6!`), raises. Note the semantics we confirmed
today: `s4` is a **Wild Card trait roll** (d4 trait + d6 Wild Die, both exploding, keep higher),
*not* a lone d4 — the widget should make that explicit in its labelling, because it is the single
most confusing thing about the syntax.

### 5.5 Bennies (phase 1–2)
Per-player counter widget. **Authoritative state stays in the bot + Redis** (`BennyCommands`
already exists) so Discord and OBR cannot disagree; the extension is a view plus
spend/give actions over the relay.

### 5.6 Initiative (phase 2)
**Verified as genuinely implemented in the bot** — reuse rather than rebuild:
- joker reshuffle at round end (`Deck.jokerDealt`, `NewRoundAction.java:22-25`)
- Quick edge — redraw below `CLUBS_SIX` (`Deck.java:91,136-137`)
- Hesitant (`Deck.getHesitantResult`), Level Headed and Improved Level Headed
  (`DealInitiativeCardsAction`), with validation rejecting contradictory combos (`q`+`h`, `lh`+`h`)

OBR side is pure rendering: a **Deal button**, an ordered turn list, and the **drawn card shown
next to each character** — ideally as a badge attached to the token on the map, with the ordered
list in the popover as fallback.

Prior art: `hemolack/deck-o-cards` does SW initiative draws in OBR. **6 commits, 0 stars** — cite
as proof the idea works, not as a base to fork. Our deck logic is better and already written.

### 5.7 Worth considering beyond the ask
- **Token ↔ character binding** — link an OBR token to a bot `Character` so bennies/states/init
  render on the map automatically.
- **Status effects** — the bot has `StatesCommands`(Shaken, Distracted, Vulnerable, Stunned);
  these map naturally onto token badges.
- **Wound/fatigue trackers** — or just defer to `Owl Trackers`, which already does system-agnostic
  token stats well. Don't rebuild it.
- **GM-only rolls** — `OBR.room.getPermissions()` + the bot's existing `rh` (roll hidden).
- **"Who's holding"** — the bot has `HoldAction`; surface it in the turn list.

### 5.8 Explicitly deferred
**3D dice hand-off to `Dice+` / `SeamusFinlayson/dice-extension`** — phase 3. Those extensions
accept cross-extension roll requests over broadcast channels, but **the message contract is not
documented in their READMEs** (both fetch attempts failed to find it). Do not guess a channel
name — read it from source at
`raw.githubusercontent.com/SeamusFinlayson/dice-extension/main/src/**` when the time comes.
Complication: their physics is deterministic and derives the result, whereas we want R2 to be
authoritative — reconciling "show these specific dice" needs care.

---

## 6. Open questions

1. **Music** — drop it? Doing so removes the entire LavaPlayer/JitPack dependency chain and
   simplifies the rewrite. (Already open in `HANDOFF.md`.)
2. **VPS choice**, and who pays/administers it.
3. **Do players roll in OBR or Discord** primarily? Determines where to invest UI effort.
4. **One room ↔ one channel**, or many? Plan assumes 1:1; the token scheme extends to N:N.
5. **Rewrite appetite** — phases 2–3 are a real project. Phase 1 delivers the integration on the
   existing Java bot and can stand alone indefinitely if the rewrite is deferred.

---

## 6b. Status update — TypeScript rewrite done (2026-08-12)

Phases 2's rewrite landed **before** the OBR work, at Paul's direction. `savagebot-ts/` now runs
the Discord bot; the Java jar is stopped. Music was dropped.

- Dice engine ported and verified **byte-identical** to Java across all 450 conformance records.
  `JavaRandom` matches the JVM on 107 vectors; the roller matches on 735.
- The corpus test was mutation-checked: reintroducing the original explainer bug turns 11 groups
  red, so the oracle genuinely discriminates.
- Bot layer ported: commands, initiative, bennies, tokens, states, Discord transport, optional
  Redis. 237 tests green.

This means §4's phasing is collapsed: the OBR widget can use the **local TypeScript engine**
directly from the start (§4 phase 2), rather than round-tripping to a Java relay. The relay is
still required for Discord→OBR fan-out — that constraint is unchanged.

**Redis is still not running**, so table state is in-memory only and lost on restart. Per §2 this
becomes blocking as soon as bennies/initiative are rendered as OBR widgets.

## 7. Loose ends carried over

- ~~`mvn test` fails on 13 golden strings~~ — **done**. 18 display-only changes verified (each
  breakdown sums to the old total and satisfies the acing invariant) and regenerated; one
  unrelated pre-existing failure (`testDebugMode`, ANTLR error-offset drift) confirmed independent
  by reproducing it with the Roller change reverted. Java suite: 94 green.
- **Suspected upstream bug, unverified:** `Deck.getCardByParams` keeps the *worst* card for Level
  Headed (`l`) and Improved Level Headed (`i`), identical to Hesitant, because it combines with
  `normalSortingOrder = false`. Level Headed should keep the best of two. Ported faithfully so the
  rewrite is behaviour-identical; needs a rules check before changing.
- **OPEN BUG: `/roll 2d6+1` fails in Discord while `/roll 2d6` works.** Confirmed live by Paul.
  Narrowed, not solved:
  - the dice engine is fine — `2d6+1` → `2d6+1: 1 + 5 + 1 = **7**`;
  - the command layer is fine — pinned by tests in `test/bot.test.ts`
    ("arguments containing operators"), which call `roll` exactly as an interaction does;
  - the bot logged no error, so `interaction.reply` did not throw.

  So the fault is above the command layer: either the option value never arrives (Discord client
  input handling of `+` in a slash option) or the reply is rejected/not rendered. **Next step:**
  log the raw `interaction.options.getString('args')` and re-test, which distinguishes those two
  in one shot. The prefix form `~r 2d6+1` is unaffected — use that meanwhile.
- The `~help` DM + thread change is **built and was running, but never confirmed by Paul** before
  the Java bot was stopped for the TypeScript cutover. The behaviour is reimplemented in
  `bot/discord.ts` and still needs a live check.
- **Slash commands are now registered per-guild as well as globally.** Guild registration is
  immediate; global can take an hour. This is what made them usable — and its success also proved
  the bot does hold the `applications.commands` scope.
- **Collateral: the wrong bot's slash commands were overwritten.** An ambient `DISCORD_TOKEN` in
  Paul's shell (for a bot called *Overlord/McDoom*) took precedence over `.token`, so early
  TypeScript runs logged in as that bot and called `commands.set()` on it — which replaces the
  global set wholesale. Whatever it had registered is gone and cannot be recovered.
  `run-ts.sh` now exports `DISCORD_TOKEN` from the file so the explicit choice always wins.
- The cropped `[12; w4]` line from the screenshot is **still unidentified**. If it was a `~s4`, a
  trait die of 12 is impossible (an exploding dN can never total a multiple of N) and would be a
  real bug worth chasing.
