# Changelog

What changed at the table, newest first. Written for the people using it rather
than for the diff: if something is worth knowing before your next session, it is
in here.

Each entry covers one deploy — a push to `typescript-rewrite` publishes to
<https://paulbridger.com/sauvagebot/manifest.json>, and Owlbear picks it up on
reload.

---

## 2026-08-19 — Your edges say what the book says

`cff450b`, `fa41092`.

**The rulebook text had numbers missing.** The script that pulls Edges and
Hindrances out of the PDF was stripping page numbers, and its pattern was too
greedy: it also ate any number followed by a capitalised word. Five Edges had
lost the number that makes them work — Power Points granted "an additional Power
Points", Improved Rapid Recharge "regains Power Points per hour", Agency
Promotion made you "a Grade Agent" three times over. All fixed, along with 24
entries that had a stray page number stuck on the end.

**Edges and Hindrances now show the book's wording, not the card's.** The text on
the imported cards was a summary, and summaries lose things: Pacifist's
"undeniably evil creatures, undead, demons, and the like are fair game", Scout
being "always considered alert for Notice rolls versus Stealth", Elan not
applying to damage or Soak rolls. The full entries were sitting in the extension
the whole time. Every edge and hindrance on the party's five sheets is covered.

This is also the storage fix. That prose was 38% of everything stored in the
room, and it no longer needs storing at all — the book ships inside the
extension. **Marshal: press "Clear stored rules text" in the Table pane once.**
Nothing disappears from the screen; the wording comes from the book instead. The
room should drop from about three-quarters full to under half. Anything homebrew,
or an entry the book has never heard of, is kept.

---

## 2026-08-19 — Stray shots, and finding out where the room's space went

`5c80dfd`, `0233223`, `581a184`.

**Innocent bystanders.** A miss whose Shooting die came up 1 hits a random
character next to whoever you were aiming at — 1 or 2 for a shotgun, full auto
or anything with RoF 2+. The targeting table now says so when it happens, under
the results, and only when a row is a genuine miss rather than out of range.

It counts the skill die and never the Wild Die, so a Wild Card who rolled trait
1 and wild 8 hit with the 8 and still put a 1 on the table. It picks nobody and
applies no damage: who is actually standing next to your target, and what is in
the line of fire, is a look at the map and the Marshal's call. Paige's LeMat
knows the difference between its two barrels — the shotgun one strays on 1–2,
the pistol one on 1.

The 1–2 window is not shotguns only, which is worth knowing at the table: Fan
the Hammer says so in its own text, about a single-action revolver. Fanning is
not detected automatically, because it is something you choose to do rather than
a property of the gun — if you fan, watch for a 2 yourself.

**Edge and hindrance chips are quieter.** The tooltip that explained "no number
the app can name" is gone; it only ever appeared on entries whose rules text was
already printed directly underneath. The chip now reads **N.B.**, and an entry's
name looks the same whether or not it carries one.

**Storage.** The room ran out of space mid-campaign. The probe panel gained a
"Storage report" button that says where every byte went, and a "Deep clean" that
takes the litter out. Between them: a quarter of the room turned out to be
leftover filler from an earlier measurement run, and clearing it took the room
from 106% full to 78%, plus half a megabyte off three tokens. Nothing was lost.
No character data changed. The remaining question — whether the rules text on
your cards is the same as the book's — has a button for it now too.

---

## 2026-08-19 — No spoilers on the sheet

`9ca62b7`. A follow-up to the deploy below.

Coffin Rock's printed descriptions are written for the Marshal, and the importer
was copying them onto the sheet — where any player bound to that token can read
them. They said which building to find Ike Turnbull in, that Marshal Bryce is in
with Reverend Cheval, what the Blood Men are made of, and who Laughs At Darkness
is working for.

**27 of the 35 are rewritten** to appearance and bearing only. Rules stay, because
they are not spoilers and cutting them would cost something real: Dr. Osgood's
Berserk numbers, the ten Greedy Townsfolk's shared armoury, what template a swarm
covers.

The **category** shown in the creature picker is left as the adventure's own
chapter names — several of which are places. That is deliberate: the picker is in
the Table pane, which is hidden from players, so it is the one spot where the
Marshal's own shorthand is safe. The rule is written on the type so a future
import follows it.

---

