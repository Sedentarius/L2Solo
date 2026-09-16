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
            let arrive;
            let awarded = 0, completed = 0;
            const actor = { fetchId: () => 1, fetchLocX: () => 0, fetchLocY: () => 0, fetchLocZ: () => 0, fetchHead: () => 0, state: { setPickinUp() {} },
                automation: { schedulePickup(_session, _actor, _item, callback) { arrive = callback; } } };
            const session = { actor, dataSendToMe() {}, dataSendToMeAndOthers() {} };
            World.fetchItem = () => Promise.resolve({});
            World.pickupItem = () => { awarded++; };
            Response.pickupItem = () => ({});
            global.setTimeout = () => { throw new Error('Pickup must not introduce an animation cooldown'); };
            pickupExec(session, actor, { id: 7 }, () => { completed++; });
            await Promise.resolve();
            assert.strictEqual(typeof arrive, 'function');
            if (change === 'disconnect') session.actor = null;
            if (change === 'replace') session.actor = {};
            if (change === 'death') actor.isDead = () => true;
            if (change === 'offline') actor.fetchIsOnline = () => false;
            arrive();
            assert.strictEqual(awarded, change === 'none' ? 1 : 0, change);
            assert.strictEqual(completed, 1, 'cancelled pickups must still complete');
        }
        const rejectedPackets = [];
        const rejectedActor = { automation: { schedulePickup: () => false } };
        const rejectedSession = { actor: rejectedActor, dataSendToMe(packet) { rejectedPackets.push(packet[0]); } };
        World.fetchItem = async () => ({});
        let rejectedComplete = 0;
        pickupExec(rejectedSession, rejectedActor, { id: 7 }, () => { rejectedComplete++; });
        await Promise.resolve();
        assert.deepStrictEqual(rejectedPackets, [0x25], 'rejected approach must also release client Action');
        assert.strictEqual(rejectedComplete, 1);
        assert.strictEqual(purchaseItem({ actor: null }, 57, 1), false);
        let finishWrite;
        let updated = 0, sent = 0;
        Database.updateItemAmount = () => new Promise(resolve => { finishWrite = resolve; });
        const actor = { fetchId: () => 1, fetchLocX: () => 0, fetchLocY: () => 0, fetchLocZ: () => 0, fetchHead: () => 0, backpack: {
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
