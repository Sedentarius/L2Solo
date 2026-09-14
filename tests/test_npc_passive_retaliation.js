const assert = require('assert');
require('../src/Global');

const Npc = invoke('GameServer/Npc/Npc');
const receivedHit = invoke('GameServer/Npc/Generics/ReceivedHit');
invoke('GameServer/World/World').npc = { grid: {} };
const templates = require('../data/Npcs/npcs.json');
const actor = {
    fetchId: () => 2000001,
    fetchLevel: () => 40,
    fetchIsOnline: () => true,
    state: { fetchDead: () => false }
};
const packets = [];
const session = { actor, dataSendToMeAndOthers: packet => packets.push(packet) };

function create(kind, extra = {}) {
    const row = templates.find(value => value.template.kind === kind);
    assert(row, `missing ${kind} template`);
    const data = { selfId: row.selfId, locX: 0, locY: 0, locZ: 0, head: 0 };
    for (const value of Object.values(row)) {
        if (value && typeof value === 'object') Object.assign(data, value);
    }
    const npc = new Npc(900001, { ...data, ...extra });
    npc.broadcastVitals = () => {};
    npc.automation.replenishVitals = () => {};
    return npc;
}

// Exercise the real damage callback, including repeated/zero-damage hits and
// the direct hate/AI entry points used by taunts and external aggro callers.
for (const kind of ['Citizen', 'Merchant', 'Teleporter', 'Guild Coach', 'Guild Master',
    'Trainer', 'Blacksmith', 'Chamberlain']) {
    const npc = create(kind);
    const hp = npc.fetchHp();
    packets.length = 0;
    try {
        for (const damage of [10, 0, 10]) receivedHit(session, actor, npc, damage);
        assert.strictEqual(npc.fetchHp(), hp - 20, `${kind}: damage must still apply`);
        assert.strictEqual(npc.addDamageHate(session, actor, 0, 500), false);
        assert.strictEqual(npc.enterCombatState(session, actor), false);
        assert.strictEqual(npc.enterCombatState(session, actor, { skipAggro: true }), false);
        assert.strictEqual(npc.aggroList.size, 0, `${kind}: must not retain hate`);
        assert(!npc.state.fetchCombats(), `${kind}: must stay out of combat AI`);
        assert.strictEqual(npc.timer.combatStart, undefined);
        assert.strictEqual(npc.timer.combat, undefined);
        assert.deepStrictEqual(packets, [], `${kind}: must not start attacking or chasing`);
        assert.deepStrictEqual([npc.fetchLocX(), npc.fetchLocY(), npc.fetchLocZ()], [0, 0, 0]);
    } finally {
        npc.destructor(session);
    }
}

for (const [kind, extra] of [['Monster', { hostile: false }], ['Boss', {}],
    ['Guard', {}], ['Summon', {}], ['Pet', { isPet: true, isSummon: true }]]) {
    const npc = create(kind, extra);
    try {
        receivedHit(session, actor, npc, 1);
        assert(npc.state.fetchCombats(), `${kind}: must retain retaliation`);
        assert.strictEqual(npc.fetchDestId(), actor.fetchId());
        assert(npc.timer.combatStart, `${kind}: must still schedule combat AI`);
    } finally {
        npc.destructor(session);
    }
}

console.log('Passive NPC retaliation checks passed');
