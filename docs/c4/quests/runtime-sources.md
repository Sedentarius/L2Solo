# Reviewed runtime resolutions

The source package is unchanged. Implementations use independently authored
definitions and the existing QuestService/Bridge. No external server code is
included. Technical reference: [Mobius C4 at 6674a607](https://github.com/tichopad/L2J_Mobius/tree/6674a607727e342d42bb7ce3bf81fe7513067611/L2J_Mobius_C4_ScionsOfDestiny/dist/game/data/scripts/quests).
Each Q00NNN directory's Java handler was read for factual mechanics.

| Quest | Resolution of missing or incomplete inventory facts |
|---|---|
| 261/262 | Eight guaranteed spider legs for 1000 Adena + 2000 EXP; ten fungus sacs with 40%/30% species chances for 3000 Adena. |
| 272 | Orc level 5; 50 guaranteed heads for 1500 Adena. Goblin Tomb Raider Leader is a normal kill target: no new boss primitive is required. |
| 291 | 40 guaranteed pelts; reward weights 3/18/25/54, last outcome grants both hairpin 1505 and escape scroll 736. |
| 294 | Dwarf level 10; 100 bat fangs with species-dependent 1–4 amounts; 600 SP plus ring 1508 if absent, otherwise 2400 Adena. |
| 263/306/317 | Continuous collection with unit payouts and a bonus at ten items: 20/30 + 1000, 60 + 5000, and 40 + 2988 Adena respectively. Uses the reference's ordinary reward mode, not its optional alternate village reward setting. Leaving the quest removes remaining quest items. |
| 259 | Guaranteed spider skins; Edmond pays 25 each + 250 at ten. Marius exchanges ten for one potion 1061 or fifty arrows 17. Both choices require the correct NPC and atomically consume the skins. |
| 274 | Requires either Q271 necklace, retained; 40 heads plus independent 6% totem drops; 3500 Adena + 600 per totem. |
| 316 | Elf level 18; 40% rat fang drops; Varool trophy 20%, maximum one. Payout 30 per rat fang + 10000 trophy, +5000 only for ten rat fangs. Varool already has an authored spawn; no new encounter primitive. |
| 379 | Reviewed two-objective definition exists but is disabled: item templates 5893/5894/5956/5957/5958 are absent. Multi-objective atomic collection is tested with existing templates; that test does not certify Q379. |
| 347 | Consult Balanki (100 Adena) and Spiron in either order, then Silvera; ten crystals 4286 from mob 540 at 50%; calculator 4285 exchanged for calculator 4393 or 1000 Adena. Both orders and reward choices are tested, including restart, payment, NPC and replay guards. |
| 296 | Requires either ring 1508/1509, retained. Exclusive per-kill outcomes: spinnerette 4%, silk 50%, nothing 46%. Nathan converts all spinnerettes to 15–24 silk each using one batch roll. Mion pays 20 per silk +2000 at ten; quit removes both quest items. |
| 296/306 availability | Q296's reference target 394 and Q306's 112–115 have no local authored spawn. Q296's 394 is also absent from the pinned DwarvenStarting.xml. Active definitions retain only spawned alternatives (403/508 and 109/110). Their full payment paths pass, but both quests are PARTIAL/BLOCKED until those explicit content gaps are resolved. Coordinates are not fabricated. |
| 292 | Dwarf level 5; exclusive 40% trophy / 10% memo / 50% no drop. Three memos atomically become one contract and pause memo drops. Spiron pays 12/36/33 per trophy, +1000 at ten trophies, +1120 for an accompanying contract. Balanki separately pays 1500 per contract. Both buyers consume the contract and restart memo collection. |
| 325 | Curtis starts; Samed grants diagram before corpse collection. Species-specific exclusive drops use the reviewed cumulative table. Varsak consumes five different bones for a 90% assembly chance. Samed offers separate skeleton-only sale (341 each +543), or all-piece sale (unit prices 30/20/20/100/40/14/14/14/341; +1629 above ten pieces, +543 if a skeleton is present). Quit pays once and removes diagram/items atomically. Opening the buyer does not force a sale. |
| 258 | Guaranteed pelts; 40 required; equipment lottery weights 1/5/3/4/3 out of 16. |
| 264 | Goblin claws 2 or 4; wolf claws 1 or 2; seven reward outcomes, including equipment and Adena. Inventory's 50 Adena is only one conditional award. |
| 271 | Orc restriction; fangs 1 (75%) or 2 (25%); necklace 1507 (10%) or 1506 (90%). |
| 277/297 | 50% drops; two charms 1658 / tokens 1659 respectively. |
| 295 | 50 stones, 1 (74%) or 2 (26%) per kill; ring 1509 if absent, otherwise 2400 Adena, plus 500 SP. |
| 303 | 40% drops; 1000 Adena and 2000 EXP. |
| 313 | 40% drops; 3500 Adena. |
| 319 | 20% drops; 3350 Adena **and item 1060**, omitted from inventory reward list. |
| 320 | Dark Elf restriction; hunter 18%, archer 20%; 8470 Adena. |
| 324 | Prowler 22%, Poison Spider 23%, Arachnid Tracker 25%; 5810 Adena. |
| 341 | Four bear species missing from inventory steps: 20021/20203/20310/20335, chances 50/90/50/70%; 3710 Adena. Local item 4259 is nonstackable, so collection sums all physical instances. |

These quests are repeatable in the technical reference. Bot autonomous goals
perform one completion, then retain their completion marker; humans may restart.
This is a deliberate scheduling abstraction, not a different reward rule.
Continuous bounties expose their normal talk/kill/quit handlers to Quest Bridge;
automatic selection of when to cash out remains uncertified.

The pinned Player.java persists beginner eligibility at creation from first-character
account status or an explicit server override; its quest handlers additionally use
a character-wide NEWBIE_SHOTS_RECEIVED receipt. L2Solo lacks the historical eligibility
flag. The remaining five beginner-reward quests need a deliberate migration and
atomic shared receipt, not an inference from present level or current inventory.

Profession completion uses the inventory's 3200 EXP and per-quest SP values.
Proof and quest completion are atomic; transfer at level 20 consumes the proof
and writes a durable consumed marker. Profession quests remain one-time in the
current runtime, unlike the inventory's REPEATABLE classification. No migration
silently grants proof to historically promoted characters.
Q401's reviewed route schedules NPC travel, script events and trial equipment
through the current Bridge. Its autonomous SQLite test starts with no quest or
proof, restarts during progress and ends at Warrior with a spent proof receipt.
The other seventeen professions share the transfer contract; their autonomous
retail routes and intermediate transaction recovery are not yet certified.

Q038/Q039 remain disabled: missing templates 1100/1101 and 925 respectively.
Their old handlers also lack atomic hand-ins and completed-state restart guards;
simply registering them would not certify playable content.

Q151, Q155, Q156 and Q161 preserve their existing L2Solo mechanics in reviewed definitions.
Their old module paths are compatibility entry points. Real SQLite tests cover
every delivery, restart between NPCs, stale-session rejection, final reward and
one-time completion. This replaces separate item/state writes with QuestStep.
The existing Q155 reward is one item 734; Q156 gives item 5250 and 3000 EXP.
The supplied inventory omits both item rewards, so these are recorded as local
runtime evidence rather than silently added to the historical package.

Q153, Q160 and Q168 likewise preserve existing L2Solo delivery mechanics, with
atomic exchanges and completion. Q153 permits all six package orders; Q168
requires Harant and Jenna before either order of Roselyn/Kristin. Q160 now rejects
restarting after completion. Q153's two rings (875) and three intermediate shots
(1835), and Q160's five potions (1060), are absent from the inventory's item rewards.
Those local rewards remain; Q153 additionally retains a durable intermediate-reward
receipt across cancellation so restarting cannot farm Sylvia's shots. No historical
inventory field was changed to hide these differences.

## Q275/Q276 quest spawns: the encounter blocker was over-broad

The earlier `ENCOUNTER_HANDOFF_UNCERTIFIED` blocker assumed every scripted
encounter needed a durable, restart-recoverable lifecycle. For Q275 and Q276
that assumption does not match the pinned handlers. Both use a plain transient
`addSpawn` at the killed mob's coordinates: Varangka's Tracker (local 5043) and
the Kasha Bear Totem Spirit (local 5044) are ordinary quest monsters that exist
only until they are killed or the server restarts. The reference neither
persists them, nor enforces a singleton, nor restores them on login.

They are therefore implemented on the existing `QuestService.spawnQuestNpc` /
`World.spawnQuestNpc` path, which already supplies `questSpawn.ownerId` and
`questSpawn.questId` and the ownership filtering in `QuestService.onKill`. No
new encounter subsystem was added. Matching the source was preferred over
satisfying the older speculative blocker text.

Both spawn rules are certified at their exact authored boundaries rather than
sampled. Q275 spawns its tracker on a roll below 10% while the fang count is
strictly above 10 and strictly below 66, and the tracker pays five fangs
outright without clamping the total back to seventy. Q276's tiers keep the
reference's own comparisons, including the `<=` tiers at 69/59/49 and the `< 2`
tier at 39, and 79 parasites always provoke the spirit.

Q419's hunting phase previously dropped a proof on every eligible kill. The
reference gives each target its own chance (60/75/100%, and 75/100% for the
Dwarven pair) and only while the character carries its race's Animal Slayer
List. Both are now enforced; the fifty-proof cap is unchanged.

## Q340: the raid boss ID mapping, the transient chest and the relic dead end

Three facts about Q340 had to be settled against the local runtime rather than
assumed from the usual ID arithmetic.

**The raid boss is 10146, not 5146.** Q340's final target is reference 25146,
Serpent Demon Bifrons. The catalogue's ordinary rules (NPC = reference − 23000,
mob = reference − 20000, quest monster = reference − 22000) would give 5146, but
local 5146 is Tarlk Raider Triska, which is reference 27146 — an unrelated quest
monster at level 48. Serpent Demon Bifrons is native **10146** (raid bosses carry
a −15000 offset), it is authored in `data/Npcs/c4_raid_bosses.json`, and it is
spawned at (−13698, 213796, −3300). No coordinate was invented.

