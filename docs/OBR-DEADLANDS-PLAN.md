# Owlbear Rodeo extension — Deadlands plan

Written 2026-08-12. Supersedes the *scope* of `OBR-INTEGRATION-PLAN.md` (which stays as the
reference for the SDK survey, hosting, and the deferred Discord relay). Read `HANDOFF.md` first.

**Scope decision:** the target is **Deadlands: The Weird West** (SWADE-based, 2020) — confirmed by
Paul — not generic Savage Worlds. Where a choice exists between a general SWADE abstraction and the
Deadlands-specific thing, build the Deadlands thing. SWADE underneath is the right base, which
matches the already-ported engine and deck.

**Rooms:** development happens in **Paul's** room; the campaign eventually runs in **Damian's**.
That makes cross-room portability a hard requirement rather than a nicety — see §1c.

---

## 1. Character sheets: where they live

Paul's instinct — "you really want them persistent outside Owlbear" — is half right, and the two
halves pull in opposite directions. Both are answered below.

### 1a. The runtime source of truth has to be *inside* OBR

There is no server. An extension is a static page in an iframe, so at runtime it has **no read path
to an external store** — not without either a public CORS-permitting URL or the relay that got
deprioritised. So "the sheet lives outside OBR and the extension reads it" is not an available
option. Everything else follows from that.

### 1b. Two lifecycles, two homes, one schema

The mistake to avoid is putting every sheet in the same store. PCs and Extras want opposite
behaviour:

| | PC sheets | NPC / Extra sheets |
|---|---|---|
| Lifetime | the whole campaign, across scenes | one encounter |
| Duplicating the token should… | never happen | copy the sheet (five identical bandits) |
| Losing it is | catastrophic | a shrug |
| Deleting the token should | **not** delete the sheet | delete the sheet |
| → Home | **room metadata**, keyed by a stable sheet id | **item metadata** on the token |

Item metadata is the *wrong lifecycle for a PC*: it dies with the scene, duplicates when the token
duplicates, and vanishes when the GM tidies up the map. It is exactly right for Extras.

A PC token therefore carries only a **pointer** in its item metadata (`{ sheetId }`), plus the
small volatile combat state that genuinely belongs to the scene (wounds, fatigue, shaken,
initiative card). One `Sheet` type serves both; only the storage adapter differs.

```
Sheet (one TS type)
  ├── stored in room metadata   → PCs      (survives scenes)
  └── stored in item metadata   → Extras   (travels with the token)
Token item metadata: { sheetId? , wounds, fatigue, shaken, card, ... }
```

### 1c. Where Paul's instinct is right: export/import is a feature, not a nicety

All of this lives in the room owner's OBR account, subject to their retention and subscription. If
Damian owns the room, the party's sheets are in Damian's account and nobody else can get them out.

So **JSON export/import is first-class from day one**. It is simultaneously:

- the backup (dump the whole roster to a file, commit it next to this repo),
- **the move from Paul's dev room into Damian's campaign room** — since dev happens in one and play
  in the other, this path gets exercised for real, not just in theory,
- the offline-authoring path (edit a sheet in a text editor between sessions, re-import),
- the escape hatch if a storage decision turns out wrong,
- and the migration path when the schema changes.

Because of the room move, export/import must round-trip the **whole roster in one operation**, and
must not embed anything room-specific (OBR item ids, scene ids, player ids) in the sheet itself.
That reinforces §1b: the token points at the sheet, never the reverse.

That, and not a live external database, is what "persistent outside Owlbear" should mean here.

---

## 2. Storage facts — verified from the SDK, and what still isn't

Read from `@owlbear-rodeo/sdk@3.1.0` on disk, not from docs.

**Resolved since the handoff:**

- **`scene.local` is a full items API** (`getItems`/`addItems`/`updateItems`/`deleteItems`/
  `onChange`) for **non-synced, non-persisted** items. Good for local-only overlays — range rings,
  a blast template being dragged, GM-only annotations. The handoff's "unverified" note can go.
- **Scene, Room and Player `setMetadata` are the same operation.** `SceneApi.setMetadata` is typed
  `Metadata` rather than `Partial<Metadata>`, which looked like it might mean *replace*. It
  doesn't: all three send `{ update }` over the same message bus (`OBR_*_SET_METADATA`) with
  identical bodies, and merging happens host-side. The type difference is cosmetic — for
  `Record<string, unknown>`, `Partial<T>` is the same type anyway.

**Design rules that follow:**

