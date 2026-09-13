const assert = require('assert');
require('../src/Global');
const World = invoke('GameServer/World/World');
const Response = invoke('GameServer/Network/Response');
const pickupExec = invoke('GameServer/Actor/Generics/PickupExec');
const purchaseItem = invoke('GameServer/World/Generics/PurchaseItem');
const Database = invoke('Database');

async function main() {
    const original = { fetchItem: World.fetchItem, pickupItem: World.pickupItem,
        packet: Response.pickupItem, timer: global.setTimeout, update: Database.updateItemAmount };
    try {
        for (const change of ['disconnect', 'replace', 'death', 'offline', 'none']) {
            const timers = [];
            let awarded = 0, completed = 0;
            const actor = { fetchId: () => 1, state: { setPickinUp() {} },
                automation: { schedulePickup(_session, _actor, _item, callback) { callback(); } } };
            const session = { actor, dataSendToMeAndOthers() {} };
            World.fetchItem = () => Promise.resolve({});
            World.pickupItem = () => { awarded++; };
            Response.pickupItem = () => ({});
            global.setTimeout = (callback, delay) => { timers.push({ callback, delay }); };
            pickupExec(session, actor, { id: 7 }, () => { completed++; });
            await Promise.resolve();
            assert.strictEqual(timers.length, 2);
            if (change === 'disconnect') session.actor = null;
            if (change === 'replace') session.actor = {};
            if (change === 'death') actor.isDead = () => true;
            if (change === 'offline') actor.fetchIsOnline = () => false;
            timers.sort((a, b) => a.delay - b.delay).forEach(timer => timer.callback());
            assert.strictEqual(awarded, change === 'none' ? 1 : 0, change);
            assert.strictEqual(completed, 1, 'cancelled pickups must still complete');
        }
        assert.strictEqual(purchaseItem({ actor: null }, 57, 1), false);
        let finishWrite;
        let updated = 0, sent = 0;
        Database.updateItemAmount = () => new Promise(resolve => { finishWrite = resolve; });
        const actor = { fetchId: () => 1, backpack: {
            stackableExists: () => Promise.resolve({ fetchId: () => 2, fetchAmount: () => 10 }),
            updateAmount(_id, amount) { updated = amount; }
        } };
        const session = { actor, dataSendToMe() { sent++; } };
        purchaseItem(session, 57, 5);
        await Promise.resolve();
        session.actor = null;
        finishWrite();
        await Promise.resolve();
        assert.strictEqual(updated, 15, 'an accepted write must finish for the original actor');
        assert.strictEqual(sent, 0, 'a completed write must not render a disconnected actor');
    } finally {
        World.fetchItem = original.fetchItem;
        World.pickupItem = original.pickupItem;
        Response.pickupItem = original.packet;
        global.setTimeout = original.timer;
        Database.updateItemAmount = original.update;
    }
    console.log('Pickup session lifecycle checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