**The chest is a transient quest spawn, not an encounter subsystem.** The
reference is `addSpawn(CHEST, npc, false, 30000)`: spawn NPC 30989 at the fallen
boss for thirty seconds. That is exactly `QuestService.spawnQuestNpc` with
`despawnDelay: 30000`, which already carries `questSpawn.ownerId` and
`questSpawn.questId`. The quest additionally refuses the chest to anyone but its
owner, which the reference does not do but the local quest-spawn convention
does; the chest is not restored across a restart, and the quest state is. The
older `ENCOUNTER_HANDOFF_UNCERTIFIED` blocker was over-broad here for the same
reason it was for Q275/Q276.

Native **7989** (Chest of Bifrons) had no local template and is added in
`data/Npcs/c4_quest_content.json` from the pinned reference's own stats. Item
4255 (Trade Cargo) was authored non-stackable locally while the pinned source
sets `is_stackable="true"`; the quest requires thirty of them and the backpack
lookup reads a single stack, so the local entry is corrected to match the
source. That divergence is systemic in the local item datapack — roughly two
thousand items differ from the pinned source on stackability — but only the
entries a quest in this catalogue actually needs are being corrected here.

**The relic drop has one deliberate, minimal deviation.** The reference rolls
the pair inside `getQuestItemsCount(player, HOLY) < 1`: a 10% chance of Agnes's
Holy Symbol and, only in that same instant, a nested 10% chance of Agnes's
Rosary. Adonius demands both, and nothing else in the quest can ever yield
either, so nine players in ten who obtain the symbol are permanently stranded at
condition 3. The rolls and their rates are kept exactly as authored; only the
outer guard is widened from "does not hold the symbol" to "does not hold both",
so the missing relic stays reachable at the same 1%-per-kill rate. This is
recorded as an implementation choice, not a source fact.

