L2Solo clan party invitation fix

Extract into the project root, preserving src/ and tests/ paths.
Restart the server after replacing the file.

Changes:
- Cold clan membership comes from ClanService's current member roster.
- Same-clan invitations take priority over relationship refusal checks.
- Personal relationship history remains unchanged.
- Existing fixed-service, party-capacity and lifecycle safeguards remain in place.

Validation:
node tests/test_clan_invite_priority.js
96 cold-state cases passed with mocked dependencies; the original source fails the stale-membership case.
JavaScript syntax checks passed for every changed file.
Existing availability and relationship tests were updated for the new policy, but could not be run end-to-end from the partial source archive.

Live verification:
Invite a cold clan member while dead, shopping, traveling, or running a store.
Confirm party membership and subsequent companion behavior in the running server.

Update 2:
- Forced near-player activation checks deterministic nearby positions before random placement.
- Summoned bots do not use the ambient 450-unit player exclusion radius.
- Collision, floor, line-of-sight and geodata validation remain required.
- Failed remote invitations log bot name, activation reason, activity and clanmate status.
- Includes the previous clan membership and invitation-priority fix.

Additional validation:
node tests/test_summoned_activation_placement.js
The narrow-room scenario fails with the original placement code and passes with the fix.
Blocked geometry, missing geodata, wrong floors, disconnected positions and fixed stores remain rejected.
These tests use mocked geometry; the specific live ArlenClover failure requires the server log to confirm.
If it still fails, send the BotParty remote activation failed log line and any preceding BotPopulation activation failure.
