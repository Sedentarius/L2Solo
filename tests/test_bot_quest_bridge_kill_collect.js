const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

require('../src/Global');

const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const Backpack = invoke('GameServer/Actor/Backpack');
const QuestService = invoke('GameServer/Quest/QuestService');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const InventorySummary = invoke('GameServer/Bot/Population/InventorySummary');
const Bridge = invoke('GameServer/Bot/Quest/BotQuestBridge');
const Planner = invoke('GameServer/Bot/Quest/BotQuestKillPlanner');
const Runtime = invoke('GameServer/Bot/Quest/ColdQuestRuntime');
const Hook = invoke('GameServer/Bot/Quest/ColdQuestCommitHook');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-quest-bridge-b2-'));
const file = path.join(directory, 'quest-b2.sqlite');
options.default.Database.path = file;
process.env.L2NODE_PROGRESSION_RATE = 'x1';

async function sessionFor(id) {
    const session = {
        actor: {
            exp: 0,
            sp: 0,
            fetchId: () => id,
            fetchName: () => `ColdQuest${id}`,
            fetchRace: () => 2,
            fetchClassId: () => 31,
            fetchLevel: () => 6,
            fetchClanId: () => 0,
            fetchExp() { return this.exp; },
            fetchSp() { return this.sp; },
            setExpSp(exp, sp) { this.exp = exp; this.sp = sp; },
            backpack: new Backpack({ items: await Database.fetchItems(id), paperdoll: {} })
        },
        packets: [],
        dataSendToMe(packet) { this.packets.push(packet); }
    };
    await QuestService.ensureLoaded(session);
    return session;
}

