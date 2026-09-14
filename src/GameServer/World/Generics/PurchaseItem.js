const ServerResponse = invoke('GameServer/Network/Response');
const DataCache      = invoke('GameServer/DataCache');
const Database       = invoke('Database');
const pendingPurchases = new WeakMap();

function purchaseItem(session, selfId, amount, metadata = {}) {
    const actor = session?.actor;
    if (!actor?.backpack) return false;
    // Several nearby ground stacks can now be picked up in one turn. Wait
    // for the previous inventory mutation before reading the next amount.
    const previous = pendingPurchases.get(actor.backpack);
    const award = () => awardItem(session, actor, selfId, amount, metadata);
    const pending = previous ? previous.then(award) : award();
    const settled = pending.catch((err) => {
        utils.infoWarn('GameServer', 'Item award failed actor=%s item=%s error=%s',
            actor.fetchId(), selfId, err?.message || String(err));
    });
    pendingPurchases.set(actor.backpack, settled);
    settled.then(() => {
        if (pendingPurchases.get(actor.backpack) === settled) pendingPurchases.delete(actor.backpack);
    });
    return settled;
}

function awardItem(session, actor, selfId, amount, metadata) {
    const backpack = actor.backpack;
    const refreshInventory = () => {
        if (session.actor !== actor) return;
        session.dataSendToMe(ServerResponse.userInfo(actor));
        session.dataSendToMe(ServerResponse.itemsList(backpack.fetchItems()));
    };

    return backpack.stackableExists(selfId).then((item) => { // Stackable item exists
        const itemId = item.fetchId();
        const total  = item.fetchAmount() + amount;

        return Database.updateItemAmount(actor.fetchId(), itemId, total).then(() => {
            backpack.updateAmount(itemId, total);
            refreshInventory();
        });
    }, () => new Promise((resolve, reject) => { // New item
        DataCache.fetchItemFromSelfId(selfId, (item) => {
            Database.setItem(actor.fetchId(), {
                  selfId: item.selfId,
                    name: item.template.name,
                  amount: amount,
                equipped: false,
                    slot: item.etc.slot,
                    ...(metadata.petData ? { petData: metadata.petData } : {})
            }).then((packet) => {
                backpack.insertItem(Number(packet.insertId), selfId, { amount: amount, ...metadata });
                refreshInventory();
            }).then(resolve, reject);
        });
    }));
}

module.exports = purchaseItem;
