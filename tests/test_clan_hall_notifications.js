const assert = require('assert');
require('../src/Global');
const Runtime = invoke('GameServer/ClanHall/Runtime');
const Npc = invoke('GameServer/ClanHall/Npc');
const Database = invoke('Database');
const World = invoke('GameServer/World/World');
const Clans = invoke('GameServer/Clan/ClanService');
const Message = invoke('GameServer/Network/Response/SystemMessage');
const Receive = invoke('Packet/Receive');
const original = {
    user: World.user,
    npc: World.fetchNpc,
    clan: Clans.findById,
    auctions: Database.fetchClanHallAuctions,
    bid: Database.placeClanHallBid,
    cancel: Database.cancelClanHallBid
};
const hall = { id: 31, ownerId: 0, functionsJson: '{}', auctionEndsAt: Date.now() + 86400000 };
let rows = [hall];
let accepted = true;
function member(id) {
    return {
        sent: [],
        actor: { fetchId: () => id, fetchClanId: () => id,
            fetchLocX: () => 0, fetchLocY: () => 0, fetchLocZ: () => 0, isDead: () => false },
        dataSendToMe(packet) { this.sent.push(packet); }
    };
}
const winner = member(1), mate = member(1), outsider = member(2);
const notices = (session) => session.sent.filter((p) => p[0] === 0x64);
async function main() {
    try {
        const packet = Message(776, 'Dawn & Dusk');
        assert.equal(packet[0], 0x64);
        assert.deepEqual(new Receive(packet).readD().readD().readD().readS().data,
            [776, 1, 0, 'Dawn & Dusk'], 'native award message takes the winning clan name as TYPE_TEXT');
        assert.deepEqual(new Receive(Message(1052)).readD().readD().data, [1052, 0]);
        assert.deepEqual(new Receive(Message.text('Hello')).readD().readD().readD().readS().data,
            [614, 1, 0, 'Hello'], 'existing plain system messages retain their wire format');
        World.user = { sessions: [winner, mate, outsider] };
        Clans.findById = (id) => ({ id, members: [], name: id === 1 ? 'Dawn & Dusk' : 'Other Clan' });
        Database.fetchClanHallAuctions = async () => rows;
        Runtime.applyRows(rows);
        rows = [{ ...hall, ownerId: 1 }];
        await Runtime.refresh();
        assert.equal(notices(winner).length, 1);
        assert.equal(notices(mate).length, 1, 'all online winning clan members receive the award');
        assert.equal(notices(outsider).length, 0, 'award is not a global announcement');
        assert.deepEqual(new Receive(notices(winner)[0]).readD().readD().readD().readS().data,
            [776, 1, 0, 'Dawn & Dusk']);
        await Runtime.refresh();
        assert.equal(notices(winner).length, 1, 'unchanged ownership must not repeat the award');
        rows = [hall];
        await Runtime.refresh();
        assert.equal(notices(winner).at(-1).readInt32LE(1), 1052, 'revocation uses the C4 native notice');
        assert.equal(notices(mate).at(-1).readInt32LE(1), 1052);
        assert.equal(notices(outsider).length, 0);
        await Runtime.refresh();
        assert.equal(notices(winner).length, 2, 'revocation is sent once');
        const auctioneer = Runtime.Policy.catalog.auctioneerIds[0];
        World.fetchNpc = async () => ({ fetchSelfId: () => auctioneer,
            fetchLocX: () => 0, fetchLocY: () => 0, fetchLocZ: () => 0 });
        winner.activeNpcTalk = { selfId: auctioneer, objectId: 42 };
        Database.placeClanHallBid = async () => accepted ? { ok: true } : { ok: false, code: 'invalid_bid' };
        Database.cancelClanHallBid = async () => ({ ok: true });
        await Npc.handle(winner, ['clan-hall', 'bid', '31', '9000000']);
        assert.equal(notices(winner).at(-1).readInt32LE(1), 1006);
        await Npc.handle(winner, ['clan-hall', 'cancel']);
        assert.equal(notices(winner).at(-1).readInt32LE(1), 679);
        accepted = false;
        const count = notices(winner).length;
        await Npc.handle(winner, ['clan-hall', 'bid', '31', '1']);
        assert.equal(notices(winner).length, count, 'failed bids must not get a success message');
        assert([winner, mate, outsider].every(s => s.sent.every(p => p[0] !== 0x98)),
            'Lisvus clan hall notifications do not send a separate PlaySound packet');
        console.log('Clan hall native notices, recipient routing, deduplication and packet encoding passed');
    } finally {
        World.user = original.user;
        World.fetchNpc = original.npc;
        Clans.findById = original.clan;
        Database.fetchClanHallAuctions = original.auctions;
        Database.placeClanHallBid = original.bid;
        Database.cancelClanHallBid = original.cancel;
        Runtime.applyRows([]);
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
