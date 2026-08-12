# Savage Worlds Discord bot — handoff

Written 2026-08-12, migrated from a Claude Code session in `~/dev/shub-niggurath`
(wrong directory — savagebot work doesn't belong in the Blacksands repo).

## Goal

Damian wants a Discord bot supporting **Savage Worlds**-specific rolling plus table helpers
(initiative cards, bennies, tokens, states).

## Where things stand

`alessio29/savagebot` is an existing open-source bot that already does exactly this — see
`savagebot-analysis.md` for a full architecture read. Short version: ANTLR4-based dice expression
language, Savage Worlds trait/extra rolls with acing, initiative card deck with Quick/Level
Headed/Hesitant edges, bennies, tokens, character states, plus LavaPlayer music. Redis for
persistence. Java 8 / Maven.

**The author's hosted instance is currently offline.** Invited it to a test server on 2026-08-12;
the bot joins fine but shows greyed-out Offline in the member list. It's gateway-based, so while
offline neither `!` commands nor slash commands work. It's a verified public app, so this is a
global outage of the author's box, not a local misconfiguration. Infra is a bare
`while true; do nohup java -jar ...; done` loop with no monitoring, no status page and no support
server — recovery depends on the author noticing by hand. No GitHub issue filed for the outage;
newest human-filed issue is #204 (Oct 2025), so it was alive then.

**Therefore: self-hosting is the path.** Waiting on someone else's unmonitored box isn't a
foundation for Damian's game.

## Contents of this directory

- `savagebot/` — clone of `alessio29/savagebot` @ `b60e98e`.
  **Shallow clone (`--depth 20`)** — run `git fetch --unshallow` before doing real work, and
  re-point `origin` at your own fork if you intend to modify it.
- `savagebot-analysis.md` — full architecture analysis, run instructions, known blockers.

## Build status — 2026-08-12, self-host

**It builds.** `./build.sh` produces `savagebot/target/savagebot-0.2.0-SNAPSHOT-jar-with-dependencies.jar`
(51MB). `./run.sh [debug]` launches it, reading the bot token from `.token` (gitignored, chmod 600).
Both scripts pin `JAVA_HOME` to `openjdk@17` internally — it's keg-only, so `/usr/bin/java`
stays a broken stub and no `export` survives between shells.

Patches applied to get there:

- `SavageBotRunner.java` — added `.enableIntents(GatewayIntent.MESSAGE_CONTENT)`.
  **Order-sensitive:** with this in, the gateway rejects the connection outright with close code
  **4014 (disallowed intents)** unless Message Content is already toggled on in the Developer
  Portal. That's "bot never comes online", not a silent degradation.
- `pom.xml` — dropped the dead `jcenter` repo (as predicted), and two blockers the analysis did
  *not* predict, both downstream of that removal:
  - `com.sedmelluq:lavaplayer:1.3.73` was **jcenter-only and is not on Maven Central at all**, so
    removing jcenter made the build unresolvable. Swapped to the maintained fork
    `dev.arbjerg:lavaplayer:1.5.3`, which keeps the same `com.sedmelluq.discord.lavaplayer.*`
    package names — a drop-in, no Java changes needed.
  - that fork's audio-codec transitives (`com.github.walkyst.JAADec-fork:*`) are **JitPack-only**,
    so `https://jitpack.io` had to be added to `<repositories>`.

  Net: the music dependency is what makes this build fragile. If Damian doesn't want music,
  ripping out `internal/music/` + `MusicCommands` removes all three of the above at once.

**First real run confirmed the 4014 prediction exactly.** With a valid token but the portal toggle
still off, the bot authenticates fine, logs `Registered /-command: roll|deal|fight|card|hold|init|
round|drop`, then the gateway drops the connection:
`CloseCode(4014 / Disallowed intents...)`. Token validity and the intent toggle are therefore
independent failures that look identical from Discord's side (bot never appears Online) — read the
log, not the member list. Flipping **MESSAGE CONTENT INTENT** in the Developer Portal is the fix.

**Pre-flight done with a junk token** (`... NOT_A_REAL_TOKEN 127.0.0.1 6379 dummyPass debug`):
the whole startup path runs clean and fails at *exactly* one place — `LoginException: The provided
token is invalid!` from `build()` at `SavageBotRunner.java:53`. Nothing throws before it. So with a
real token in `.token`, any remaining failure is portal/token config, not a code defect. Also
established: `build()` blocks and throws synchronously, so the `getSelfUser()` loop right after it
is not racing an un-READY shard.

Two facts confirmed **by reading the source** (the analysis doc asserted both without ever running
the code — verified here because a wrong prefix would make a checkpoint-(d) failure look like (b)):

- **`debug` is strictly positional (`args[5]`).** To reach it you must pass redisHost/port/pass
  first — "only password + token are required" and "6th arg is debug" can't both be honoured.
  `run.sh debug` passes `127.0.0.1 6379 dummyPass` to get there. Safe: `RedisClient.setup()` is
  pure field assignment (no connection), and every read/write wraps the Jedis call in
  `catch (Exception) → log.debug`, returning an empty map (`RedisClient.java:66-73`). A dead Redis
  really is harmless — state just doesn't persist. Want persistence later:
  `docker run -d -p 6379:6379 redis` and the same args start working, no code change.
- The debug prefix is **`~`** — `Prefixes.java:8`, `DEFAULT_TEST_PREFIX = "~"`. Verified, not assumed.
- **Slash commands register globally**, via `jda.updateCommands()` in `CommandRegistry.java:105` —
  not per-guild. Propagation can take up to an hour. Do not read a slow slash command as a broken
  build.

Verify these as four separate checkpoints; most confusion here is misreading a later failure as an
earlier one: (a) jar builds ✅ · (b) bot shows **Online** in the member list — gateway/token/intents
· (c) a slash command responds — registration · (d) `~s8` responds — MESSAGE_CONTENT.

The public bot is still in the test server. Leave it: it's offline so it can't double-respond, and
the local instance runs on the `~` prefix under `run.sh debug`, so there's no ambiguity about which
bot answered. Kick it only when taking over `!`.

## Next steps (original)

1. Install a JDK and Maven — **neither is on this machine** (`java` and `mvn` both absent).
   `brew install openjdk@17 maven`.
2. Patch the two known blockers before first build:
   - `SavageBotRunner.java` — imports `GatewayIntent` but never calls `enableIntents(...)`; it uses
     `DefaultShardManagerBuilder.createDefault(token)`, whose defaults exclude the privileged
     `MESSAGE_CONTENT` intent. Prefix commands (`!s8`) will very likely arrive with empty content on
     a bot registered today. Also enable Message Content in the Developer Portal.
   - `pom.xml` — drop the `jcenter` repository; bintray has been dead since 2021 and will just add
     resolution timeouts.
3. `mvn clean compile assembly:single`, then run per `savagebot-analysis.md` § Running it.
4. Register a new Discord application for Damian's instance; invite with
   `scope=bot%20applications.commands` (the README's link omits `applications.commands`, so slash
   commands never register).
5. Optional: Redis for persistence. Without it the bot runs but loses table state on restart.

## Open questions for Damian

- Does he need the music commands? If not, dropping LavaPlayer removes the most rotten dependency
  (`com.sedmelluq:lavaplayer` 1.3.73 is the abandoned line; YouTube playback is broken on it — the
  live fork is `dev.arbjerg:lavaplayer`).
- Self-host on what? A always-on box is needed. The upstream restart-loop script is a starting
  point but deserves better (systemd unit or a container, secrets via env not argv — currently the
  bot token and Redis password are passed as command-line args and visible in `ps`).
- Modernise or run as-is? JDA is pinned to `5.0.0-alpha.18`; JDA 5 stable exists. Running as-is is
  fastest; upgrading is the right call if this becomes a maintained fork.

Base to fork: **upstream `alessio29/savagebot`** (50 stars, last push 2026-03-02). The `dnpetrov`
fork contributed the Sword World / Ironsworn roll work but is stale since 2024-05 and already
merged upstream.

## Context that does NOT carry over

Earlier in the originating session I recommended *against* SavageBot — that was for Paul's Delta
Green campaign (Blacksands), where the Savage Worlds feature set is dead weight and only percentile
rolls matter. For Damian's Savage Worlds game that reasoning is inverted: SavageBot is
purpose-built for the job.
