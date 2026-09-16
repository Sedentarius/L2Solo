const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

require('../src/Global');

const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const GoalService = invoke('GameServer/Bot/Goals/GoalService');
const GoalState = invoke('GameServer/Bot/Goals/GoalState');
const Catalog = invoke('GameServer/Bot/Quest/AutonomousQuestCatalog');
const Bridge = invoke('GameServer/Bot/Quest/BotQuestBridge');
const ColdQuestRuntime = invoke('GameServer/Bot/Quest/ColdQuestRuntime');
const AutonomousRuntime = invoke('GameServer/Bot/Quest/AutonomousQuestRuntime');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-quest-bridge-b5-'));
const file = path.join(directory, 'quest-b5.sqlite');
options.default.Database.path = file;
process.env.L2NODE_PROGRESSION_RATE = 'x1';
Object.assign(options.default.General, {
    expRate: 1, spRate: 1, questExpRate: 1, questSpRate: 1, questAdenaRate: 1
});

async function amountOf(characterId, selfId) {
    const items = await Database.fetchItems(characterId);
    return items
        .filter((item) => Number(item.selfId) === Number(selfId))
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function arrive(state, timestamp) {
    const travel = state.stats?.travel;
    assert.ok(travel?.to, 'autonomous quest travel must have a durable destination');
    return {
        ...state,
        activity: travel.arrivalActivity || 'hunting',
        currentRegion: travel.regionName || state.currentRegion,
        spotId: travel.spotId || state.spotId,
        loc: { ...travel.to },
        timing: {
            ...(state.timing || {}),
            activityStartedAt: timestamp,
            nextResolveAt: timestamp + 1000
        },
        stats: { ...(state.stats || {}), travel: null }
    };
}

async function main() {
    const seed = new DatabaseSync(file);
    seed.exec(fs.readFileSync(path.resolve(__dirname, '../database/sql/sqlite.sql'), 'utf8'));
    seed.prepare('INSERT INTO accounts(username, password) VALUES (?, ?)').run('bot_quest_b5', 'test');
    seed.prepare(`INSERT INTO characters(id, username, name, classId, race, level, exp, sp, maxHp, maxMp, hp, mp, sex, face, hair, hairColor, locX, locY, locZ)
        VALUES (1, 'bot_quest_b5', 'AutonomousQuest1', 31, 2, 6, 0, 0, 187, 74, 187, 74, 0, 0, 0, 0, 100, 100, 0)`).run();
    seed.close();
    Database.init();
    DataCache.init();
    await GoalService.init();

    let lifecycle = {
        characterId: 1,
        accountName: 'bot_quest_b5',
        name: 'AutonomousQuest1',
        classId: 31,
        level: 6,
        exp: 0,
        sp: 0,
        adena: 1000,
        phase: 'cold',
        activity: 'hunting',
        currentRegion: 'Dark Elven Village',
        spotId: null,
        loc: { locX: 100, locY: 100, locZ: 0 },
        vitals: { hp: 187, maxHp: 187, mp: 74, maxMp: 74 },
        timing: { lastResolvedAt: 1000, nextResolveAt: 2000 },
        party: { partyId: null, leaderId: null, role: null },
        simulation: { ownerId: 'legacy_main', revision: 90 },
        stats: { classId: 31, karma: 0, equipment: [] },
        inventory: {}
    };

    // Character 1 belongs to admission bucket 1. Seed a still-fresh generic
    // progression goal first: the higher-priority quest must be allowed to
    // preempt it instead of waiting for that goal's review window to expire.
    await GoalState.set(1, {
        type: 'progress_level',
        status: 'active',
        priority: 35,
        target: { level: 7 },
        plan: { kind: 'farm_route' },
        blockers: [],
        reviewedAt: 59000,
        nextReviewAt: 30 * 60 * 1000
    });
    const goal = await GoalService.review(lifecycle, { now: 60000 });
    assert.equal(goal.current.type, 'complete_quest');
    assert.equal(goal.current.target.questId, 165);
    assert.equal(Catalog.candidateFor(lifecycle, { timestamp: 60000 }).type, 'complete_quest');
    assert.equal(Catalog.candidateFor({ ...lifecycle, characterId: 2 }, { timestamp: 60000 }), null,
        'staggering should prevent every eligible bot from selecting the same quest at once');

    // A quest is ordinary progression, not an emergency. A stronger active
    // goal such as recovery must retain ownership of the bot until its review.
    await GoalState.set(1, {
        type: 'recover',
        status: 'active',
        priority: 90,
        target: { hpPct: 0.8 },
        plan: { kind: 'rest' },
        blockers: [],
        reviewedAt: 60000,
        nextReviewAt: 30 * 60 * 1000
    });
    const protectedGoal = await GoalService.review(lifecycle, { now: 61000 });
    assert.equal(protectedGoal.current.type, 'recover',
        'autonomous quest selection must not preempt a higher-priority active goal');
    await GoalState.set(1, goal.current);

    const nelsyaLoc = Catalog.npcLocation(7348);
    assert.ok(nelsyaLoc, 'autonomous catalog must resolve the real Nelsya world spawn');
    const spec = Catalog.specFor(165);
    const huntSpot = Catalog.killSpot(spec, lifecycle);
    assert.ok(huntSpot, 'Q165 must have a cold hunting spot containing an authored target');
    assert.equal(Catalog.killTargetForSpot(spec, huntSpot), 456,
        'the autonomous Q165 route should prefer the guaranteed Wolf target');

    const originalSnapshot = LifeState.snapshot;
    const originalUpsert = LifeState.upsertState;
    try {
        LifeState.snapshot = (id) => Number(id) === 1 ? lifecycle : null;
        LifeState.upsertState = async (state) => {
            lifecycle = state;
            return state;
        };

        lifecycle = await AutonomousRuntime.advance(lifecycle, { timestamp: 60000 });
        assert.equal(lifecycle.activity, 'traveling');
        assert.equal(Bridge.intentFrom(lifecycle).step, 'start');
        assert.equal(Bridge.intentFrom(lifecycle).targetNpcId, 7348);

        lifecycle = arrive(lifecycle, 90000);
        lifecycle = await AutonomousRuntime.advance(lifecycle, { timestamp: 90000 });
        const startedQuest = (await Database.fetchCharacterQuests(1)).find((row) => Number(row.questId) === 165);
        assert.equal(startedQuest.state, 'started', 'the autonomous bot must accept Q165 through QuestService');
        assert.equal(Bridge.intentFrom(lifecycle).step, 'collect');
        assert.equal(lifecycle.activity, 'traveling', 'acceptance should immediately route the bot toward an authored hunt target');

        lifecycle = arrive(lifecycle, 120000);
        lifecycle = await AutonomousRuntime.advance(lifecycle, { timestamp: 120000 });
        assert.equal(lifecycle.activity, 'hunting');
        assert.equal(Bridge.intentFrom(lifecycle).step, 'collect');
        assert.equal(Bridge.intentFrom(lifecycle).targetNpcId, 456);
        assert.equal(AutonomousRuntime.targetNpcId(lifecycle, { spot: huntSpot, targetNpcId: 0 }), 456,
            'worker context must focus the authored quest target while collecting');

        for (let index = 0; index < 13; index++) {
            const kill = await ColdQuestRuntime.resolveColdKill(lifecycle, 456, `b5-wolf-${index}`, {
                timestamp: 130000 + index
            });
            assert.equal(kill.ok, true);
            lifecycle = kill.state;
            lifecycle = await AutonomousRuntime.advance(lifecycle, { timestamp: 130000 + index });
        }
        assert.equal(await amountOf(1, 1160), 13, 'autonomous collection must use the real Q165 drops');
        assert.equal(Bridge.intentFrom(lifecycle).step, 'return');
        assert.equal(lifecycle.activity, 'traveling', 'the 13th item should trigger the autonomous return trip');

        lifecycle = arrive(lifecycle, 170000);
        lifecycle = await AutonomousRuntime.advance(lifecycle, { timestamp: 170000 });

        const completedQuest = (await Database.fetchCharacterQuests(1)).find((row) => Number(row.questId) === 165);
        assert.equal(completedQuest.state, 'completed');
        assert.equal(await amountOf(1, 1160), 0, 'final hand-in must consume all Dark Bezoars');
        assert.equal(await amountOf(1, 1060), 5, 'final hand-in must award the authored reward');
        assert.equal(lifecycle.exp, 1000, 'authored quest EXP must reconcile back to the cold lifecycle');
        assert.equal(lifecycle.stats.questBridge, null);
        assert.equal(Number(lifecycle.stats.questAutomation.completed['165']), 170000);
        assert.equal(GoalService.snapshot(1).current.status, 'completed',
            'completion must mark the autonomous quest goal completed');
        assert.equal(Catalog.candidateFor(lifecycle, { timestamp: 540000, ignoreStagger: true }), null,
            'a completed one-shot quest must not be selected again');

        const rewardBeforeReplay = await amountOf(1, 1060);
        lifecycle = await AutonomousRuntime.advance(lifecycle, { timestamp: 180000 });
        assert.equal(await amountOf(1, 1060), rewardBeforeReplay,
            'an already completed autonomous workflow must be economically inert');
    } finally {
        LifeState.snapshot = originalSnapshot;
        LifeState.upsertState = originalUpsert;
    }

    console.log('Bot Quest Bridge B5 autonomous Q165 vertical checks passed');
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