The refusal branch is preserved as authored. Thirty cargo boxes open a real
choice: the temple mission (consume the cargo, advance to condition 2) or a flat
4090 adena, which itself splits into continuing the cargo hunt at condition 1 and
`exitQuest(true)` — a repeatable release, not a completion. Only the temple route
reaches Weisz's single 14700 adena completion.

## The music, wine and feast chain: Q362, Q363, Q364, Q379 and Q378

These five were blocked together because they share one datapack gap, and they
are genuinely one chain: Q379 pours the wine, Q364 writes the musical score, and
Q378 consumes both at Ranspo's banquet.

**Restored NPCs.** Native 7956 Nanarin, 7957 Swan, 7958 Galion, 7959 Barbado,
7960 Beer Chest and 7961 Cloth Chest were absent. All six are authored in
`data/Npcs/c4_quest_content.json` from the pinned reference's own stats, and
spawned in `data/Npcs/Spawns/c4_quest_content.json` at the reference's own
coordinates — Nanarin, Swan, Barbado and the two chests in Dion, Galion on the
road at 21_23. Those coordinates were not guessed: every Dion NPC that already
existed locally (Ranspo 7594, Harlan 7074, Woodrow 7837) carries byte-identical
coordinates to the pinned spawn files, so the same files are authoritative for
the six that were missing.

