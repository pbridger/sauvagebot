# Savage Worlds bot — handoff

Rewritten 2026-08-12, superseding the Java-era handoff (that content is preserved in
`OBR-INTEGRATION-PLAN.md` §"Build status" and in git history on the `savage/self-host-fixes`
branch). **Read this first**; `OBR-INTEGRATION-PLAN.md` has the depth.

Damian runs a Savage Worlds game. Paul is building bot + VTT support for it.

---

## 1. Where things stand

**A TypeScript bot is live and working in Discord.** The Java bot it replaced is stopped.

Two branches on `git@github.com:pbridger/sauvagebot.git` (Paul's fork of `alessio29/savagebot`):

| Branch | What | Tests |
|---|---|---|
| `savage/self-host-fixes` | the original Java bot, made buildable + two real fixes | 94 green |
| `typescript-rewrite` | the rewrite; **this is the live bot** | 246 green |

Bot identity: **SauvageBot#0301**, app id `1537112650314678323`, in guild
`1007423179746201671` ("Return to Scree Saddle"). Target channel `1534124646624923668`.
Running with prefix `~` (debug mode) so it can't be confused with anything else.

### Running it

```bash
cd ~/dev/savage
./run-ts.sh debug     # `~` prefix;  omit `debug` for `!`
```

`run-ts.sh` reads the token from `~/dev/savage/.token` and **exports `DISCORD_TOKEN` itself**.
That is deliberate: Paul has an ambient `DISCORD_TOKEN` in his shell for an unrelated bot
("Overlord/McDoom"), and `main.ts` prefers env over file. Early runs silently logged in as the
wrong bot — the symptom was "SauvageBot is offline" while the process happily reported
`Logged in as…`. Don't reintroduce ambient-token precedence.

Slash commands register **per-guild as well as globally** on startup. Guild registration is
immediate; global can take an hour. This is what makes them usable during a session.

**Redis is not running.** Table state is in-memory and lost on restart. `docker run -d -p
6379:6379 redis` and set `REDIS_HOST` when that starts to matter.

### What's verified

The rewrite is held to **byte-equality against the Java engine**, not inspection:

- `JavaRandom` reproduces `java.util.Random` exactly — 107 vectors from a real JVM.
- The roller matches on 735 vectors across 15 methods.
- All **450 conformance-corpus records** (`savagebot/src/test/resources/conformance-corpus.tsv`)
  reproduce byte for byte.
- The corpus was **mutation-checked**: reintroducing the original explainer bug turns 11 groups
  red, so the oracle genuinely discriminates. Regenerate it with `ConformanceCorpus.main` only for
  an intentional behaviour change, and review the diff.

Confirmed working live: `~s8`, `~help` (DMs *and* creates a thread — Paul confirmed), `/roll 2d6`.

---

## 2. Owlbear Rodeo — the architecture question, answered

**OBR extensions are client-side only. There is no server-side OBR API, no REST endpoint, no
webhook receiver.** Verified against the SDK source (`github.com/owlbear-rodeo/sdk`);
`docs.owlbear.rodeo` 403s automated fetches, so don't rely on doc summaries.

### So how do complex shared-state plugins work?

**OBR itself is the server.** Extensions bring no backend — they read and write *OBR's own synced
stores*, and OBR replicates to every connected client. Four writable shared stores, each with an
`onChange` subscription:

| Store | Scope | Persists | Natural use |
|---|---|---|---|
| Room metadata | whole room | yes | campaign-scoped state; **PC sheets** |
| Scene metadata | current scene | yes | initiative order, round counter |
| **Item metadata** | per token | yes, with the scene | Extra/NPC sheets; volatile combat state |
| Player metadata | per player | **unverified** | that player's own UI prefs |

Plus `broadcast` (ephemeral, connection-scoped — reaches only who is online *now*, persists
nothing) and `scene.local`, which is **resolved**: a full items API (`getItems`/`addItems`/
`updateItems`/`deleteItems`/`onChange`) for non-synced, non-persisted items. Good for local-only
overlays.

Two corrections to earlier notes, both read from `@owlbear-rodeo/sdk@3.1.0` on disk:

- **Scene/Room/Player `setMetadata` are the same operation.** `SceneApi.setMetadata` is typed
  `Metadata` rather than `Partial<Metadata>`, which looked like it might mean *replace*. All three
  send `{ update }` over the same message bus with identical bodies; merging is host-side.
- **Player-metadata persistence is not verified.** It was asserted here before; it isn't
  determinable from a type signature. Assume `player.id` is not stable across rejoins until
  measured. See `OBR-DEADLANDS-PLAN.md` §2.

`SceneItemsApi.updateItems` uses **Immer draft mutation and ships only changed fields as patches**,
so two clients editing *different* fields of one token do not clobber each other.

The loop: write → OBR replicates → every other client's extension gets `onChange` → re-renders.
A shared document with pub/sub, without running the infrastructure.

### The four constraints that shape any design

1. **No trusted authority.** No server-side code: no secrets, no authoritative RNG, no anti-cheat.
   Any client can write any value. `getRole()` makes "GM-only" a UI convention, not security.
2. **Last-write-wins on the same field.** Patches reduce collisions but don't eliminate them.
   Prefer **per-owner keys** over shared mutable counters (two clients incrementing one benny
   counter will lose an update).
3. **No background execution.** Nothing runs when the room is closed. No timers.
4. **Every client runs your code.** All clients reacting to one event produce N duplicate writes.
   Use **leader election** — GM's client, or lowest `connectionId`, performs shared writes.
   **Build this in from the start**; retrofitting is painful.

---

## 3. Scope change: no server needed

Paul has deprioritised the Discord↔OBR shared roll log and syncing.

**That removes the only reason for a server.** Discord→OBR is impossible without a relay, but
nothing else needs one. The extension becomes pure static hosting: a `manifest.json` on Cloudflare
Pages or Netlify, free. No VPS, no Caddy, no pairing tokens, no secrets, no Redis for the OBR side.
Most of `OBR-INTEGRATION-PLAN.md` §2 (hosting) and §3 (relay) is deferred, not deleted — revisit if
the Discord bridge comes back.

The TypeScript dice engine **compiles straight to the browser**, so the extension gets the
conformance-verified engine locally with no round trip. This is the payoff from doing the rewrite
before the OBR work.

---

## 4. How far Savage Worlds support could go

Tiered by how much leverage the VTT actually provides.

**Tier 1 — sheet and state on the token.** Traits (d4–d12 + mods), Parry, Toughness + armour,
Pace, Wounds, Fatigue, Wild Card vs Extra. Lives in item metadata, so it travels with the token
and persists. Token badges for wounds and Shaken/Distracted/Vulnerable; initiative card rendered
in the token corner.

**Tier 2 — the rules loop.** One-click trait rolls from the sheet with the correct Wild Die.
Damage entry compared to Toughness, applying Shaken/wounds *with raises*, then offering a Soak roll
(spend a benny, roll Vigor). Benny economy with GM award. Initiative deal/round/joker-reshuffle
driven by the already-ported deck. Multi-action penalty helper.

**Tier 3 — what only a VTT can do** (needs token positions; this is the differentiator):
- **Gang-up bonus** — count adjacent enemies, apply +1..+4 automatically.
- **Range penalties** — measure attacker-to-target distance, resolve Short/Medium/Long.
- **Blast templates** — Small/Medium/Large and Cone as scene items, resolving who is underneath.
- **Cover and illumination** as token/scene flags feeding the modifier.

**Tier 4 — long tail.** Chase and Dramatic Task trackers (card-driven, reuses the deck),
Power Points, Conviction, Support/Test resolution.

### Recommended first slice

**Tier 1 plus the initiative panel.** Shortest path to something usable at the table, exercises all
four state stores, and forces the leader-election decision early. The dice engine — normally the
risky part — is already done and verified.

**Superseded by `OBR-DEADLANDS-PLAN.md`** (2026-08-12). The target narrowed from generic Savage
Worlds to **Deadlands** specifically, and the first slice changed: sheets split by lifecycle (PCs in
room metadata, Extras in item metadata), with the Fate Chip pot rather than initiative as the
mechanic that forces leader election. The tier ladder above still applies underneath.

---

## 5. Open items

**Bugs**

- **`/roll 2d6+1` fails in Discord while `/roll 2d6` works.** Confirmed live. Narrowed, not solved:
  the dice engine is fine (`2d6+1: 1 + 5 + 1 = **7**`), the command layer is fine (pinned by tests
  in `test/bot.test.ts` → "arguments containing operators"), and no error was logged, so
  `interaction.reply` did not throw. Fault is *above* the command layer — either the option value
  never arrives or the reply is not rendered. **Next step:** log the raw
  `interaction.options.getString('args')` and re-test; that distinguishes the two in one shot.
  `~r 2d6+1` is unaffected.
- **Suspected upstream bug, ported faithfully rather than "fixed":** `Deck.getCardByParams` keeps
  the *worst* card for Level Headed (`l`) and Improved Level Headed (`i`), identical to Hesitant,
  because it combines with `normalSortingOrder = false`. Level Headed should keep the best of two.
  Preserved so the rewrite stays behaviour-identical — needs a rules check before changing.
- **Unidentified:** a screenshot line reading `[12; w4]`. If that was a `~s4`, a trait die of 12 is
  impossible (an exploding dN can never total a multiple of N) and would be a real bug. Never
  identified which command produced it.

**Decisions Paul owes**

- **The command surface shrank from 59 to 24**, beyond the 7 music commands he chose to drop.
  Not ported: `ept`, `prefix` (per-user prefixes — there is now one global prefix), `invite`,
  `info`, `addbenny`, `clearbennies`, `pullbenny`, `setbennymode`, and the standalone card-deck
  commands (`put`/`show`/`shuffle` as a general deck separate from initiative). Which come back?
- Redis: stand it up, or accept losing table state on restart?

**Collateral already done and unrecoverable**

While running under the wrong ambient token, the bot called `commands.set()` on the unrelated
"Overlord/McDoom" application, which replaces the global slash set wholesale. Whatever that bot had
registered is gone. Paul has said not to worry about it.

---

## 6. Layout

```
~/dev/savage/
  .token                 bot token (gitignored, chmod 600)
  run-ts.sh              run the TypeScript bot   <- current
  build.sh, run.sh       build/run the Java bot   <- legacy
  savagebot/             Java bot (fork, branch savage/self-host-fixes)
  savagebot-ts/          TypeScript bot (branch typescript-rewrite)  <- current
    src/dice/            engine: javaRandom, roller, parser, evaluator, interpreter
    src/game/            cards, table state
    src/bot/             commands, interpreter, discord transport
    src/store/           optional Redis
    test/                237+ tests incl. the conformance corpus replay
    docs/                this file + OBR-INTEGRATION-PLAN.md  <- copies of record
    scripts/             copies of the run scripts
```

`~/dev/savage` is **not** a git repo. `savagebot-ts/docs/` holds the versioned copies of these
documents; edit those.

## Installing the extension in someone else's room

The extension is published to GitHub Pages by `.github/workflows/pages.yml` on
every push to `typescript-rewrite`. The install link is the manifest URL:

    https://pbridger.github.io/sauvagebot/manifest.json

In Owlbear Rodeo: **Profile → Extensions → Add Custom Extension**, paste that,
install. Nothing needs to be installed per-room — an extension is added to an
account and then enabled in a room.

**One-off setup, on GitHub:** Settings → Pages → Source: **GitHub Actions**.
Until that is set the workflow builds and the deploy step fails.

A project site is served from `/<repo>/` rather than a domain root, so the build
takes `VITE_BASE` and rewrites the manifests' paths to match (see
`extension/vite.config.ts`). Building without it — `npm run ext:build` — still
produces a root-served build for local work.

**What this does not solve:** the room's ~15 kB metadata budget. Two Marshals
running the same roster hit the same ceiling. See the rules-text switch on the
Table tab for the stopgap, and OBR-DEADLANDS-PLAN.md §2 for what a real fix
looks like.