async function amountOf(characterId, selfId) {
    const items = await Database.fetchItems(characterId);
    return items
        .filter((item) => Number(item.selfId) === Number(selfId))
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

async function main() {
    const seed = new DatabaseSync(file);
    seed.exec(fs.readFileSync(path.resolve(__dirname, '../database/sql/sqlite.sql'), 'utf8'));
    seed.prepare('INSERT INTO accounts(username, password) VALUES (?, ?)').run('quest_bridge_b2', 'test');
    seed.prepare(`INSERT INTO characters(id, username, name, classId, race, level, maxHp, maxMp, sex, face, hair, hairColor, locX, locY, locZ)
        VALUES (1, 'quest_bridge_b2', 'ColdQuest1', 31, 2, 6, 187, 74, 0, 0, 0, 0, 100, 100, 0)`).run();
    seed.close();
    Database.init();
    DataCache.init();

    // Start Q165 through the same public QuestService path a hot character uses.
    const starter = await sessionFor(1);
    const startNpc = { fetchId: () => 107348, fetchSelfId: () => 7348 };
    starter.activeNpcTalk = { objectId: startNpc.fetchId(), selfId: startNpc.fetchSelfId() };
    assert.equal(await QuestService.onTalk(starter, startNpc), true);
    assert.equal(await QuestService.onEvent(starter, { questId: 165, name: 'start' }), true);

    let lifecycle = {
        characterId: 1,
        name: 'ColdQuest1',
        level: 6,
        phase: 'cold',
        activity: 'hunting',
        loc: { locX: 100, locY: 100, locZ: 0 },
        timing: { lastResolvedAt: 1000, nextResolveAt: 2000 },
        simulation: { ownerId: 'legacy_main', revision: 40 },
        stats: {
            questBridge: Bridge.normalizeIntent({ questId: 165, step: 'collect', attempt: 1 }, 1000)
        },
        inventory: InventorySummary.fromItems(await Database.fetchItems(1)),
        adena: 0
    };

    // Q165 authors four valid kill targets. Wolf (456) is guaranteed to drop,
    // while the other three retain their authored probabilistic callbacks.
    const authoredTargets = [456, 529, 532, 536];
    assert.deepEqual(Planner.killNpcIds(lifecycle.stats.questBridge), authoredTargets);
    authoredTargets.forEach((npcId) => {
        assert.equal(Planner.isKillTarget(lifecycle.stats.questBridge, npcId), true);
    });
    assert.equal(Planner.isKillTarget(lifecycle.stats.questBridge, 457), false);

    const hotSession = {
        actor: { fetchLocX: () => 0, fetchLocY: () => 0 },
        questBridge: lifecycle.stats.questBridge
    };
    const nearestWolf = {
        fetchId: () => 11, fetchSelfId: () => 456,
        fetchLocX: () => 100, fetchLocY: () => 0,
        isDead: () => false
    };
    const fartherWolf = {
        fetchId: () => 12, fetchSelfId: () => 456,
        fetchLocX: () => 500, fetchLocY: () => 0,
        isDead: () => false
    };
    const wrongMob = {
        fetchId: () => 13, fetchSelfId: () => 457,
        fetchLocX: () => 10, fetchLocY: () => 0,
        isDead: () => false
    };
    assert.equal(Planner.selectHotKillTarget(hotSession, [wrongMob, fartherWolf, nearestWolf]), nearestWolf,
        'hot quest targeting should choose the nearest living authored kill target');

    const originalSnapshot = LifeState.snapshot;
    const originalUpsert = LifeState.upsertState;
    try {
        LifeState.snapshot = (id) => Number(id) === 1 ? lifecycle : null;
        LifeState.upsertState = async (state) => {
            lifecycle = state;
            return state;
        };

        const first = await Runtime.resolveColdKill(lifecycle, 456, 'commit-1');
        assert.equal(first.ok, true);
        assert.equal(first.replayed, false);
        assert.equal(await amountOf(1, 1160), 1, 'cold kill must award the real Q165 quest item through QuestService');
        assert.equal(lifecycle.inventory['1160'].amount, 1, 'cold lifecycle inventory must reconcile from the materialized Backpack');

        const duplicate = await Runtime.resolveColdKill(lifecycle, 456, 'commit-1');
        assert.equal(duplicate.ok, true);
        assert.equal(duplicate.replayed, true);
        assert.equal(await amountOf(1, 1160), 1, 'replaying a cold kill receipt must not duplicate quest items');

        const second = await Runtime.resolveColdKill(lifecycle, 456, 'commit-2');
        assert.equal(second.ok, true);
        assert.equal(await amountOf(1, 1160), 2);

        const rejected = await Runtime.resolveColdKill(lifecycle, 457, 'wrong-target');
        assert.equal(rejected.ok, false);
        assert.equal(rejected.reason, 'not_quest_target');
        assert.equal(await amountOf(1, 1160), 2);

        // A committed resolver result may contain several wins. Only authored
        // quest targets are forwarded and replaying the same revision is safe.
        lifecycle.simulation.revision = 55;
        const entry = {
            nextState: lifecycle,
            result: { revision: 55 },
            proposal: {
                enqueuedAt: 5000,
                result: { debug: { foughtNpcIds: [456, 457, 456] } }
            }
        };
        const committed = await Runtime.processCommittedKills(entry, lifecycle);
        lifecycle = committed.state;
        assert.equal(committed.processed, 2);
        assert.equal(await amountOf(1, 1160), 4, 'two distinct committed wolf wins should produce two authoritative callbacks');
        const replayedCommit = await Runtime.processCommittedKills(entry, lifecycle);
        lifecycle = replayedCommit.state;
        assert.equal(replayedCommit.processed, 0);
        assert.equal(await amountOf(1, 1160), 4, 'replaying an already processed cold commit must be economically inert');

        // Fail closed: reserve the receipt before the quest callback. If a
        // callback fails, retrying that same committed kill cannot clone loot.
        const originalOnKill = QuestService.onKill;
        let callbacks = 0;
        try {
            QuestService.onKill = async () => { callbacks += 1; throw new Error('synthetic quest failure'); };
            const failed = await Runtime.resolveColdKill(lifecycle, 456, 'fail-closed');
            assert.equal(failed.failClosed, true);
            const retried = await Runtime.resolveColdKill(lifecycle, 456, 'fail-closed');
            assert.equal(retried.replayed, true);
            assert.equal(callbacks, 1, 'a claimed failed callback must not be re-executed for the same committed kill');
            assert.equal(await amountOf(1, 1160), 4);
        } finally {
            QuestService.onKill = originalOnKill;
        }
    } finally {
        LifeState.snapshot = originalSnapshot;
        LifeState.upsertState = originalUpsert;
    }

    // The coordinator decorator must be idempotent and run only after the core
    // commit callback. This test does not need a worker thread.
    class FakeCoordinator {
        async afterCommit(entry) { return entry.nextState; }
    }
    const fakeModule = { ColdSimulationCoordinator: FakeCoordinator };
    const originalProcess = Runtime.processCommittedKills;
    let hookCalls = 0;
    try {
        Runtime.processCommittedKills = async (_entry, state) => {
            hookCalls += 1;
            return { processed: 0, state: { ...state, hookObserved: true } };
        };
        Hook.install(fakeModule);
        Hook.install(fakeModule);
        const hooked = await new FakeCoordinator().afterCommit({ nextState: { characterId: 1 }, proposal: { result: { debug: {} } } });
        assert.equal(hooked.hookObserved, true);
        assert.equal(hookCalls, 1, 'installing the post-commit hook twice must not wrap afterCommit twice');
    } finally {
        Runtime.processCommittedKills = originalProcess;
    }

    const coordinator = invoke('GameServer/Bot/Population/ColdSimulationCoordinator');
    assert.equal(typeof coordinator.start, 'function');
    assert.equal(typeof coordinator.ColdSimulationCoordinator, 'function');

    console.log('Bot Quest Bridge B2 kill/collect checks passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    try {
        await Database.close();
    } finally {
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    }
});