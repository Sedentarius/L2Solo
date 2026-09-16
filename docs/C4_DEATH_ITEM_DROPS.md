# Chronicle 4 death item and equipment drops

This note records the evidence and decisions behind L2Solo's authoritative death-drop rule. It is intentionally separate from the runtime constants so disputed history remains auditable without putting source URLs into gameplay code.

## Sources

Evidence was evaluated in the ticket's required order:

1. The archived official [Lineage II PvP guide](https://legacy-lineage2.com/Knowledge/cp.html) says chaotic characters have a high chance of dropping items and documents the special protection around low PK counts.
2. The archived official [Chronicle 3 update notes](https://legacy-lineage2.com/news/chronicle3_06.html) describe the low-PK chaotic protection specifically in PvP terms.
3. The archived official [Chronicle 5 update notes](https://legacy-lineage2.com/news/chronicle5_01.html) explicitly discuss a chaotic low-PK character killed by an NPC and dropping an item, and remove a pre-existing 15-second party/clan pickup priority. Because C5 describes these as changes, it is useful evidence for behavior immediately before the change in C4.
4. The archived official [Chronicle 1 pet/summon notes](https://legacy-lineage2.com/news/chronicle1_11.html) state that characters do not drop items when killed by another player's pet/summon. No C4-era reversal of that rule was found.
5. The archived official [Chronicle 2 update notes](https://legacy-lineage2.com/news/chronicle2_05.html) describe reducing item-drop probability at relatively low karma, confirming that current karma participates in the risk model.
6. Contemporary 2006 gameplay discussions consistently describe ordinary PvE item loss, enhanced chaotic risk, and special equipped-weapon protection below the high-PK chaotic state. Some contemporary summaries conflict on whether an equipped weapon could ever drop for a white character, so these are supporting rather than primary evidence.
7. [L2JLisvus C4](https://github.com/L2jLisvus/L2JLisvus), `L2PcInstance#onDieDropItem` and its C4 configuration, supplies the executable probability/category model and protected-item lists.
8. [L2J Mobius C4](https://git.grachevko.ru/lineage2/l2j_mobius/src/commit/9168f1ea57f87107c8743ddc218f27eff1b72724/L2J_Mobius_C4) corroborates much of that implementation behavior but originated from Lisvus-era code and therefore is not fully independent historical evidence.

No proprietary or leaked L2OFF material was used, and no GPL source was copied.

## Final rules

| Question | L2Solo C4 rule | Confidence and disagreement |
| --- | --- | --- |
| Normal/white PvE death | A level 5+ character killed by an NPC/monster has a 5% overall chance to enter item selection. | High for the existence of ordinary PvE loss; high for the reference-server rate. |
| Normal/white player death | No item loss in ordinary world PvP. A player-owned pet/servitor is treated as a player-caused death for item-drop purposes. | High for no ordinary PvP item loss; the pet/summon rule is supported by official early-chronicle documentation and no C4 reversal was found. |
| Current karma | Current karma determines whether the high-risk chaotic branch can apply. Cleared karma returns the character to the ordinary model even with historical PKs. | High. Official adjacent-chronicle notes and both reference implementations agree that current karma matters. |
| PK count | Chaotic risk begins at 6 PKs. A chaotic character with 0-5 PKs killed by another player/player-owned summon is protected from item loss, but an NPC/monster death still uses ordinary PvE risk. PK count alone does not create chaotic risk after karma is cleared. | High for the PvP 5/6 threshold; medium-high for the NPC fall-through, supported by the C5 change note and Lisvus behavior. |
| Overall probability | Ordinary PvE: 5%. Chaotic with 6+ PKs: 70% outside protected contexts. Low-PK chaotic NPC deaths use the ordinary 5% gate. | High for the configured C4 reference values. |
| Per-object probability | After the overall roll succeeds, each eligible object is tested in stable inventory-object order. Ordinary: inventory 70%, equipped armor/jewelry 25%. Full chaotic risk: inventory 50%, equipped armor/jewelry 40%, equipped weapon 10%. | High for the reference-server category values. The ordinary reference configuration exposes a 5% weapon band, but L2Solo does not make the equipped weapon eligible outside the full chaotic state because the historical player-facing rule is better supported by C4-era behavior. |
| Weapon protection | The equipped weapon is protected for white/ordinary deaths and while chaotic PK count is below 6. It becomes eligible only while currently chaotic with 6+ PKs, using the 10% chaotic weapon roll after the 70% overall gate. Unequipped weapons remain ordinary inventory candidates. | Medium-high. This resolves a conflict between the generic reference-server player weapon rate and contemporary descriptions of the actual player-facing protection. |
| Drop count | Zero to five world objects. One overall gate is followed by independent per-object rolls, stopping after five successes. | Medium. Contemporary guidance says five; C4 reference defaults expose different configurable player/karma limits. The five-object cap remains an explicit L2Solo interpretation. |
| Equipment and inventory | Equipped armor/jewelry, unequipped equipment, ordinary consumables, shots, and materials are candidates. Equipped weapon eligibility follows the special rule above. | High except for the separately documented weapon interpretation. |
| Stackables | A successful stackable candidate transfers the whole stack as one world object. | High from reference behavior. |
| Adena and protected items | Adena, quest items, the C4 protected control/currency-like IDs, active/dead pet control items, and explicitly non-droppable items are excluded. | High for Adena/quest/protected IDs and pet control items from both references. |
| Exempt contexts | Arena, duel, event, festival, Olympiad, Lucky protection, protected PvP-zone deaths, and qualifying siege-participant deaths do not drop. A non-chaotic mutual clan-war death does not drop. These reuse the P0-A death-context vocabulary. | High for arena/event/PvP-zone/festival/reference exclusions; medium for generalized duel/Olympiad/siege mapping. |
| Ground ownership | The current runtime leaves death-dropped items free-for-all. This is **not yet considered a final C4-fidelity decision**: the C5 change notes prove that a 15-second party/clan priority existed in at least one C4 death-drop scenario. Exact C4 ownership scope still needs reconstruction before implementing a timer. | Open / follow-up required. Do not treat current FFA behavior as established retail C4. |

## Player-owned summons and EXP

Item-drop classification and EXP-loss classification are intentionally separate. A player-owned pet/servitor counts as a player-caused kill for death-item eligibility, so an ordinary white victim does not drop items. `DeathExperience` retains its pre-existing `killerPlayable` classification until the exact C4 EXP penalty for pet/servitor kills is independently established; A6 does not infer that EXP behavior from item-drop behavior.

## Runtime and persistence contract

`DeathItemDrop` is the sibling authority to `DeathExperience`. It calculates eligibility and a deterministic plan for players and bots from the same constants. Hot deaths commit the item-instance transfer before mutating the live backpack or spawning the normal ground object. Cold deaths remove the same selected instances from the inventory summary and carry the same plan through the existing fenced cold transaction. The legacy cold write path persists that plan in `bot_life_state`; startup recovery completes any plan whose state marker committed before its ownership transition.

`character_death_item_drop` assigns a per-character death sequence and makes `(characterId, deathKey)` unique. `death_world_items` owns the exact source object ID, amount, enchant, slot, pet metadata, location, and claim state after the inventory row is deleted. A partial unique index permits only one active ground owner for a source object while still allowing that same object to be picked up and dropped again on a later death. Thus the database transaction has one owner before and after transfer; there is no inventory-plus-ground clone window.

Pending rows are rehydrated into the ordinary world item collection on startup. Pickup atomically changes a pending row to claimed and recreates the same non-stackable object ID in the recipient inventory (ordinary stack merging retains normal stack semantics). A retry, duplicate death callback, worker retry, hot/cold handoff, or restart sees the durable resolution or missing source item and cannot create another object.

The world currently has no native ground-item ownership/protection timer or durable generic monster-drop table. The small death-world table therefore extends the existing spawn/pickup representation only for the durability and identity that this rule requires; it does not create a parallel inventory. A future C4 pickup-priority correction should extend this durable death-world representation rather than bypassing it.
