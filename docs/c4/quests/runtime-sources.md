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
