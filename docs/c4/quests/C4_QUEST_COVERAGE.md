# Chronicle 4 Quest Inventory Coverage

Generated from the machine-readable inventory on 2026-09-16. Counts are computed from the JSONL records, not manually estimated.

## Universe and Chronicle membership

- Total union candidates: **296**.
- L2Hub and client-journal catalogues: **294** each; their QuestID sets agree.
- Technical-only retained candidates: **2** (Q255 and Q999), both explicitly uncertain.
- Q504 and Q505 are confirmed by the client, L2Hub, and Mobius; they are absent only from the L2JLisvus snapshot.
- Client journal rows parsed: **1816** from protocol 413 data.

| Chronicle status | Count |
|---|---:|
| CONFIRMED_C4 | 294 |
| UNCERTAIN_C4 | 2 |

## Current L2Solo coverage

- Quest-ID scripts found: **86**.
- Quest scripts registered by QuestService: **70**.
- Quest scripts present but unregistered: **16**.
- Inventory quests without an L2Solo script: **210**.
- Three non-ID helper scripts are explicitly mapped outside the quest count: FormalWear.js (Q033-Q037), PetTicketQuest.js (Q042-Q044), and TravelerRoute.js (Q046-Q049).

| Runtime status | Count |
|---|---:|
| IMPLEMENTED | 30 |
| MISSING | 210 |
| PARTIAL | 18 |
| REGISTERED_UNTESTED | 18 |
| SCRIPT_EXISTS_UNREGISTERED | 16 |
| VERIFIED | 4 |

## Coverage by level band

| Minimum-level band | Count |
|---|---:|
| 1-20 | 109 |
| 21-40 | 64 |
| 41-60 | 37 |
| 61-70 | 20 |
| 71-78 | 47 |
| UNKNOWN | 19 |

## Coverage by race

Race counts are multi-label; unrestricted and unavailable restrictions are grouped together.

| Race requirement | Count |
|---|---:|
| Dark Elf | 14 |
| Dwarf | 10 |
| Elf | 16 |
| Human | 10 |
| Orc | 14 |
| UNRESTRICTED_OR_UNKNOWN | 243 |

## Coverage by major category

| Category | Count |
|---|---:|
| ENDGAME | 13 |
| FISHING | 9 |
| NORMAL | 184 |
| PET | 5 |
| PROFESSION | 72 |
| SYSTEM | 11 |
| TUTORIAL | 2 |

## Profession coverage

| Profession set | Inventory records | Registered in L2Solo | Missing scripts |
|---|---:|---:|---:|
| First profession (Q401-Q418) | 18 | 18 | 0 |
| Second profession (Q211-Q233) | 23 | 0 | 23 |
| Third profession (Q070-Q100) | 31 | 0 | 31 |

All first-, second-, and third-profession records include normalized from-class, to-class, and proof mappings. First-profession quests are marked PARTIAL because L2Solo still permits direct Gatekeeper transfer, so quest proof is not authoritative system-wide.

## Quest Bridge assessment

| Compatibility | Count |
|---|---:|
| COMPATIBLE | 1 |
| PARTIAL | 127 |
| REQUIRES_EXTENSION | 168 |

Only Q501 has an existing bespoke hot/cold clan-alliance resolver. Other quests are conservatively PARTIAL, REQUIRES_EXTENSION, or UNKNOWN because no generic Quest Bridge goal/resolver was found.

## Conflicts

Meaningful unresolved field conflicts: **6**. They cover Q255/Q999 tutorial membership or naming and three later-chronicle Kamael metadata contaminations; routine title punctuation differences are not treated as conflicts.

## Implementation cohorts

| Cohort | Count |
|---|---:|
| A | 92 |
| B | 18 |
| C | 42 |
| D | 23 |
| E | 47 |
| F | 19 |
| G | 13 |
| H | 42 |

Recommended sequence: **A -> B -> C -> D -> E -> F -> G -> H**, with profession-proof infrastructure addressed before completing B/D/H and Quest Bridge extensions scheduled alongside the first quest that needs each exceptional primitive.

- **A** — Level 1-20 normal/starter quests
- **B** — First profession quests
- **C** — Level 20-40 normal/economic quests
- **D** — Second profession quests
- **E** — Level 40-60
- **F** — Level 60-70
- **G** — Level 70-78/endgame
- **H** — Third profession/subclass/Noblesse/system quests

## Quality checks

- PASS: mobius candidate count 296
- PASS: l2jlisvus numeric candidate count 294
- PASS: l2hub candidate count 294
- PASS: unique quest ids
- PASS: total union 296
- PASS: l2solo quest scripts 86
- PASS: l2solo registered 70
- PASS: all l2solo scripts mapped
- PASS: all registered quests mapped
- PASS: first profession 401 to 418 complete
- PASS: second profession 211 to 233 complete
- PASS: third profession 70 to 100 complete
- PASS: required fields present
- PASS: client rows 1816
- PASS: JSONL reparsed after writing.
- PASS: CSV data-row count matches the JSONL quest count.
- PASS: every required field is present; unavailable evidence is represented by null, empty arrays, or explicit UNKNOWN values.
