# Changelog

What changed at the table, newest first. Written for the people using it rather
than for the diff: if something is worth knowing before your next session, it is
in here.

Each entry covers one deploy — a push to `typescript-rewrite` publishes to
<https://paulbridger.com/sauvagebot/manifest.json>, and Owlbear picks it up on
reload.

---

## 2026-08-28 — Why the chip never hit anything

It was aimed at the middle of the table, every time, because **nobody was
receiving**.

A Benny only knows where to fly if a player at the table has claimed the sheet it
is going to. Marshal alone in the room, testing? Nobody has claimed anything, so
every toss took the no-receiver branch — which aimed at the centre of the felt and
was solved to stop there. A throw that stops in the middle never reaches a rail.
Reproduced exactly: **0 rail contacts in 40 throws**, which is the number reported.

A chip flung onto the table now goes right *across* it, finds the far rail and
comes back off it, which is both what happens when you toss a chip into the pot
and a throw with something in it. **100% of throws now strike a rail** — every seat
arrangement, every screen size, receiver or not.

**And the bounce is worth watching now.** The rail was too polite. Making it
springier was the obvious fix and the wrong one: the rebound looked great and
carried the chip back up the table, with only 58% finishing at the end they were
thrown to. The answer was the other corner — hit the rail *hard* and come off it
*dead*. The chip now arrives at nearly twice the speed, rebounds a clearly visible
275px, and **97.6%** of throws finish in the receiver's half. It is thrown almost
three times as hard as the distance needs, so the whole thing is played back
slower to compensate — 0.45s to the rail, about 1.2s in all.

**More spin, too**: five to eleven revolutions a second off the hand, two to five
turns before it settles.

**The Marshal's Benny counter at 0.** The gap beside the 0 was never the digit —
it was the − button next to it. With nothing to spend it is disabled, and the
app's general disabled style fades a button to 45% of an already-grey colour,
which is close enough to invisible that the strip read as *gap, 0, +*. The spacing
never changed; the glyph that fills it stopped being drawn. It now stays fully
drawn in a faint rule colour: plainly inert, but still there.

---

## 2026-08-28 — A chip you can see spinning, that actually hits something

Three complaints about the Benny chip, all fair, all now measured rather than
eyeballed.

**You could not see it spin, because the chip was a circle.** It had been turning
two and a half revolutions on every single throw since the day it went in — but
a plain red disc with a soft highlight is radially symmetric, so there was
nothing to see it against. The chip is now a proper poker chip: six cream edge
spots, a cream centre, and one dark index wedge running out to the rim so a full
turn is unmistakable. Slightly larger, too, so the pattern reads at speed.

**It hit nothing, and that was true 85% of the time.** The throw had been solved
so that friction brought the chip to rest exactly where the receiver was, which
is tidy and lifeless: a chip aimed to stop where it is going never reaches
anything. Nobody slides a chip that way. It is now thrown *at* the player, and
what stops it is the rail in front of them — which it now finds on **95% or more**
of throws, on every screen size and seat arrangement tested. The rail is also
deader than the dice's walls now, a clay chip on a padded edge rather than an
acrylic die on a hard one, so it comes off without flying back to mid-table.

**Not enough variation.** The aim now wanders ±18° rather than ±10°, and the
pace ±15%. A die is thrown at a tray, where any direction is as good as another;
a chip is thrown at a person, and needs a wider wobble before it reads as a flick
of the wrist rather than a rail.

One real bug fell out of measuring all this. A chip that clipped the rail could
come to rest **still spinning** — up to nine revolutions a second, frozen
mid-turn — because the spin was paced against the speed it launched at, and a
wall changes the spin. Now that the chip is thrown at the rail, that was going to
happen on nearly every throw. It is re-paced at every contact.

---

## 2026-08-28 — The chip is properly simulated now

The Benny chip was a scripted slide: a path somebody drew, played back the same
way every time. It now runs on actual physics.

**What is simulated.** The chip is a rigid disc with a position, a velocity, an
orientation and a spin, sliding under Coulomb friction and bouncing off the four
walls of your window. It is thrown at the player it is meant for — the speed is
solved so that friction brings it to rest right about where they are — and then
given the same random variation the dice get: the ±10° of throw jitter, a little
on the pace, and a spin that could go either way.

