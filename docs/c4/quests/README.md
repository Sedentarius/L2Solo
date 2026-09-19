# C4 quest integration experiment

The five C4_QUEST_* files are the unchanged supplied evidence package. JSONL is
the specification; it is never loaded by the runtime. Historical runtime and
bridge claims refer to an older snapshot and are not certification.

Run `node scripts/check-c4-quests.js --json` for current coverage, registry,
test references, quarantines and drift. `--strict-drift` fails on historical
differences; ordinary validation fails on structural errors. Test references
alone never certify a quest. Reviewed certification and blockers live in
runtime-evidence.json separately from historical/source fields.

Run `node scripts/certify-c4-quests.js` to execute the focused test matrix and
refresh `runtime-evidence.json` and `runtime-report.json`. The authored scope
of each certification is in `runtime-review.json`. Certification records test
exit codes and normalized source hashes; changing a recorded runtime, test,
data or review file invalidates it. This is a local reproducible test receipt,
not a cryptographic attestation or a claim of full retail fidelity.

VERIFIED means the named lifecycle tests passed for the current receipt.
IMPLEMENTED means registered but not fully certified. PARTIAL/BLOCKED means a
disabled definition/script or a reviewed subsystem/datapack dependency.
MISSING means no active implementation; a review may still describe the work
needed. `certificationBlocker` never hides an otherwise active implementation.
The eighteen passing profession proof contracts are counted separately from
full start-to-finish profession routes. Do not equate those counts.

Baseline: aed7d6bf. P0-B already provides generic quest goals, talk/travel,
kill/collect, delivery/completion, cold execution and hot/cold handoff.
Availability of a primitive does not imply an adapter exists for every quest.
Q255/Q999 remain excluded. Runtime NPC IDs use the existing datapack mapping,
not client journal IDs verbatim.
