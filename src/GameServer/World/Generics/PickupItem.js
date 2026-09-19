const ServerResponse = invoke('GameServer/Network/Response');
const ConsoleText    = invoke('GameServer/ConsoleText');
const PartyCompanionService = invoke('GameServer/Bot/AI/PartyCompanionService');
const Database = invoke('Database');

function pickupDeathDrop(world, session, actor, item) {
    const dropId = Number(item.fetchDeathDropId?.() || 0);
    const objectId = Number(item.fetchId());
    return Database.claimDeathWorldItem(dropId, actor.fetchId()).then((claim) => {
        if (!claim?.claimed) return false;
        const index = world.items.spawns.findIndex((spawn) => Number(spawn.fetchId()) === objectId);
        if (index >= 0) {
            const [claimedItem] = world.items.spawns.splice(index, 1);
            session.dataSendToMeAndOthers(ServerResponse.deleteOb(objectId), claimedItem);
        }
        // The durable claim is authoritative even if the session closes while
        // SQLite is committing it. Login hydration will load the awarded row.
        if (session.actor !== actor || actor.isDead?.()) return true;
        const backpack = actor.backpack;
        if (claim.stacked) {
            const target = backpack.fetchItems().find((entry) => Number(entry.fetchId()) === Number(claim.targetItemId));
            if (target) target.setAmount(Number(target.fetchAmount()) + Number(claim.amount));
        } else {
            backpack.insertItem(Number(claim.targetItemId), Number(claim.selfId), {
                amount: Number(claim.amount), enchant: Number(claim.enchant || 0),
                equipped: false, slot: Number(claim.slot || 0), petData: claim.petData || null
            });
        }
        if (actor.model) {
            session.dataSendToMe(ServerResponse.userInfo(actor));
            session.dataSendToMe(ServerResponse.itemsList(backpack.fetchItems()));
        }
        transmitPickup(session, Number(claim.selfId), Number(claim.amount));
        return true;
    }).catch((error) => {
        utils.infoWarn('DeathDrop', 'pickup failed drop=%s actor=%s: %s', dropId, actor.fetchId(), error.message);
        return false;
    });
}

function transmitPickup(session, selfId, amount) {
    const textName   = { kind: ConsoleText.kind.  item, value: selfId };
    const textAmount = { kind: ConsoleText.kind.number, value: amount };
    amount > 1
        ? (selfId === 57
            ? ConsoleText.transmit(session, ConsoleText.caption.pickupAdenaAmount, [textAmount])
            : ConsoleText.transmit(session, ConsoleText.caption.pickupAmountOf, [textName, textAmount]))
        : ConsoleText.transmit(session, ConsoleText.caption.pickup, [textName]);
}

function pickupItem(session, actor, item) {
    if (!actor || session?.actor !== actor || !actor.backpack ||
        actor.isDead?.() || actor.fetchIsOnline?.() === false) return false;
    const id     = item.fetchId();
    const spawnIndex = this.items.spawns.findIndex((spawn) => spawn.fetchId() === id);
    if (spawnIndex < 0) return false;

    const canonicalItem = this.items.spawns[spawnIndex];
    if (Number(canonicalItem.fetchDeathDropId?.() || 0) > 0) {
        return pickupDeathDrop(this, session, actor, canonicalItem);
    }
    const selfId = canonicalItem.fetchSelfId();
    const amount = canonicalItem.fetchAmount();
    const allocations = selfId === 57
        ? PartyCompanionService.adenaAllocations(session, amount, canonicalItem)
        : [{ session: PartyCompanionService.resolveLootSession(session, selfId, canonicalItem), amount }];
    // Validate every recipient before claiming the drop, so a stale session
    // cannot crash the award or consume loot without receiving it.
    if (!allocations.length || allocations.some((entry) => !entry.session?.actor?.backpack ||
        entry.session.actor.isDead?.() || entry.session.actor.fetchIsOnline?.() === false)) return false;

    // PickupExec resolves the ground object before the actor finishes moving.
    // A player and a bot can therefore both hold the same stale reference and
    // reach this method on adjacent timers. Removing the canonical spawn first
    // makes the claim atomic in the world event loop: only one caller may award
    // the item, distribute Adena, delete the object, or emit pickup text.
    const [claimedItem] = this.items.spawns.splice(spawnIndex, 1);

    session.dataSendToMeAndOthers(ServerResponse.deleteOb(id), claimedItem);

    if (selfId === 57) {
        allocations.forEach((entry) => {
            this.purchaseItem(entry.session, selfId, entry.amount);
            transmitPickup(entry.session, selfId, entry.amount);
        });
        return true;
    }

    const recipientSession = allocations[0].session;
    this.purchaseItem(recipientSession, selfId, amount, claimedItem.fetchPetData?.() ? { petData: claimedItem.fetchPetData() } : {});
    transmitPickup(recipientSession, selfId, amount);
    return true;
}

module.exports = pickupItem;