**Restored items.** 5893 Leaf of Eucalyptus, 5894 Stone of Chill, 5956/5957/5958
the fifteen-, thirty- and sixty-year wines and 5959 Ritron's Dessert Recipe are
added to `data/Items/Others/others.json` with the source's own stackability,
weight and price. The two ingredients are quest items; the wines and the recipe
are ordinary tradable goods, which is why they survive the quest that made them
and can be carried into Q378.

**Q362 Bard's Mandolin** is a pure talk chain and is expressed as a reviewed
definition: Woodrow names Galion, Galion hands over Swan's flute, Swan adds his
letter, Nanarin takes both, Swan pays 10000 adena and the Theme of Journey. The
reference exits repeatable, so it can be run again. Swan is both the start NPC
and a mid-chain stage, which is new for the declarative engine; the shared
walker in `test_c4_declarative_quests.js` now only probes "the start NPC does
not advance somebody else's stage" when the stage is in fact somebody else's,
and asserts it rather than ignoring the result.

**Q363 Sorrowful Sound of Flute** is scripted because its outcome lives in a
variable, not in an item. Any one of five townspeople will give an opinion;
Nanarin then takes one of three props on stage; Barbado records whether it was
the flute. Only the flute pays the Theme of Solitude. The verdict and the props
are settled in one transaction, so a prop can never be carried into a second
report, and a failed performance releases the quest for another attempt.

**Q364 Jovial Accordion** is scripted for its chest mechanic. Swan hands over two
keys; each key opens its chest exactly once and finds the goods only half the
time, so a run can recover two, one or nothing. Returning the goods to Sabrin and
Xaber is what counts: Swan pays a hundred adena only for both, still advances for
one, and — when both keys are spent and nothing was recovered — simply ends the
errand, exactly as the reference does.

**Q379 Fantasy Wine** keeps its existing reviewed definition; only the
`MISSING_ITEM_TEMPLATES` block is lifted. The reference's `getRandom(10)` split
(under 3, under 9, otherwise) is the definition's 3/6/1 choice weights. One
difference is deliberate: the reference's `giveItems` is unconditional, so a kill
after the eightieth leaf pushes the count past 80 while the hand-in demands
exactly 80 — the declarative engine caps each objective at its own total, which
keeps the quest finishable. The reference's "give up" page is covered by the
client's ordinary quest-abandon button, which routes through `onAbort`.

**Q378 Magnificent Feast** is scored, not randomised. The wine contributes 1, 2
or 4, the food recipe 8, 16 or 32, and the musical score is required but adds
nothing, which is exactly why only nine totals exist. All nine reward rows are
implemented verbatim and certified individually — item, amount and adena — and
the sums 11, 19 and 35 are shown to be unreachable by construction. Its
remaining inputs, Jonas's three recipes and Ritron's Dessert Recipe, come from
quests above level 20 and therefore outside this catalogue; their templates
exist, which is what this catalogue is responsible for.

## Q38 and Q39: the three missing quest monsters

Both quests were blocked on absent monsters, and both turned out to need more
than the blocker text said: nine quest items (7173-7181) and Q39's three
fishing rewards (6521, 6529, 6535) were missing too.

