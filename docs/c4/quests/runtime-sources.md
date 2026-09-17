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