**Watch for two things**, because they are the tell that nothing here is scripted.
A chip that clips a wall while spinning *walks sideways* off it, because the rim
is sliding along the wall and friction acts on that. And a chip that hits a wall
square but spinning comes away turning slower and moving crossways — the spin is
converted into travel. About a third of throws catch a wall, so you will see it.

The numbers are real ones: a casino chip is 39 mm across, clay on baize is about
0.2, and since the chip is drawn at its true size those two facts fix the scale
by themselves — which makes the felt roughly a metre and a third wide on a
laptop, which is about a table. The only invented number is the playback speed,
for the same reason the dice have one.

Two smaller things came with it. The chip now stops **inside** your window rather
than sliding off the edge, which mattered most on the receiving player's own
screen. And Reduce Motion in macOS no longer silently switches the whole feature
off — that was a bug, and it is what made the chip appear to do nothing at all.

---

## 2026-08-28 — A chip slid across the table

**Bennies now travel.** Award one and a poker chip slides across everybody's
screen, out from where the Marshal is sitting and in to where the player is —
spinning as it goes, the way a chip flicked down a felt table does. Everyone at
the table sees the same chip take the same path, because each screen works the
direction out from the two seats rather than being told which way to draw it.

Two cases it handles without being asked. A Benny to an NPC, or to a player who
is not in the room, has nowhere to land, so the chip stops in the middle of the
table instead. And the chip carries no name with it — only two seat numbers —
which is what lets it be shown to everybody even when the character receiving it
is one the players are not supposed to know about.

It is drawn on the dice overlay, so it rides the same switch the dice do, which
brings us to:

**Dice animation is on by default now.** It was opt-in while it was new. It has
since run a season without ever costing anybody a result, and a switch you have
to find before anything happens is a switch most people never find. If you turned
it *off*, it stays off — this only changes what happens for someone who has never
touched it.

---

## 2026-08-28 — Powers, the Marshal's Bennies, and a quieter log

Another round from Damian's thread, plus the two screenshots that came with it.

**The Powers block works.** Three things were wrong with it and they were all one
report. Father Jed's card says `POWER POINTS: 20`; the app was showing you the
rules text of the *Edge* called Power Points instead, because it looked the name
up in the book and the book won. It no longer looks up anything in the Powers
block — a power is your character's, not the rulebook's.

**And you can now edit it.** The character editor has a Powers section, on every
sheet rather than only on player characters. Marshals: this is how you fix an
NPC's powers, or give one some.

**Power Points are tracked.** A caster's sheet shows `14 / 20` under Powers, with
− and + to spend and recover and a **Full** button for a night's rest. It only
appears for characters whose Powers block names a figure, so nobody else sees a
counter they cannot use. The pool follows the character between scenes, like
Bennies — and a character who has never spent a point reads as full, not empty.

**The Marshal has a Benny stack.** Top right of the tab strip, with a − and a +.
It is the Marshal's alone, it survives a reload, and spending one says so in the
log. Bennies were keyed to characters, and the Marshal is not one — which is why
there was nowhere to put them. *"Clear Bennies"* now clears this too, since it
says every Benny in the room.

**Hidden characters stay hidden in the log.** A roll for an NPC whose token is
not on the map no longer goes out to the table. This rule already existed for
damage — "Robed Figure takes damage" is an ambush introducing itself — and now
covers every roll rather than that one. Your own rolls are never affected.

**Players first in every list.** The character picker, the Marshal's roster and
the initiative list before cards are dealt all put player characters at the top,
then sort by name. Names count properly now too, so `Bandit 2` comes before
`Bandit 10` instead of after it. Once cards are dealt the initiative list goes
back to being a turn order, which is its job.

**One spelling for the upgraded Edges.** The book writes *Improved Frenzy*; the
app had ten of them as `FRENZY (IMP)` and eight as `IMPROVED …`, so searching for
what is printed on your card found nothing. They are all `IMPROVED …` now, on
sheets you already have as well as in the picker.

**Mounts can be bound.** Horses and anything else on Owlbear's Mounts layer were
invisible to the extension — not unbindable, *unseen*, which is why nothing you
tried worked. They now bind like any other token: a sheet, wounds, conditions,
badges, and a row in the target list, since a horse is a legitimate thing to
shoot at. They do **not** appear in the initiative list. A mount rides along with
its rider rather than acting on its own card, and nothing needs flagging to make
that happen.

