const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../src/Global');

const DataCache = invoke('GameServer/DataCache');
const Gear = invoke('GameServer/Bot/AI/GearAcquisitionPlanner');
const Equipment = invoke('GameServer/Clan/ClanEquipmentService');
const Goals = invoke('GameServer/Clan/ClanGoalService');
const Database = invoke('Database');
const Runtime = require('../src/GameServer/Clan/ClanPlanningCoordinator');
const { ClanPlanningCoordinator } = Runtime;
const { planForMember } = require('../src/GameServer/Clan/ClanEquipmentPlanner');

async function parityAndIntegration() {
    DataCache.init();
    const context = await Runtime.context();
    const worker = new ClanPlanningCoordinator();
    try {
        for (const [classId, level] of [[4, 20], [15, 40], [55, 52], [21, 61]]) {
            const member = { characterId: 990001, classId, level, phase: 'cold',
                stats: { classId }, inventory: {}, adena: 100000, currentRegion: 'Giran' };
            const payload = { member, spots: [], warehouseRows: [], context, options: { maxExpectedKills: 1500 } };
            const expected = planForMember(member, [], [], payload.options);
            assert.deepEqual(await worker.plan(payload, DataCache), expected,
                `worker must preserve planning for class ${classId}, level ${level}`);
        }
        assert.equal(worker.metrics().completed, 4);
        const world = invoke('GameServer/World/World');
        const market = invoke('GameServer/Bot/Economy/MarketOpportunity');
        const oldUser = world.user;
        try {
            world.user = { sessions: [{ accountId: 'test-seller', actor: {
                fetchId: () => 990010, fetchName: () => 'Test Seller',
                fetchPrivateStore: () => ({ storeType: 1, town: 'Giran', items: [{ selfId: 123, price: 10, count: 1 }] })
            } }] };
            market.indexColdStore({ characterId: 990002, activity: 'merchant', stats: {
                marketStore: { storeType: 1, town: 'Giran', items: [{ selfId: 123, price: 1, count: 1 }] }
            } });
            const member = { characterId: 990002, level: 20, classId: 4, phase: 'cold', inventory: {}, adena: 100000,
                stats: { classId: 4, equipmentPlan: { status: 'active', strategy: 'market', rateModelVersion: 0,
                    target: { selfId: 123, slot: 7 } } } };
            const marketContext = await Runtime.context();
            const expected = planForMember(member);
            assert.equal(expected.market.sourceType, 'private_store');
            assert.equal(expected.market.price, 10, 'a buyer must not plan to buy from its own cheaper cold shop');
            assert.deepEqual(await worker.plan({ member, spots: [], warehouseRows: [], options: {}, context: marketContext }, DataCache), expected);
        } finally {
            world.user = oldUser;
            market.removeColdStore(990002);
        }
        const oldRate = process.env.L2NODE_PROGRESSION_RATE;
        try {
            process.env.L2NODE_PROGRESSION_RATE = 'x10';
            const member = { characterId: 990002, level: 40, classId: 4, phase: 'cold', stats: { classId: 4 }, inventory: {} };
            const result = await worker.plan({ member, spots: [], warehouseRows: [], options: {},
                context: { ...context, progressionRate: 'x10' } }, DataCache);
            assert.deepEqual(result, planForMember(member), 'resolved runtime rates must be refreshed in an already running worker');
        } finally {
            if (oldRate === undefined) delete process.env.L2NODE_PROGRESSION_RATE;
            else process.env.L2NODE_PROGRESSION_RATE = oldRate;
        }
        await assert.rejects(worker.plan({ context: null }, DataCache));
        assert.equal(worker.metrics().failures, 1, 'worker calculation failures must be observable');
    } finally { await worker.shutdown(); }

    const clan = { id: 99, level: 3, leaderId: 990001, state: { mode: 'autonomous', updatedAt: 123, warehouseRevision: 1 },
        members: [{ characterId: 990001, level: 40, classId: 4, phase: 'cold', simulationOwner: 'legacy_main',
            inventory: {}, adena: 100000, stats: { classId: 4 } }] };
    clan.members.push({ ...structuredClone(clan.members[0]), characterId: 990003 });
    const originalWarehouse = Database.fetchClanWarehouseItems;
    const originalProjection = Goals.clanProjectionById;
    const originalPlanner = Gear.planFor;
    Database.fetchClanWarehouseItems = async () => [];
    let current = structuredClone(clan);
    Goals.clanProjectionById = async () => current;
    Runtime.start();
    try {
        Gear.planFor = () => { throw new Error('main-thread planner must never execute'); };
        const planning = await Equipment.planningForClan(clan, null, { spots: [], occupancy: {} });
        assert(planning.selection, 'enabled runtime must actually calculate a usable worker plan');
        assert(Runtime.metrics().completed > 0);
        await Equipment.validatePlanning(clan, planning);
        const beneficiaryId = planning.selection.member.characterId;
        const other = current.members.find((member) => member.characterId !== beneficiaryId);
        other.inventory[1868] = { selfId: 1868, amount: 1 };
        other.adena++;
        await Equipment.validatePlanning(clan, planning, planning.selection);
        current.members.find((member) => member.characterId === beneficiaryId).adena++;
        await assert.rejects(Equipment.validatePlanning(clan, planning, planning.selection), { code: 'clan_planning_deferred' },
            'beneficiary resource changes must invalidate a plan, unrelated loot must not starve it');
        for (const mutate of [
            (c) => { c.members[0].phase = 'hot'; },
            (c) => { c.members[0].partyId = 'new-party'; },
            (c) => { c.members[0].inventory = { 123: { selfId: 123, amount: 1, equipped: true } }; },
            (c) => { c.state.warehouseRevision++; },
            (c) => { c.state.mode = 'player_managed'; },
            (c) => { c.members = []; }
        ]) {
            current = structuredClone(clan);
            mutate(current);
            await assert.rejects(Equipment.validatePlanning(clan, planning), { code: 'clan_planning_deferred' });
            await assert.rejects(Equipment.resolveClan(clan, null, { planning }), { code: 'clan_planning_deferred' });
        }
        await Runtime.shutdown();
        assert.equal(Runtime.enabled(), true, 'shutdown/failure must not enable synchronous fallback');
        await assert.rejects(Equipment.planningForClan(clan, null, { spots: [], occupancy: {} }),
            { code: 'clan_planning_deferred' });
    } finally {
        Gear.planFor = originalPlanner;
        Database.fetchClanWarehouseItems = originalWarehouse;
        Goals.clanProjectionById = originalProjection;
        await Runtime.shutdown();
    }
}

