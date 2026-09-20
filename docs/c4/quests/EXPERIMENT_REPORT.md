# C4 level 1–20 integration experiment

Baseline inspected: prewipe-c4-p0-b at aed7d6bf. The five supplied files remain byte-for-byte unchanged. This is a tested implementation milestone, not completion of every acceptance criterion.

| Repository-derived measure | Result |
|---|---:|
| Confirmed quests, minimum level 1–20 | 107 |
| VERIFIED | 34 |
| IMPLEMENTED, full certification pending | 50 |
| PARTIAL/BLOCKED | 14 |
| MISSING | 9 |
| Active quests in scope | 86 |
| Newly registered active quests | 27 |
| New per-quest script classes | 0 |
| Existing script implementations replaced by reviewed definitions | 7 |
| Active declarative definitions | 34 |
| Disabled declarative definitions | 1 (Q379) |
| New focused test files | 3 |
| New Quest Bridge primitives | 0 |
| Shared profession proof contracts passing | 18 / 18 |
| Entire first-profession quest and transfer passing end-to-end | 1 / 18 (Q401) |

The seven recovered modules are Q151, Q153, Q155, Q156, Q160, Q161 and Q168. Their old paths remain as compatibility entry points. Six shared runtime modules were added: FirstProfessionProof, QuestStep, DeclarativeQuest, LowLevelDefinitions, RecoveredLowLevelDefinitions and ReviewedQuestRoutes. New commands are check-c4-quests and certify-c4-quests. Twenty-seven ordinary quests were added without twenty-seven bespoke classes:

Q258, Q259, Q261, Q262, Q263, Q264, Q271, Q272, Q274, Q277, Q291, Q292, Q294, Q295, Q296, Q297, Q303, Q306, Q313, Q316, Q317, Q319, Q320, Q324, Q325, Q341, Q347.

## What now works

Q401 completes at level 19 and awards medallion 1145 plus EXP/SP. It never changes class directly. ClassTransfer checks persisted parent class, level 20, completed Q401 proof receipt and the physical medallion; consumption, class mutation and spent-proof receipt commit together. No proof, a wrong proof, wrong parent, underlevel transfer and reused proof are denied. The ordinary Gatekeeper entry point and bot promotion use that authority. Existing already-promoted characters are not silently reset or granted invented quest history.

All eighteen profession scripts use the same final proof contract and exact inventory class mappings. The SQLite matrix executes each actual final hand-in, then transfer and retry. Q401 additionally covers the complete start-to-finish trial, trial weapon requirement, restart, concurrent transfer and hot/cold kill progress. Its autonomous route travels to real NPC/spawn locations, equips the trial weapon through Backpack, earns proof and calls ClassTransfer. The database retains the bot's chosen first-profession branch.

Declarative quests implement existing QuestService handlers. State, item consumption, item rewards and EXP/SP use the shared database transaction and stale-state comparison. Tests exercise NPC/level/race/item requirements, ordered deliveries, collection caps, variable drops, exact rewards, unique-ring alternatives, continuous cash-outs, barter, prerequisite necklaces, side drops, capped boss trophies, branch order, player-selected rewards, restart and duplicate delivery. Q313 covers cold → hot → cold collection/completion. Definitions never load the inventory at runtime.

## What remains incomplete

The other seventeen profession routes are not full end-to-end certifications. Their intermediate script transactions, encounter behavior and autonomous schedules still need work. Hot/cold proof rules are shared; fully autonomous hot execution of every retail route is not claimed.

50 active quests are implemented but not fully certified. Each has a machine-readable certificationBlocker, including older multi-write hand-ins and missing lifecycle coverage. Importing a module is not treated as verification. Q038/Q039 remain disabled because their required mob templates are missing; enabling their old handlers would not create playable certified quests.

Blocked/partial IDs: Q38, Q39, Q266, Q267, Q296, Q306, Q362, Q363, Q364, Q379, Q385, Q422, Q634, Q635.

Missing implementation IDs: Q257, Q260, Q265, Q273, Q275, Q276, Q293, Q340, Q378.

The remaining ordinary gaps include shared once-per-character beginner-shot eligibility/receipts and their shared reward contract. Exceptional gaps include encounter ownership across hot/cold handoff, party/Seven Signs integration, Sin Eater progression and Dimension Rift instance lifecycle. Music NPC templates and Q379's item templates are absent; Murika/Bremec IDs have unresolved mappings. These are explicitly recorded instead of approximated. Q255/Q999 remain quarantined outside the 107-quest denominator.

The reference persists beginner eligibility when a character is created (first character on its account, or an explicit server override). L2Solo has no equivalent historical eligibility flag. Current level or possession of beginner ammunition cannot safely reconstruct it. A future migration must distinguish historical uncertainty from eligibility for newly created characters; the five associated quests are not silently stripped of this reward.

## Inventory drift and Bridge reconciliation

The audit detects inventory duplicates, script/registry orphans, missing test paths, class/proof mismatches and stale certification hashes. It currently reports 296 inventory rows with differences, 107 within scope. These counts include historical status terminology and old capability claims; they do not mean 296 broken implementations.

P0-B's generic goal/resolver, travel, talk, kill/collect, delivery and completion already exist. Hot scripted spawning also exists. Cold encounter lifecycle and party quest credit are not certified by that presence. Q272 and Q316 use ordinary authored mobs/spawns; neither demonstrates a need for a new boss primitive. Q266's asserted DEFEND requirement is not substantiated by the reviewed collection handler.