**Damage adjustments in ones.** The Adjust row under a damage roll offers −1 and
+1 as well as −2 and +2 — for Grim Servant o' Death and anything else that moves
damage by one.

*Not changed, deliberately:* Ctrl-X on tokens is Owlbear's, not ours — Owlbear
implements copy and paste on the map but not cut, so the key falls through to the
browser and nothing happens.

---

## 2026-08-27 — From the table: cards, Soak, and melee

Everything here came out of Damian's thread, and three of the four had cost
somebody something at the table.

**A Benny buys one more card, and you choose.** Level Headed *"draws an
additional Action Card and chooses which to use"*; Improved *"draws two
additional cards and chooses which to keep"*. The app was choosing for you —
always the highest — and binning the rest. That is not the rule, and it was
actively expensive for **Calculating**, which gives 2 points of penalty relief
on a Five or less: Paige has both Edges, and her good card was being thrown away
every round.

Now the whole hand stays. The initiative row shows every card you drew with the
one you are acting on drawn large and the rest small beside it — **click one to
switch**. The same control appears on the Level Headed entry on your sheet,
because that is the other place you look. A hand of one card looks exactly as it
always did.

**Spending a Benny for a card now adds one card**, rather than re-dealing your
whole hand and throwing away what you held. With Level Headed that was two fresh
cards for one chip and your existing card gone; it was wrong even without the
Edge. The row's `Deal` works the same way, and neither of them switches you to
the new card — that is yours to decide.

**Improved Level Headed finally deals the third card.** The catalogue names ten
upgraded Edges `X (IMP)` and eight `IMPROVED X`, and only the second form was
recognised — so `Level Headed (imp)` read as plain Level Headed and dealt two.
Both spellings now work everywhere, which also means about nine other upgraded
Edges stop showing on sheets with no rules text.

**Soak is offered to the player who was hit.** It was only ever visible to
whoever rolled the damage, so the Marshal saw "Soak 3" and the player did not,
and spending a Benny told them they had not been damaged. The offer now lives on
the token. It stays until you use it — pass or fail, the Benny is spent either
way — or until the next round is dealt.

**Shots into melee need 1.5 cells, not 2.** Two tokens with a clear cell between
them were being resolved against Parry. The check used the true distance while
the row printed a rounded one, so anything from 1.01 to 1.99 showed as "Dist 2"
and counted as a struggle at arm's length. 1.5 sits in the gap a square grid
leaves: touching orthogonally is 1, diagonally about 1.41, and the next ring out
is 2.

**A typed roll is logged as the character on screen.** `s8` in the box used to
show your Owlbear player name while clicking an attribute showed the character.
Deliberately narrow, because attributing a freeform roll to whoever happens to be
selected is easy to get wrong: it only names a character when you are on the
sheet tab, looking at them, and acting for them. Otherwise it is your name, as
before.

**Hearts and diamonds are red in the roll log.** They always were in the turn
order; the log is built as plain text and the symbols carried no colour at all.

**And the distance a row shows is now the distance it uses.** The other half of
the same rounding: a shot at a true 2.1 cells printed `Dist 2` and was charged
Medium, which made a `2/4/8` weapon impossible to use at short range. The
distance is now rounded once, where it is measured, and everything reads that one
number — so `Dist 2` is short range, always.

A decimal appears only when there is one: `Dist 2` for tokens on the grid, and
`Dist 2.1` exactly when that fraction is the thing costing you the band.

---

## 2026-08-27 — Villains live with the map

**Your PCs are kept for the campaign; villains are kept with the scene.** That is
the whole change. The room's ~16 kB was the wall every import kept hitting — a
scene measures at over 1 MB and writes in 4 ms, so the Marshal's half of the
roster now has about fifty times the room to breathe in.

**The roster table has a new `Kept` column, and it is the control.** It reads
`Room` or `Scene`, and pressing it moves that character between the two. So a
named villain you have edited — someone who should still be around in three
sessions — gets promoted to `Room` and follows you to every map, while tonight's
mooks stay with the board and leave when it does. New characters file themselves:
a PC to the room, an NPC to the scene.