## 2026-08-19 — Coffin Rock, and a table everyone sees the same way

`85657a0`, deployed from `typescript-rewrite`. Everything since the dice-feel
tuning of 17 Aug (`3bc400e`).

### The Coffin Rock bestiary is in

All **35 stat blocks** from the adventure, in the creature picker beside the free
bestiary. Search takes a source filter, so the Marshal looking for Coffin Rock's
deputies is not wading through 219 animals to find them.

Every creature and every sheet now records **which book it came from** — and so
which *edition* its numbers were written under. That is not bookkeeping: the
party's cards are SWADE, Coffin Rock is Deadlands Reloaded, and the free bestiary
is older still. Guts, Charisma, Knowledge (X) and inches all come from that
split, and a sheet that does not know which book it is from cannot warn you.

**Wild Cards were read off the rendered pages, one at a time.** The adventure
marks them with a joker figure beside the heading, and that figure is an image —
no amount of text extraction sees it, and the words "wild card" appear nowhere in
the book except the Blood Men's Henchman ability. A first pass that guessed from
the names got five wrong in *both* directions: Dorothy's ghost, Deacon Plume,
Jonah Thurgood, Laughs At Darkness and the Summoned Demon are all Extras despite
being named, while the nameless Ghost Miners carry a joker.

### Mechanics: two controls and a note, not a rules engine

A survey of the party's cards and both bestiaries found **24 abilities that break
the current flow** and **159 that appear exactly once**. That shape argues
against a registry of edges — it would be a lot of machinery for two and a half
real cases — so instead:

- **Max wounds** is now a field, and editable on the sheet. It is what a
  **Henchman** is: Coffin Rock's Blood Men roll a wild die "as though they were
  Wild Cards" but go down on the first wound. Set it to 0 on a Wild Card and you
  have one. A Marshal wanting a boss who soaks five gets it from the same
  control.
- **A damage adjustment** — halve, double, ±n — applied to the damage roll
  *before* Toughness, from the log entry. One control for an unbounded tail of
  one-off abilities: half damage from piercing weapons, double from a Weakness,
  and whatever the next book invents.
- **Everything purpose-scoped is an asterisk** against the affected trait, with
  the bonus in the tooltip, for the player to apply. A reroll is just a player
  rerolling; it does not need the app's permission.

The test the design is held to: *does the app commit to an answer the player
cannot adjust?* If not, a note is enough.

### Dice come in from where people are sitting

**The dice-seat setting is gone**, and nothing replaces it.

Each player now holds a chair at a round table, handed out automatically and
remembered between sessions. The *direction* dice arrive from is worked out per
viewer: **you are always at the bottom of your own screen**, and everybody else
comes in from where they sit relative to you. If Jen is on your left then you are
on Jen's right, as at a real table.

The most visible difference: **the Marshal's own dice now come from the bottom of
the Marshal's screen, not the top.** That is the change working, not a
regression — on your own screen you are at the bottom, like everyone else.
Whether Damian appears at the top of *your* screen depends on where he is sitting
relative to you, which for a two-person room is still exactly opposite.

### Smaller things

- **The log opens expanded.** A roll's table is there to read, so it no longer
  has to be asked for. It collapses when *your own* next roll arrives — not when
  somebody else's does, which would close a table you were mid-way through
  reading.
- **Range bands on a roll made from the skills list** now say what they are
  doing. Rolling Shooting from the skills list carries no weapon and therefore no
  range penalty, and the table used to show a bare distance with no explanation
  and no modifier, which reads exactly like a bug.
- **Natural weapons can be added from the equipment list**, where they belong —
  a claw is nicer to find in the attack list than in a paragraph of text.
- **The stat-block importer stopped losing data.** Wrapped labels are rejoined,
  run-together traits are split, `Powers:` and `Charisma:` are kept, and a LeMat
  now imports as two rows — pistol and shotgun — instead of one unusable one.

### One bug worth recording

Blood Men were correct in the data (`maxWounds: 0`) and took three wounds on
screen. The override was added with a type that also accepted a bare
`wildCard` boolean, on the reasoning that no existing call site would have to
change — and then none of the ten did, so the override reached the rules layer
where the tests were and none of the UI. Nothing failed to compile.

The fix was to stop accepting the boolean, which turned it into ten type errors.
The reasoning that caused it is now written on the type.