async function workerLifecycle() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clan-planning-worker-'));
    const workerFile = path.join(directory, 'worker.cjs');
    fs.writeFileSync(workerFile, `const { parentPort } = require('node:worker_threads');
parentPort.on('message', (m) => {
    if (m.payload?.crash) process.exit(1);
    if (m.payload?.hang) return;
    if (m.payload?.busyMs) {
        const end = performance.now() + m.payload.busyMs;
        while (performance.now() < end) {}
    }
    parentPort.postMessage({ id: m.id, result: m.type === 'plan' ? { plan: { ok: true }, durationMs: 1 } : true });
});`);
    const worker = new ClanPlanningCoordinator({ workerFile, timeoutMs: 1000, maxPending: 1, restartDelayMs: 0 });
    try {
        const timedOut = assert.rejects(worker.plan({ hang: true }, {}), /timed out/);
        await new Promise((resolve) => setImmediate(resolve));
        await assert.rejects(worker.plan({}, {}), /queue full/);
        await timedOut;
        assert.equal(worker.metrics().pending, 0);
        assert.equal(worker.metrics().timeouts, 1);
        await assert.rejects(worker.plan({ crash: true }, {}), /exited/);
        assert.deepEqual(await worker.plan({}, {}), { ok: true }, 'worker must restart after a crash');

        let ticks = 0;
        const timer = setInterval(() => ticks++, 5);
        try { await worker.plan({ busyMs: 200 }, {}); }
        finally { clearInterval(timer); }
        assert(ticks >= 5, 'CPU-bound worker calculation must allow the game thread to keep processing timers');

        const stopped = assert.rejects(worker.plan({ hang: true }, {}), /stopped/);
        await new Promise((resolve) => setImmediate(resolve));
        await worker.shutdown();
        await stopped;
        assert.equal(worker.metrics().pending, 0);
        await assert.rejects(worker.plan({}, {}), /stopped/);
    } finally {
        await worker.shutdown();
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

(async () => {
    await parityAndIntegration();
    await workerLifecycle();
    console.log('Clan planning worker parity, stale snapshots, isolation and recovery checks passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