Handing a character to the players (the `PC` column) promotes them to the room
automatically. A PC that vanished when you changed map would look like the app
losing them. The reverse is *not* automatic — a campaign-level villain is exactly
what `Kept` exists to allow.

**The old `Scene` column is now `Fight`.** Same IN/OUT control, same meaning; the
name had to move because the new column's values are Room and Scene.

**Deleting is easier, and safer.** The Delete button is at the top of the sheet
rather than past Advances. A scene-stored NPC goes in one press with no dialog; a
PC or a campaign-level NPC still asks, because you said they mattered when you
promoted them. Either way an **Undo** sits in the notice bar for twelve seconds
and puts them back where they were — which protects you better than a dialog,
since nobody reads the fourth confirm. The notice also says how many tokens on
the map it just left unbound, which nothing used to mention.

Deleting a character now clears their Bennies too. Chips for characters deleted
weeks ago had been sitting in the room the whole time.

**If the panel says someone is stored in both places**, that is a move that wrote
the copy and then failed to remove the original. The campaign copy is the one in
use, and pressing `Kept` twice clears the other. Nothing is lost either way —
moves always write before they remove.

With no scene open the roster still works, showing the campaign half; a villain
saved then goes to the room and says so rather than disappearing.

---

## 2026-08-27 — A gang acts on one card

**Mooks off the same stat block now share an Action Card.** Deal a round and all
five bandits come up on the same king, because that is how Savage Worlds runs a
gang. The book never spells it out in the combat chapter, but Tactician and the
Command Edge both hand a card to *"any allied Extra (or group of Extras sharing
an Action Card)"*, which only means something if sharing is the ordinary case.

The grouping is **by sheet**, and it needs nothing set up: bind six tokens to one
Bandit sheet and they are a gang. A Wild Card has one token, so nothing changes
for the PCs.

**Each mook still gets its own row.** They share the draw, not the row — wounds,
Shaken, the redraw button and the map are all exactly as they were, and a token
still carries its own copy of the card rather than pointing at a shared one.

**Rows with the same card now sort by map label**, counting the numbers in it, so
`Bandit 2` comes before `Bandit 10` and the block stays put between rounds.
Previously equal cards fell back on whatever order Owlbear returned the tokens
in, which shifted when anyone moved one.

**The round's log line collapses too** — `Bandit 1, Bandit 2, Bandit 3 ♠K`
instead of the same king printed three times. Two gangs that happen to draw the
same card stay on separate lines: those are different facts about the round.

**A mook arriving mid-fight joins the gang** instead of drawing against it. Drag
three more bandits on, press Deal on each, and they come up on the card the gang
is already acting on — the row's Deal button does that whenever the mook holds
no card. Press it on one who *does* hold a card and it still draws fresh: that is
the escape hatch for the bandit who should not be on the gang's card, and it is
deliberately one token, so redrawing a whole gang is one press per body. If the
gang has already been split that way, a newcomer draws fresh rather than the app
guessing which card was the real one.

Deck maths follows the gang rather than the bodies — a gang of six spends one
card, so the deck lasts a great deal longer in a big fight.

---

## 2026-08-21 — Sizes, not body parts

**Called shots are now a size.** The old list — head, hand, item — has gone, and
that is the rule rather than a simplification. p161: *"Use the Scale of the
target when making called shots against creatures, not their Scale. If a hero
wants to blast the eye out of a Huge terrantula, for example, use the Scale of
the eye, not the critter."* Every number the old list carried was a row of that
table read off a human, and it stopped being right the moment the target was not
one. So the control is one row of the book's seven steps, Tiny to Gargantuan,
with the examples on hover. A wagon-wheel-sized eye is Normal Scale and free.

One of the old figures was simply wrong: a human limb is Small (−2), not the −4
it was priced at.

**Vitals is its own toggle**, because size cannot answer it — a rattler's head is
Gargantuan and a man's is Very Small, and both are worth +4 damage (p154).

**Shots into melee are resolved against Parry.** p160: *"The TN is the defender's
Parry instead of Short Range as they struggle, wrestle back and forth."* Inside
two cells the panel now assumes it, and each target's row says what the shot has
to beat — `vs 4`, or `vs 6 (parry)`. That cell is a button: click it when the app
has guessed wrong. Changing it after the dice have landed appends a correction to
the log rather than quietly moving the answer.

