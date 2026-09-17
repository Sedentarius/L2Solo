# C4 quest integration experiment

The five C4_QUEST_* files are the unchanged supplied evidence package. JSONL is
the specification; it is never loaded by the runtime. Historical runtime and
bridge claims refer to an older snapshot and are not certification.

Run `node scripts/check-c4-quests.js --json` for current coverage, registry,
test references, quarantines and drift. `--strict-drift` fails on historical
differences; ordinary validation fails on structural errors. Test references
alone never certify a quest. Reviewed certification and blockers live in
runtime-evidence.json separately from historical/source fields.

Baseline: aed7d6bf. P0-B already provides generic quest goals, talk/travel,
kill/collect, delivery/completion, cold execution and hot/cold handoff.
Availability of a primitive does not imply an adapter exists for every quest.
Q255/Q999 remain excluded. Runtime NPC IDs use the existing datapack mapping,
not client journal IDs verbatim.