**The monsters.** Native 1100 Langk Lizardman Sentinel (reference 21100), 1101
Langk Lizardman Shaman (21101) and 925 Giant Araneid (20925) are authored in
`data/Npcs/c4_quest_content.json`, spawned from the reference's own coordinates
in `data/Npcs/Spawns/c4_quest_content.json` (23, 28 and 46 authored points
respectively, at the reference's own respawn delays), and given their full
reference drop and spoil tables in `data/Npcs/Rewards/c4_quest_content.json`.
They are ordinary world monsters, not quest spawns: the reference registers them
through `addKillId` only, with no `addSpawn` anywhere, so they are authored as
permanent population.

Their combat stats needed a decision. Identity is taken from the reference -
name, level, aggression, race, collision, weapon, clan, movement speed - and so
are the drop tables. The level-driven combat curve is taken from a named local
monster of the same level instead, because the local datapack's curve is its own
and disagrees with the pinned reference for every monster that already exists in
both: local HP is uniformly the reference's times about 1.579, local movement is
the reference's times 1.1, and local `rewards.exp` is the reference's exp divided
by the square of the level (verified exactly against 152, 294 and 140). The
models used are 152 Lizardman for the Sentinel, 921 Maille Lizardman Guard for
the Shaman and 140 Giant Leech for the Araneid - each the same level and, where
possible, the same family. Nothing was invented: every number is either the
reference's or an existing local monster's.

One reference detail is deliberately not carried over. Giant Araneid declares
`sNpcPropHpRate` 0.5, but the local datapack does not honour that field anywhere:
every existing monster whose reference entry carries a rate still has exactly its
level cohort's HP. Applying it here would have made this one monster the only
exception in the datapack.

**The quests.** Both handlers were legacy compressed scripts with non-atomic
hand-ins and one real defect each. Q38's rewrite puts every hand-over and its
condition in one commit and keeps the reference's own chances (a feather on every
kill, a tooth on half). Q39's old handler dropped necklaces at 50% where the
reference drops them always, and advanced on the *sum* of the two necklaces
rather than on both stacks being full - which let a player finish the first
collection with a hundred of one colour and none of the other. Both are fixed,
and the paired check is asserted directly.

Both quests also gained the same recovery the declarative engine already has: a
collection that is already full advances when its NPC is next talked to, so a
character whose database predates atomic quest steps is not stranded at the
collecting condition.

## Q266 and Q267: the Murika and Bremec mapping, resolved by spawn evidence

The earlier experiment refused to guess these, and it was right to: two local
templates carry each name. Native **195** and **12091** are both "Pixy Murika";
native **196** and **12092** are both "Treant Bremec". Reference 31852 and 31853
have no 8852/8853 counterparts, so the catalogue's usual −23000 arithmetic does
not reach them and a name match alone proves nothing.

The evidence that settles it is the world, not the name. **12091 Pixy Murika is
spawned at (49262, 53607, −3216) heading 53248 — byte-identical to the pinned
reference's `ElvenVillageNPCs.xml` entry for 31852.** The 195 alias has no world
spawn at all. The rest of that same reference block matches locally too (Newbie
Guide 30599→7599 and Rizraell 30361→7361 both at the reference's own X/Y), which
establishes the block as the local source. So:

* Q266 Pleas of Pixies starts at native **12091**.
* Q267 Wrath of Verdure starts at native **12092** — the same id block as its
  proven sibling, the same name, and the only Bremec with a world spawn.

Native 195 and 196 are left in place as unspawned legacy aliases. Removing them
would be a larger change than the mapping needs, and the certification test
asserts directly that they carry the same names and no world spawn, so the
ambiguity is recorded rather than hidden.

**One spawn was corrected.** Local 12092 stood at (35689, 47039, −3609), which
corresponds to nothing in the pinned reference and is out in the forest, far from
a level-4 Elf's village. Every other NPC in the reference's Elven Village block
matches locally, including Bremec's own quest partner. Its position is therefore
corrected to the pinned C4 coordinates (50592, 54896, −3352, heading 40960). That
is the smallest correction that makes both quest-givers reachable where C4 puts
them, and it changes one spawn entry and nothing else.

**The mechanics.** Q266 is a reviewed definition: each of its four targets has
its own chance *and* its own amount — the grey wolf always yields two or three,
the elder red keltir always two, the young red keltir one at 80%, and the red
keltir at 60% yields one on a `getRandom(3)` of zero and two otherwise. The
reward is the reference's own `getRandom(100)` split (under 10 emerald, under 30
blue onyx, under 60 onyx, otherwise a glass shard), expressed as 10/20/30/40
choice weights.

Q267 stays a script because it pays **one Silvery Leaf per club** rather than a
flat sum, and the declarative cash-out pays adena, not a token per item. It keeps
the reference's half-chance drop, its uncapped collection, its 600-adena bonus at
ten clubs, and its explicit end-the-task branch, which surrenders unpaid clubs
and releases the quest rather than completing it.

### The reference ships its own ID table