Not enforced, and in the tooltip instead: no rifles in melee, and shooting at
anybody *else* while engaged makes you Vulnerable.

**A Running die sits beside Pace.** d6 by default, d8 with Fleet-Footed, d4−1 for
Sir Ed's Elderly, and whatever a creature's stat block says for a creature. It
rolls plain and never Aces (p151) and reports the distance, not the die. It does
**not** set the −2 to all actions that turn — that is already on the modifier
track, where you can clear it.

**The shot panel folds up.** The −8…+8 dial lost its caption, and Aim, the called
shot, Scope, Load and Cover now live behind a Conditions expander — anything set
stays on screen so a penalty never has an invisible cause.

**Cover is one control for the whole shot**, not one per target. By the book it
belongs to whoever is behind the water trough, and a column of cover buttons down
the target list said so — but it read as an instruction to fill in all of them
before rolling. What it can no longer say is that one target is in the open and
another is not; that costs a second shot, or the hand dial.

**Each target's row now carries its own arithmetic**: the shooter's wounds in
red, everything this shot has going for it in green, and the target number.

Fixed: chips gained a pixel on every side the moment they stopped reading `+0`,
which shifted the line they were on.

---

## 2026-08-20 — Shoot, then roll

Rolling Shooting used to throw the dice first and *then* offer a table of
everyone the shot might have been aimed at, each with their own hit, miss and
raise count worked out. Damian objected: it deals out six outcomes when the
player had already decided who they were shooting at. He was right, and so is
the book — p147 says *"Before you roll, assign your dice to all possible
targets."*

On the weapons table, **Shooting is now Shoot**. It opens a panel under that
weapon rather than rolling, and the roll happens further down once there is a
target to name.

**What the panel holds.** How you are taking the shot — Aim, a Called Shot, a
scope, buckshot or slugs, and the hand dial — then everyone in sight with their
range and their own cover. Cover is on the target's row rather than the shot's,
because the water trough belongs to whoever is behind it.

**Everything stays live after the dice land, except the dice.** This is the part
worth knowing. Roll first, and if the Marshal says "you aimed last round", click
Aim — the arithmetic changes and the damage is rolled against the corrected
number. Nothing re-rolls, ever. Each correction appends a line to the log,
folded under the roll it corrects, so the Marshal sees what changed and when
without a wall of new lines. Rate of Fire is the one thing fixed at the moment
you roll, because it decides how many dice are thrown.

**The raise die comes with the damage.** A raise on the attack is worth +1d6 —
one die however many raises — and the panel resolved the attack, so it puts the
die in the damage expression rather than asking you to remember to claim it. It
appears and disappears as you correct the shot afterwards.

**It carries through to the wound.** Hit, then Damage, then the Marshal's
½ / ×2 / ±2 adjustment, then Apply — at the target the panel already declared,
without going back to the map to select the token or back to the log to find the
roll.

**The log line names its target instead of offering a table.** A shot rolled
through the panel already has range and cover inside its total; the old
expandable target table applied them a second time, which turned two raises into
one. Rolls that did *not* name a target — the skills list, a Fighting swing —
keep the table, which is where it was useful all along.

**The dice finish before the answer appears.** The panel holds its verdict for
exactly as long as the log holds its line — it used to print "hit, 2 raises" the
moment you pressed Roll, which answered the question the animation was still in
the middle of asking. The log's own fallback timer was also firing early on
exploding dice, so a wild die that aced twice had its line appear while the last
die was still rolling. Both fixed.

**Rules that arrived with it.**

- **Extreme Range.** Shots past long range were refused outright — the app said
  "the shot cannot be taken" to a rifleman with a target well inside what the
  book allows. Extreme reaches **4× long range at −8**, or −6 with a scope, and
  wants the shooter to have aimed last turn. Shotguns firing buckshot and thrown
  weapons still cannot; slugs can.
- **Aim** cancels up to 4 points of range, cover, called shot, scale or speed —
  or a flat +2. It does *not* touch Recoil, darkness, wounds or anything you
  dialled by hand, and the panel says which penalties it spent its four points
  on rather than deciding quietly.
- **Called Shots.** Head or vitals is −4 to hit and **+4 damage**, and the +4 is
  already in the damage button when you get there.