- Namespace every key `com.savagebot/<concern>` and **never write a key you don't own**. The merge
  appears to be shallow at the top level, so top-level keys are the unit of non-interference.
- Within one key the write is whole-value, so **one writer per key**. Use per-owner keys
  (`chips/<playerId>`) over shared mutable structures wherever concurrent writers are possible.

### Measured — milestone 0, run 2026-08-12 in Paul's room

Numbers, not citations. All measured with **incompressible** filler, so they are byte budgets and
not compression ratios.

| Store | Capacity | Overflow behaviour | Persists |
|---|---|---|---|
| Room metadata | **between 12.6 kB and 15.8 kB**, whole document | **silent drop — no error** | yes, across tab close |
| Item metadata | **~512 kB per item**, bisected | rejected at 1 MB | yes, with the scene |
| Player metadata | not measured | — | **NO — gone on tab close** |

The room figure is a **bracket, not a bisection**: four 3.2 kB keys were accepted and the fifth was
dropped. 16 kB is the obvious candidate but was not confirmed — the room-cap bisection button was
never run. `ROOM_CAPACITY` is set to 15,000 to sit under the bracket, and the design uses ~3 kB, so
nothing turns on the exact figure. Run the button if that ever stops being true.

- **`player.id` is stable** across a tab close and rejoin (same browser). `connectionId` is not.
- **Deletion works**: assigning `undefined` removes the key and reclaims the budget — room metadata
  went back to `{}`. An earlier "delete does not work" reading was a probe bug (`Object.keys` lists
  a key whose value is `undefined` identically to one holding data).
  On *items*, `delete draft.metadata[key]` is **rejected**; assign `undefined` there too.
- **A non-GM can write item metadata on a CHARACTER token** — confirmed directly, not inferred
  from the PROP case, since `PROP_UPDATE` and `CHARACTER_UPDATE` are separate grants. Players can
  therefore own and edit their own sheets without the GM proxying. Recommend Damian turns
  `CHARACTER_OWNER_ONLY` **on** in the real room; it is off by default, the design does not need it
  off, and it is a free guard rail.
- **Metadata capacity does not vary by item type or image size.** The token's artwork is an asset
  reference, so a high-resolution prop and a plain token have the same metadata budget.
- **Compression works in the iframe**: `CompressionStream('gzip')` + base64 took a realistic
  6-sheet roster from 2,377 chars to 464, and round-tripped through room metadata intact.

**The decisive number is 512 kB on items versus 16 kB in the room** — a 30× difference that settles
where the bulk goes.

### What that means for the layout

The §1b split survives, with the budgets attached:

| Data | Home | Size | Why |
|---|---|---|---|
| Canonical PC roster | **room metadata**, one key per PC | ~400 chars each | campaign-scoped; 6 PCs is ~2.4 kB of a 16 kB budget |
| Chips, per player | **room metadata**, one key per player | tiny | must outlive a tab close, so player metadata is out |
| Extra/NPC sheets, prose, backstory, images | **item metadata** on the token | 512 kB, effectively free | no budget pressure at all |
| PC volatile combat state (wounds, shaken, card) | **item metadata** on the PC token | tiny | belongs to the scene, not the campaign |

Three rules fall out of the measurements:

1. **Verify every room-metadata write by reading it back.** Overflow is silent, and a character
   sheet edit that vanishes without an error is the worst failure this thing could have.
2. **Keep the room roster lean and structured; push prose to the token.** The 16 kB budget is
   comfortable at ~3 kB of real use, but an unbounded notes field would eat it. Items have 512 kB
   and no such pressure.
3. **Do not compress the roster**, even though compression works. A gzipped blob is one key, which
   means one writer and last-write-wins across *all* PCs — it trades collision-safety for space we
   do not need. Hold compression in reserve for a single archive/backup key.

---

## 3. Deadlands: the mechanic that forces the architecture

**Fate Chips, not bennies.** This is the single most important Deadlands-specific difference for
the design, because it is not a counter — it is a **finite bag drawn from without replacement**,
with non-fungible colours and per-player holdings.

On a platform with no authoritative RNG and last-write-wins semantics, that means:

- the pot composition needs **exactly one writer**, or two simultaneous draws take the same chip;
- draws must be **leader-performed** (GM's client), or a player can re-roll a draw they don't like
  by simply calling the function again;
- a player's held chips are **per-player keys**, never a shared structure.

This is a much sharper reason to build leader election first than initiative was. The handoff's
generic "build it in from the start" becomes a concrete requirement with a concrete failure mode.

Other Deadlands-specific surfaces worth building. **All written from memory and to be confirmed
against the Weird West book before any of it is coded** — the rules modules in §4 are exactly where
a misremembered detail would get baked in:

- **Huckster hexes** — the deal with the devil draws cards and evaluates a **poker hand**. This
  reuses the already-ported deck and `javaShuffle` directly, and a poker-hand evaluator is pure,
  testable TypeScript with zero OBR dependency.
- **Fear Level** — a territory-scoped counter driving Fear/Guts checks. Natural fit for room
  metadata; trivially small.
- **Harrowed** — dominion tracking, the Manitou.
- **Mad science** — malfunction on a roll of 1s, per-device reliability.
- **Blessed / Shaman** — faith and favour tracking.
- **Bounty / Reputation / Grit** as sheet fields.

The generic-SWADE ladder in `HANDOFF.md` §4 still applies underneath (traits, wounds, soak,
initiative, gang-up, range, templates); Deadlands sits on top of it rather than replacing it.

---

## 4. Two workstreams — one of them can start now

**A. Pure rules modules (no OBR dependency).** Chip pot, poker-hand evaluation, Fear Level,
damage/soak resolution, the sheet schema and its JSON codec. These live in `src/rules/` next to the
dice engine, ship to both the bot and the extension, and are verified the same way the engine was —
vitest, property tests, deterministic seeds via the existing `JavaRandom`. **Zero blockers. Start
here.**

**B. The OBR shell.** Manifest and static hosting, storage adapters, leader election, the UI
surfaces, token badges. Gated on milestone 0.

Leading with A means the risky, rule-heavy part is done and tested before any OBR-specific
scaffolding exists — the same sequencing that made the dice-engine rewrite verifiable.

---

## 5. Milestones

Room for development: `https://www.owlbear.rodeo/room/oSZbFhSwnKqy/ThePubicRim` (Paul's).

| # | What | Blocked on |
|---|---|---|
| 0 | **Done** — all five questions answered; see the measured table in §2. | — |
| 1 | `src/rules/`: **chips done**, **poker done**, sheet schema + JSON codec outstanding. | schema needs the book |
| 2 | Extension skeleton: manifest, static host, `Storage` adapter interface with room/item implementations, leader election. | 0 |
| 3 | Sheet panel: view/edit a PC, trait rolls through the verified engine, export/import the roster. | 1, 2 |
| 4 | Chip pot + per-player chip widgets, GM award, draw. | 1, 2 |
| 5 | Initiative: deal, round, joker reshuffle, card rendered on the token. Reuses `Deck`. | 2 |
| 6 | Wounds/shaken badges, damage vs Toughness with raises, soak. | 3 |
| 7 | Deadlands arcane: huckster draw UI, Fear Level. | 1, 3 |

Positional features (gang-up, range, templates) come after, and are the reason to be on a VTT at
all — but they need nothing new architecturally, so they're not on the critical path.

---

### Running the probe

```bash
npm run ext:dev          # serves http://localhost:5173
```

Then in the room: ⚙ → Extensions → **Add Custom Extension** → `http://localhost:5173/manifest.json`.
Open the "Savage Probe" action; **the Identity panel filling in is the signal it loaded at all** —
if it stays blank, the extension did not load and nothing below means anything.

`localhost` is reachable only from Paul's Mac, which is fine for a probe and is exactly why the real
extension needs static hosting. For the non-GM test, open the room's *player* invite link in an
incognito window **on the same machine**.

---

## 6. Open questions

- **Rules text.** Edition is settled (Weird West), but every rules specific in §3 is from memory.
  Before milestone 1, get the actual chip economy, huckster deal-with-the-devil procedure, and Fear
  Level table — from the book, Damian, or the SWADE/Deadlands SRD if one covers it.
- Any existing party sheets to import — a spreadsheet, PDFs, Roll20? This shapes the JSON schema
  more than anything else, and is worth knowing before milestone 1.
- Does the party actually want to move off whatever they use now, or is the extension GM-side only
  at first? Affects how much sheet-editing UI is needed versus import-only.

**Settled:** Weird West edition; dev in Paul's room, play eventually in Damian's (§1c).

Carried over from `HANDOFF.md` §5, so it doesn't rot behind this workstream:

- **`/roll 2d6+1`** is still broken in Discord and is one log statement from diagnosis.
- The **Level Headed** deck finding needs a rules check.
