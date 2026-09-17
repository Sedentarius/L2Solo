# C4 level 1–20 integration experiment

Baseline inspected: prewipe-c4-p0-b at aed7d6bf. The five supplied files remain byte-for-byte unchanged. This is a tested implementation milestone, not completion of every acceptance criterion.

| Repository-derived measure | Result |
|---|---:|
| Confirmed quests, minimum level 1–20 | 107 |
| VERIFIED | 29 |
| IMPLEMENTED, full certification pending | 53 |
| PARTIAL/BLOCKED | 14 |
| MISSING | 11 |
| Active quests in scope | 84 |
| Newly registered active quests | 25 |
| New per-quest script classes | 0 |
| Existing script implementations replaced by reviewed definitions | 4 |
| Active declarative definitions | 29 |
| Disabled declarative definitions | 1 (Q379) |
| New focused test files | 3 |
| New Quest Bridge primitives | 0 |
| Shared profession proof contracts passing | 18 / 18 |
| Entire first-profession quest and transfer passing end-to-end | 1 / 18 (Q401) |

The four recovered modules are Q151, Q155, Q156 and Q161. Their old paths remain as compatibility entry points. Six shared runtime modules were added: FirstProfessionProof, QuestStep, DeclarativeQuest, LowLevelDefinitions, RecoveredLowLevelDefinitions and ReviewedQuestRoutes. New commands are check-c4-quests and certify-c4-quests. Twenty-five ordinary quests were added without twenty-five bespoke classes:

Q258, Q259, Q261, Q262, Q263, Q264, Q271, Q272, Q274, Q277, Q291, Q294, Q295, Q296, Q297, Q303, Q306, Q313, Q316, Q317, Q319, Q320, Q324, Q341, Q347.

## What now works

Q401 completes at level 19 and awards medallion 1145 plus EXP/SP. It never changes class directly. ClassTransfer checks persisted parent class, level 20, completed Q401 proof receipt and the physical medallion; consumption, class mutation and spent-proof receipt commit together. No proof, a wrong proof, wrong parent, underlevel transfer and reused proof are denied. The ordinary Gatekeeper entry point and bot promotion use that authority. Existing already-promoted characters are not silently reset or granted invented quest history.

All eighteen profession scripts use the same final proof contract and exact inventory class mappings. The SQLite matrix executes each actual final hand-in, then transfer and retry. Q401 additionally covers the complete start-to-finish trial, trial weapon requirement, restart, concurrent transfer and hot/cold kill progress. Its autonomous route travels to real NPC/spawn locations, equips the trial weapon through Backpack, earns proof and calls ClassTransfer. The database retains the bot's chosen first-profession branch.

Declarative quests implement existing QuestService handlers. State, item consumption, item rewards and EXP/SP use the shared database transaction and stale-state comparison. Tests exercise NPC/level/race/item requirements, ordered deliveries, collection caps, variable drops, exact rewards, unique-ring alternatives, continuous cash-outs, barter, prerequisite necklaces, side drops, capped boss trophies, branch order, player-selected rewards, restart and duplicate delivery. Q313 covers cold → hot → cold collection/completion. Definitions never load the inventory at runtime.

## What remains incomplete

The other seventeen profession routes are not full end-to-end certifications. Their intermediate script transactions, encounter behavior and autonomous schedules still need work. Hot/cold proof rules are shared; fully autonomous hot execution of every retail route is not claimed.

53 active quests are implemented but not fully certified. Each has a machine-readable certificationBlocker, including older multi-write hand-ins and missing lifecycle coverage. Importing a module is not treated as verification. Q038/Q039 remain disabled because their required mob templates are missing; enabling their old handlers would not create playable certified quests.

Blocked/partial IDs: Q38, Q39, Q266, Q267, Q296, Q306, Q362, Q363, Q364, Q379, Q385, Q422, Q634, Q635.

Missing implementation IDs: Q257, Q260, Q265, Q273, Q275, Q276, Q292, Q293, Q325, Q340, Q378.

The remaining ordinary gaps include shared once-per-character beginner-shot eligibility/receipts and several exchange/branch definitions. Exceptional gaps include encounter ownership across hot/cold handoff, party/Seven Signs integration, Sin Eater progression and Dimension Rift instance lifecycle. Music NPC templates and Q379's item templates are absent; Murika/Bremec IDs have unresolved mappings. These are explicitly recorded instead of approximated. Q255/Q999 remain quarantined outside the 107-quest denominator.

## Inventory drift and Bridge reconciliation

The audit detects inventory duplicates, script/registry orphans, missing test paths, class/proof mismatches and stale certification hashes. It currently reports 296 inventory rows with differences, 107 within scope. These counts include historical status terminology and old capability claims; they do not mean 296 broken implementations.

P0-B's generic goal/resolver, travel, talk, kill/collect, delivery and completion already exist. Hot scripted spawning also exists. Cold encounter lifecycle and party quest credit are not certified by that presence. Q272 and Q316 use ordinary authored mobs/spawns; neither demonstrates a need for a new boss primitive. Q266's asserted DEFEND requirement is not substantiated by the reviewed collection handler.

Historical reward omissions and drop-chance resolutions are listed in runtime-sources.md. Profession scripts remain one-time while the inventory says REPEATABLE. These differences remain visible; source fields were not edited to satisfy tests.

## Reproducible validation

Run node scripts/check-c4-quests.js for current drift and structural checks. Run node scripts/certify-c4-quests.js to rerun the seventeen focused files and regenerate evidence/report. Certification records source/test/data hashes and actual zero exit codes, and becomes stale when those inputs change. It does not certify the entire catalogue or the whole regression suite.

The integration regression executed 509 files: 508 passed, with one availability failure exposing absent alternative kill-target spawns in Q296/Q306. The correction limits active targets to existing authored spawns, leaves both quests explicitly partial, and adds availability to focused certification. The corrected availability test passes. Final validation is recorded in regression-summary.json.

## Scaling conclusion

This supports scaling the same reviewed-definition architecture: 25 newly playable quests plus four recovered quests use shared transactions and existing QuestService/Bridge, with no new Bridge primitive. It covers more than simple collection: variable rewards, ongoing bounty payments, barter and explicit choices also fit. It does not support blindly executing the inventory or claiming that all remaining catalogue mechanics fit this pattern. Datapack completeness, ambiguous evidence, account-wide reward flags, scripted encounters and party/instance systems remain separate engineering work. Eleven missing implementations and seventeen uncertified profession routes are concrete remaining scope, not hidden behind the VERIFIED count.