While resolving Q296's target it turned out the pinned reference carries an
explicit mapping file, `stats/npcs/CT0_to_C4_ids.txt`, with 5780 `reference;local`
pairs. It confirms independently every mapping this task derived by other means:

```
20925;925      21100;1100     21101;1101
25146;10146    30989;7989     30956;7956 … 30961;7961
31852;12091    31853;12092
```

In particular the Murika and Bremec mapping is a **stated source fact**, not an
inference from spawn coordinates, and the raid-boss offset that made Q340's
25146 land on 10146 rather than 5146 is confirmed there too. This file is the
first thing to consult for any future ID question in this catalogue.

## Q296 and Q306: which targets a player can actually reach

Both blockers were about availability, and they resolve in opposite directions.

**Q306's four missing variants were a real local gap.** Salamander Elder 112,
Undine Elder 113, Salamander Noble 114 and Undine Noble 115 had local templates
but no world spawn, while the pinned reference spawns all four in `21_25` (three,
three, five and five authored points). They are added to
`data/Npcs/Spawns/c4_quest_content.json` at the reference's own coordinates, and
the definition now carries all six targets with the reference's own chances: 30%
for the plain pair, 40% for the elders, 50% for the nobles. Katerina's payment is
unchanged and was already faithful - sixty adena a shard, plus five thousand once
ten shards of either element are handed in together.

**Q296's missing target is not a gap at all.** The reference registers Crimson
Tarantula 20394 (native 394) as a third kill target, but the pinned C4 datapack
**never spawns it**: its template exists in `stats/npcs`, it appears in
`CT0_to_C4_ids.txt`, and no spawn file in the entire reference tree mentions it.
A Chronicle 4 player could not kill one either. The local state therefore
reproduces C4 exactly, and the two authored targets 403 and 508 are all there
ever was to hunt. The certification test checks this against the pinned spawn
tree itself when it is available rather than taking the claim on trust, and the
quest's other mechanics - the 4%/50% single-roll drop, Nathan's fifteen-to-
twenty-four silk extraction per spinnerette, Mion's twenty adena a silk with two
thousand more from ten, the prerequisite ring and the quit path - were already
faithful and are now certified end to end.

No coordinate was invented for either quest.

## Q385 and Q634: the Seven Signs blocker was over-broad too

Both were blocked as `PARTY_SEVEN_SIGNS_INTEGRATION`. The pinned C4 handlers
contain **no Seven Signs condition of any kind** — no seal, no side, no
participation check, no catacomb admission. Reading them settles what they
actually are:

* **Q385 Yoke of the Past.** Every Gatekeeper Ziggurat outside a catacomb or
  necropolis offers the same standing errand from level 20. Forty-one catacomb
  dwellers each drop a Scroll of Ancient Magic at their own authored chance
  (7% to 91%, written out of a million in the reference), and the gatekeeper
  exchanges every scroll for a Blank Scroll, one for one. Repeatable, no cap.
* **Q634 In Search of Fragments of the Dimension.** Every Dimension Keeper
  offers the same errand from level 20. The same forty-one targets drop a
  Fragment of Dimension on 8% of kills, `floor(level * 0.15 + 2.6)` at a time.
  The fragments are ordinary goods, so ending the errand leaves them in the pack.

**Party credit.** The only party-shaped thing in either handler is
`getRandomPartyMemberState(player, -1, 3, npc)`, which picks a random eligible
party member to credit. This server already has an explicit, documented policy
for that, stated in `NpcDied.js`: "C4's ordinary quest callback is attributed to
the actual killer, not to every party member that receives shared EXP." Both
quests are implemented on that existing attribution. Changing it would alter
every quest in the catalogue, and neither of these two needs it.

**One reusable primitive was added**, and only because three confirmed quests
require it: `QuestService.onEvent` now accepts an array from `eventNpc`, so a
quest whose errand is offered by many interchangeable NPCs can name the whole
set instead of a single id. Q385 has twenty-nine gatekeepers, Q634 fourteen
keepers and Q635 twenty rift NPCs; a single-id contract cannot express any of
them. Existing single-id quests are unaffected.

**Restored content.** Items 5902 Scroll of Ancient Magic, 5965 Blank Scroll and
7079 Fragment of Dimension were absent. So were all twenty rift NPCs — the six
Rift Post ranks 8488-8493 and the fourteen Dimension Keepers 8494-8507 — which
are now authored from the reference's own stats and spawned at its own
coordinates. The twenty-nine Gatekeepers Ziggurat already existed and were
already spawned; the test asserts that rather than assuming it.

