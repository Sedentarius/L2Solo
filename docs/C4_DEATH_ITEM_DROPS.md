# Chronicle 4 death item and equipment drops

This note records the evidence and decisions behind L2Solo's authoritative death-drop rule. It is intentionally separate from the runtime constants so disputed history remains auditable without putting source URLs into gameplay code.

## Sources

Evidence was evaluated in the ticket's required order:

1. The archived official [Lineage II PvP guide](https://legacy-lineage2.com/Knowledge/cp.html) says chaotic characters have a high chance of dropping items and explicitly protects chaotic characters with five or fewer PKs.
2. The archived official [Chronicle 2 update notes](https://legacy-lineage2.com/news/chronicle2_05.html) describe reducing item-drop probability at relatively low karma. This confirms that current karma, rather than historical PK count alone, changes the probability model inherited by C4.
3. The contemporary 2006 [Game Play Tips](https://forum.lineage2world.com/viewtopic.php?t=47310) state that a death can drop up to five items, including the equipped weapon, regardless of karma, with increased risk for chaotic characters. This is lower-confidence than the archived official pages but resolves their omissions.
4. [L2JLisvus C4](https://github.com/L2jLisvus/L2JLisvus), `L2PcInstance#onDieDropItem` and its C4 configuration, supplies the executable probability/category model and protected-item lists.
5. [L2J Mobius C4](https://git.grachevko.ru/lineage2/l2j_mobius/src/commit/9168f1ea57f87107c8743ddc218f27eff1b72724/L2J_Mobius_C4) is an independent codebase presentation of the same C4 behavior (its readme says it began from Lisvus revision 591), so it corroborates implementation details but is not fully independent historical evidence.

No proprietary or leaked L2OFF material was used, and no GPL source was copied.

## Final rules

| Question | L2Solo C4 rule | Confidence and disagreement |
| --- | --- | --- |
| Normal/white PvE death | A level 5+ character killed by an NPC/monster has a 5% overall chance to enter item selection. | High for the existence of ordinary PvE loss; high for the reference-server rate. |
| Normal/white player death | No item loss in ordinary world PvP. PvP-zone player deaths are also protected. | High from both C4 reference implementations. |
| Current karma | A currently chaotic character uses the chaotic model only while karma is positive. Cleared karma returns to the normal model even with old PKs. | High. The official adjacent-chronicle note and both implementations agree that current karma drives the increased risk. |
| PK count | A chaotic character with 0-5 PKs is protected. Chaotic risk begins at 6 PKs. PK count alone does not create chaotic risk after karma is cleared. | High for the 5/6 threshold from the official archived PvP guide. Lisvus can fall through to ordinary NPC-loss logic at low PK count; L2Solo follows the higher-priority official protection instead of that apparent implementation inconsistency. |
| Overall probability | Normal PvE: 5%. Chaotic with 6+ PKs: 70%, regardless of NPC/player killer outside protected contexts. | High for the configured C4 reference values. |
| Per-object probability | After the overall roll succeeds, each eligible object is tested in stable inventory-object order. Normal: inventory 70%, equipped armor/jewelry 25%, equipped weapon 5%. Chaotic: inventory 50%, equipped armor/jewelry 40%, equipped weapon 10%. | High; Lisvus and Mobius agree. The category rolls are independent until the cap is reached. |
| Weapon protection | The equipped weapon is not absolutely protected. It uses the lower weapon probability in both normal PvE and eligible chaotic deaths. | Medium-high. The reference implementations and contemporary tip agree; the archived official pages do not spell out the category. |
| Drop count | Zero to five world objects. One overall gate is followed by independent per-object rolls, stopping after five successes. | Medium. The contemporary tip says five; C4 reference defaults expose `PlayerDropLimit=3` and `KarmaDropLimit=10`. Because those are server configuration defaults that conflict with the higher-level contemporary authored rule, L2Solo selects the documented global maximum of five rather than inventing a compromise. |
| Equipment and inventory | Equipped armor, jewelry, weapons, unequipped equipment, ordinary consumables, shots, and materials are candidates. | High from reference behavior. |
| Stackables | A successful stackable candidate transfers the whole stack as one world object. | High from reference behavior. |
| Adena and protected items | Adena, quest items, the C4 protected control/currency-like IDs, active/dead pet control items, and explicitly non-droppable items are excluded. | High for Adena/quest/protected IDs and pet control items from both references. |
| Exempt contexts | Arena, duel, event, festival, Olympiad, Lucky protection, protected PvP-zone deaths, and qualifying siege-participant deaths do not drop. A non-chaotic mutual clan-war death does not drop. These reuse the P0-A death-context vocabulary. | High for arena/event/PvP-zone/festival/reference exclusions; medium for mapping the existing generalized duel/Olympiad/siege flags because the current runtime represents them more broadly than the old reference server. |
| Ground ownership | Death-dropped items are immediately free-for-all. There is no killer, party, clan, or victim protection window. | Medium-high. Lisvus calls the ordinary drop path with protection disabled; no stronger C4 evidence for a protection window was found. |

## Runtime and persistence contract

`DeathItemDrop` is the sibling authority to `DeathExperience`. It calculates eligibility and a deterministic plan for players and bots from the same constants. Hot deaths commit the item-instance transfer before mutating the live backpack or spawning the normal ground object. Cold deaths remove the same selected instances from the inventory summary and carry the same plan through the existing fenced cold transaction. The legacy cold write path persists that plan in `bot_life_state`; startup recovery completes any plan whose state marker committed before its ownership transition.

`character_death_item_drop` assigns a per-character death sequence and makes `(characterId, deathKey)` unique. `death_world_items` owns the exact source object ID, amount, enchant, slot, pet metadata, location, and claim state after the inventory row is deleted. A partial unique index permits only one active ground owner for a source object while still allowing that same object to be picked up and dropped again on a later death. Thus the database transaction has one owner before and after transfer; there is no inventory-plus-ground clone window.

Pending rows are rehydrated into the ordinary world item collection on startup. Pickup atomically changes a pending row to claimed and recreates the same non-stackable object ID in the recipient inventory (ordinary stack merging retains normal stack semantics). A retry, duplicate death callback, worker retry, hot/cold handoff, or restart sees the durable resolution or missing source item and cannot create another object.

The world currently has no native ground-item ownership/protection timer or durable generic monster-drop table. The small death-world table therefore extends the existing spawn/pickup representation only for the durability and identity that this rule requires; it does not create a parallel inventory.
