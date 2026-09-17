# Reviewed runtime resolutions

The source package is unchanged. Implementations use independently authored
definitions and the existing QuestService/Bridge. No external server code is
included. Technical reference: [Mobius C4 at 6674a607](https://github.com/tichopad/L2J_Mobius/tree/6674a607727e342d42bb7ce3bf81fe7513067611/L2J_Mobius_C4_ScionsOfDestiny/dist/game/data/scripts/quests).
Each Q00NNN directory's Java handler was read for factual mechanics.

| Quest | Resolution of missing or incomplete inventory facts |
|---|---|
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

Profession completion uses the inventory's 3200 EXP and per-quest SP values.
Proof and quest completion are atomic; transfer at level 20 consumes the proof
and writes a durable consumed marker. Profession quests remain one-time in the
current runtime, unlike the inventory's REPEATABLE classification. No migration
silently grants proof to historically promoted characters.

Q038/Q039 remain disabled: missing templates 1100/1101 and 925 respectively.
Their old handlers also lack atomic hand-ins and completed-state restart guards;
simply registering them would not certify playable content.
