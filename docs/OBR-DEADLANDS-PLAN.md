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

**Still unverified — these gate the layout, and both need a live room:**

1. **Room metadata size cap.** ~16kB is widely cited and not in the source. If PC sheets go in room
   metadata this is load-bearing: a Deadlands sheet with edges, hindrances and gear as free text is
   easily 2–5kB, and six PCs might not fit. If it doesn't fit, the fallback is one sheet per
   **scene-metadata key** with a room-level index, or sheets pinned to a hidden "roster" item.
2. **Player metadata persistence and `player.id` stability.** The handoff asserted "persists: yes".
   That is not determinable from a type signature — it's server behaviour. `Player` carries both
   `id` and `connectionId`, so `id` is clearly meant to be the more durable of the two, but whether
   it survives a rejoin, a different browser, or cleared storage is unknown. **Assume it doesn't**
   until measured: key player-owned data by a sheet id the GM controls, not by `player.id`.

Both are answered by a ~30-line throwaway extension in one short session with Paul: write growing
blobs to room metadata until it errors; write player metadata, close the browser, rejoin, read
back. **This is milestone 0, not background research.**

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

| # | What | Blocked on |
|---|---|---|
| 0 | Probe extension: measure the room-metadata cap; test player-metadata persistence across rejoin. Answers §2. | Paul opening a room |
| 1 | `src/rules/`: sheet schema + JSON codec, chip pot, poker hands. Tested. | nothing |
| 2 | Extension skeleton: manifest, static host, `Storage` adapter interface with room/item implementations, leader election. | 0 |
| 3 | Sheet panel: view/edit a PC, trait rolls through the verified engine, export/import the roster. | 1, 2 |
| 4 | Chip pot + per-player chip widgets, GM award, draw. | 1, 2 |
| 5 | Initiative: deal, round, joker reshuffle, card rendered on the token. Reuses `Deck`. | 2 |
| 6 | Wounds/shaken badges, damage vs Toughness with raises, soak. | 3 |
| 7 | Deadlands arcane: huckster draw UI, Fear Level. | 1, 3 |

Positional features (gang-up, range, templates) come after, and are the reason to be on a VTT at
all — but they need nothing new architecturally, so they're not on the critical path.

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