**Seven ids are deliberately not targets.** The reference registers the whole
21208-21255 range for Q634 with a bare loop, but 21212, 21216, 21220 and
21232-21235 are unspawned content in C4: they have reference templates and no
spawn anywhere in the pinned datapack, and no local template at all. Q385's own
chance table omits exactly the same seven. Both quests therefore hunt the same
forty-one targets a player can actually meet.

## Q422: the Sin Eater was already here

`SIN_EATER_PROGRESSION` turned out to name work that was already done. The
server's pet runtime already knows this pet completely: `PetRules.TYPES` maps the
Penitent's Manacles (4425) to summon 12564 and names it "Sin Eater",
`C4ItemSkills` gives the collar its non-consuming summon skill, `c4-stats.json`
carries eighty levels of Sin Eater stat rows, `Backpack.petNpcFallback` supplies
its display template, and `PetRules.normalize` gives a freshly issued Sin Eater
the owner's own level. No pet code was written for this quest.

What the quest owns is the errand and the reckoning:

* The Black Judge sentences by level band — the reference's bands overlap at 20,
  30 and 40 and the first match wins, so they really are ≤20, 21-30, 31-40 and
  above — sending the character to Katari, Piotur, Casian or Joan for ten ratman
  skulls, ten war hound tails, one kingpin heart or three venom sacs.
* Pushkin forges the manacles from the Manual plus ten silver nuggets, two
  adamantite nuggets, ten cokes, five steel and one blacksmith's frame.
* The Black Judge exchanges the forged pair for the collar and **records the
  owner's level in the same commit**.
* The reckoning requires that the Sin Eater's level has passed that recorded
  level, and that it is not currently summoned. It then spends the collar, issues
  the spent pair (4426) and strikes off `getRandom(10) + 1` sins. If that clears
  the record the sentence is discharged; otherwise a new level is recorded and
  the reckoning can be earned again. The spent pair buys a fresh collar.

Where the reference reads the Sin Eater's level off the collar's *enchant level*,
this server keeps a pet's saved state on its collar, so the level is read from
`fetchPetData().level`. That is the same fact in this server's own storage.

**This is the only authoritative way a PK count falls**, so every guard is
asserted: no reckoning without a grown Sin Eater, none while it is summoned, none
twice from one collar, none for a character with a clean record, and the PK write
commits with the item transaction rather than beside it.

Native 7981 Black Judge was absent and is restored from the reference's own stats
and all three of its authored positions. Items 4326-4331 were authored
non-stackable while the pinned source makes them stackable; they are corrected,
following the same rule as elsewhere in this task — correct exactly the quest
items this catalogue's quests hand out or collect.

## Q635: the Dimension Rift quest is a passage, not an instance

`DIMENSION_RIFT_INSTANCE_LIFECYCLE` was the most over-broad blocker of them all.
The pinned C4 handler has **no rooms, no timers, no party admission, no encounter
spawning, no early exit and no cleanup**. It is a two-way passage:

* A Dimension Keeper outside a catacomb checks level 20, a Fragment of Dimension
  in the pack (required, never consumed) and no more than twenty-three other
  active quests, then remembers which keeper you used and teleports you to the
  rift outpost at (−114790, −180576, −6781).
* Any of the six Rift Post ranks at the outpost sends you back to that same
  keeper's catacomb and closes the passage behind you.

That is the whole quest. It is implemented on the server's own
`Generics/TeleportTo` and ordinary durable quest state; no instance runtime was
built, and none is needed.

**One reference bug is corrected.** The handler computes `id = npcId - 31493`
and then returns the player to `COORD[id]`, which is off by one: the first
keeper would send you to the *second* catacomb, and the last two ids would index
past the end of a fourteen-entry table. The keeper spawns settle it — 31494
stands at the Necropolis of Sacrifice, which is `COORD[0]`, 31495 at the Catacomb
of the Heretic, which is `COORD[1]`, and so on — so the destination is indexed
from the keeper's own position in the list. All fourteen round trips are
certified.

The reference's fifteenth start id, 31508, is not spawned anywhere in the pinned
datapack and has no destination in the table; it is not a keeper here either.
