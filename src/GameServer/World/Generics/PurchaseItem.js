const ServerResponse = invoke('GameServer/Network/Response');
const DataCache      = invoke('GameServer/DataCache');
const Database       = invoke('Database');

function purchaseItem(session, selfId, amount, metadata = {}) {
    const actor = session?.actor;
    if (!actor?.backpack) return false;
    const backpack = actor.backpack;
    const refreshInventory = () => {
        if (session.actor !== actor) return;
        session.dataSendToMe(ServerResponse.userInfo(actor));
        session.dataSendToMe(ServerResponse.itemsList(backpack.fetchItems()));
    };

    backpack.stackableExists(selfId).then((item) => { // Stackable item exists
        const itemId = item.fetchId();
        const total  = item.fetchAmount() + amount;

        Database.updateItemAmount(actor.fetchId(), itemId, total).then(() => {
            backpack.updateAmount(itemId, total);
            refreshInventory();
        });
    }).catch(() => { // New item
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
            });
        });
    });
}

module.exports = purchaseItem;