Historical reward omissions and drop-chance resolutions are listed in runtime-sources.md. Profession scripts remain one-time while the inventory says REPEATABLE. These differences remain visible; source fields were not edited to satisfy tests.

## Reproducible validation

Run node scripts/check-c4-quests.js for current drift and structural checks. Run node scripts/certify-c4-quests.js to rerun the seventeen focused files and regenerate evidence/report. Certification records source/test/data hashes and actual zero exit codes, and becomes stale when those inputs change. It does not certify the entire catalogue or the whole regression suite.

Machine-readable milestone totals and per-quest remaining reasons are in experiment-summary.json. Detailed script/registration/test reconciliation is in runtime-report.json; source resolutions are in runtime-sources.md. The registry comparison against aed7d6bf establishes the 59 → 86 active-quest change directly.

The last complete regression, on the Q325 implementation snapshot (07412719), executed 509 files: 508 passed. The remaining companion-pathfinding test hit PATH_BUDGET on the Giran route and subsequently timed out because its workers were not released after the assertion. Test cleanup now releases workers in finally; an isolated rerun reports the same route assertion immediately. Its assertion and production pathfinding budget remain unchanged. The later Q153/Q160/Q168 recovery is covered by a fresh focused certification, not claimed as a second 509-file pass. check-syntax.js passes for 1453 JavaScript files. Details and exit codes are recorded in regression-summary.json.

## Scaling conclusion

This supports scaling the same reviewed-definition architecture: 27 newly playable quests plus seven recovered quests use shared transactions and existing QuestService/Bridge, with no new Bridge primitive. It covers more than simple collection: variable rewards, ongoing bounty payments, barter and explicit choices also fit. It does not support blindly executing the inventory or claiming that all remaining catalogue mechanics fit this pattern. Datapack completeness, ambiguous evidence, account-wide reward flags, scripted encounters and party/instance systems remain separate engineering work. Nine missing implementations and seventeen uncertified profession routes are concrete remaining scope, not hidden behind the VERIFIED count.

## Completion: the catalogue is finished

The sections above are the original experiment's record at baseline `aed7d6bf`
and are left as written. This section records the end state.

All 107 confirmed Chronicle 4 quests with a minimum level of 1–20 are now
VERIFIED, with no IMPLEMENTED, PARTIAL/BLOCKED or MISSING remainder, and
`check-c4-quests` reports `errors: []`. The eighteen first-profession proof
contracts still pass.

| Repository-derived measure | Experiment | Now |
|---|---:|---:|
| Confirmed quests, minimum level 1–20 | 107 | 107 |
| VERIFIED | 34 | 107 |
| IMPLEMENTED, full certification pending | 50 | 0 |
| PARTIAL/BLOCKED | 14 | 0 |
| MISSING | 9 | 0 |
| Shared profession proof contracts passing | 18 / 18 | 18 / 18 |

### Every blocker, and what it turned out to be

Four of the six blocker codes named subsystems that the pinned C4 sources do not
actually contain. Reading them, rather than building to their names, is what
finished the catalogue.

* `ENCOUNTER_HANDOFF_UNCERTIFIED` (Q340, and earlier Q275/Q276) — the handlers
  use a plain transient `addSpawn`. Q340's chest is `spawnQuestNpc` with
  `despawnDelay: 30000`. No encounter subsystem was needed.
* `PARTY_SEVEN_SIGNS_INTEGRATION` (Q385, Q634) — neither handler contains a
  Seven Signs condition of any kind. The only party-shaped call is
  `getRandomPartyMemberState`, and this server already has a stated attribution
  policy for quest kill callbacks.
* `SIN_EATER_PROGRESSION` (Q422) — the Sin Eater was already wired into the pet
  runtime. The quest needed its errand and its PK reckoning, not pet code.
* `DIMENSION_RIFT_INSTANCE_LIFECYCLE` (Q635) — the handler is a two-way
  teleport with no rooms, timers, party admission or cleanup.
* `MISSING_NPC_TEMPLATES` / `MISSING_ITEM_TEMPLATES` (Q38, Q39, Q362–Q364,
  Q379) — genuine datapack gaps, filled from the reference's own stats, spawn
  coordinates and drop tables.
* `NPC_ID_MAPPING_UNRESOLVED` (Q266, Q267) — settled by evidence. The reference
  ships `stats/npcs/CT0_to_C4_ids.txt`, which states the mapping outright.
* `OPTIONAL_KILL_TARGET(S)_UNSPAWNED` (Q296, Q306) — Q306's four variants were a
  real gap and are now spawned; Q296's third target is unspawned in Chronicle 4
  itself, so the local state was already faithful.

### Two source defects were corrected, and both are recorded

Q340's relic roll strands nine players in ten at condition 3, and Q635's return
teleport is indexed one place past the catacomb the player came from. Both
corrections are minimal, keep the authored rates and destinations, and are
written up in `runtime-sources.md` as implementation choices rather than source
facts.

### What was added

Thirty-one NPC templates, thirty-four spawn entries covering a hundred and
forty-two authored points, three full drop and spoil tables, and twenty-one
items — all taken from the pinned reference. Seven existing quest items had
their stackability corrected to match the source, and one spawn position was
corrected. No coordinate was invented anywhere in this work.

One reusable runtime primitive was added, because three confirmed quests require
it: `QuestService.onEvent` now accepts an array from `eventNpc`, so an errand
offered by many interchangeable NPCs can name the whole set. No database
migration or schema change was needed.