- **Shotguns** add +2 and pick their own dice from the range — 3d6 short, 2d6
  medium, 1d6 long — instead of offering all three and hoping. Slugs are 2d10 at
  any range, give up the +2, and stray only on a 1.
- **Recoil** (−2 for firing more than one shot) and the stray-shot window now
  read the Rate of Fire you **declared**, not the one printed on the gun. A
  Gatling fired one shot at a time had been taking a penalty it should not and
  endangering bystanders on a 1–2 when one bullet was in the air.

**Firing more than once.** A weapon with a Rate of Fire above 1 shows a row of
**cartridges** on every target — one per shot the gun can throw. Click to give
that target one, two, three; click the one you are on to take it back. The rows
share a magazine, so a round spent on one man is drawn spent on everyone. Then
press **Roll**. Fire fewer than the gun allows and it rolls fewer dice, which the
book permits outright.

After the dice land you **place them by hand**: each result is a button, and you
give it to whichever target you like. That is the rule (p147) rather than a
convenience, and it is the honest answer to Damian's original objection — you see
the dice before you place them, but placing them is your move, not the app's. Two
shots may go to the same target; that is two attacks, each with its own verdict,
damage roll and Apply.

Rate of Fire is a ceiling, not a quantity, so a Gatling putting one bullet into
one man takes no Recoil and endangers bystanders only on a 1.

**Rock and Roll! works.** The Edge that ignores the Recoil penalty was doing
nothing at all — Reggie has it and was paying the −2 anyway. A bipod or tripod
written on the weapon does the same.

**The panel stays open between shots.** A Multi-Action is roll, damage, apply,
roll again, rather than closing and reopening the pane each time. Aim, the called
shot, the dial, the load and each target's cover carry into the next shot; they
are how you are shooting, not what you shot at.

**Not yet.** Fighting still rolls straight off its button — a melee panel wants
Gang Up and Wild Attack, which is separate work. Suppressive Fire is not here at
all.

**If the panel cannot say what happened, use the manual roller and apply wounds
by hand.** That path is not going away, and it is the right answer whenever this
one gets in the way.

---

## 2026-08-19 — The modifier dial goes to ±8

`0097a72`. Damian's request.

The hand-dialled modifier now runs **−8 to +8** instead of −6 to +6. Penalties
stack — Pitch Dark and a called shot will do it — and the dial was running out
before the situation did.

Seventeen pips will not fit across the panel with a sign on every one, so the
signs are now only where they earn their place: **−8 7 6 5 4 3 2 −1 0 +1 2 3 4 5
6 7 +8**. The ends of each run are marked and position does the rest. Hover still
gives the exact value. It ends up slightly *narrower* than the old thirteen.

The line under a ranged attack's target table is gone — it explained why the
Parry column was blank, which was more words than the blank needed. Fighting
still says "Resolved against Parry."

---

## 2026-08-19 — Parry stays off the table when you shoot

`4887f83`.

Rolling Shooting listed **every** target's Parry, which told the players a number
off each of the Marshal's sheets and did nothing for the maths — a shot is
resolved against a flat 4, not against Parry.

Now it shows only where it earns its place: always on a **Fighting** roll, which
*is* resolved against it, and on a shot that landed **within 2 cells**, where it
may have been into melee and you may need the number. Otherwise the column is
blank. Nothing else about the table changes, and no result moves.

One honest caveat: this stops the number being put in front of people, but the
roster lives in room metadata and every client can read it. Like hiding an NPC's
name, it is a screen rather than a lock.

---

## 2026-08-19 — One line each, and "More" for the rest

`d2736ac`. Fixes the wall of text the entry below introduced.

Every edge and hindrance now shows **the rulebook's own one-line summary** —
"Elan: +2 when spending a Benny to reroll a Trait roll", "Guts: Free reroll when
making Fear checks". The full entry is behind a small **More** button beside the
name.

The summaries are the book's, not ours: it prints them in tables at the back,
written by the designers, leading with the mechanic. 31 of the 32 entries across
the party's sheets have one. The odd one out is Agency Promotion, which the book
simply never lists — it shows its full text, as does anything homebrew.

A handful of improved Edges — Improved Level Headed, Improved First Strike —
have no More button on purpose. The book writes those as "As above but…", so the
summary is the *longer* and more useful of the two.

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
