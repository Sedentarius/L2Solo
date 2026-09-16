const assert = require('assert');

require('../src/Global');

const DataCache = invoke('GameServer/DataCache');
const ProgressionCap = invoke('GameServer/Progression/ProgressionCap');
const ExperienceReward = invoke('GameServer/Actor/Generics/ExperienceReward');
const CharacterWriteQueue = invoke('GameServer/Persistence/CharacterWriteQueue');
const ServerResponse = invoke('GameServer/Network/Response');
const NeedsEvaluator = invoke('GameServer/Bot/Goals/NeedsEvaluator');
const BotLifeState = invoke('GameServer/Bot/Population/BotLifeState');

DataCache.init();

function config(maxLevel, contentCap) {
    return { General: { maxLevel }, Progression: { contentCap } };
}

function actorAt(level, exp, karma = 0) {
    let currentLevel = level;
    let currentExp = exp;
    let currentSp = 0;
    let currentKarma = karma;
    return {
        effects: {},
        fetchId: () => 101,
        fetchLevel: () => currentLevel,
        fetchExp: () => currentExp,
        fetchSp: () => currentSp,
        fetchKarma: () => currentKarma,
        fetchPvp: () => 0,
        fetchPk: () => 0,
        setExpSp: (nextExp, nextSp) => { currentExp = nextExp; currentSp = nextSp; },
        setKarma: (value) => { currentKarma = value; },
        snapshot: () => ({ level: currentLevel, exp: currentExp, sp: currentSp, karma: currentKarma })
    };
}

async function run() {
    assert.strictEqual(ProgressionCap.maxLevel(), 78);
    assert.strictEqual(ProgressionCap.contentCap(), 40);
    assert.throws(() => ProgressionCap.validate(config(78, 79)), /cannot exceed/);
    assert.throws(() => ProgressionCap.validate(config(78, 0)), /greater than zero/);
    assert.throws(() => ProgressionCap.validate(config(79, 40)), /Chronicle 4/);

    for (const cap of [40, 60, 70, 78]) {
        const limits = config(78, cap);
        const maximum = Number(DataCache.experience[cap]) - 1;
        const award = ProgressionCap.applyAward(maximum - 5, 20, limits);
        assert.deepStrictEqual(award, { requested: 20, accepted: 5, discarded: 15, totalExp: maximum });
        assert.strictEqual(ProgressionCap.levelForExperience(maximum, 1, limits), cap);
    }
    assert.throws(() => ProgressionCap.validate(config(78, 79)), /cannot exceed/,
        'the absolute level 78 limit must prevent level 79');

    const level40Maximum = ProgressionCap.maximumAllowedExperience();
    const originalResponse = { userInfo: ServerResponse.userInfo, consoleText: ServerResponse.consoleText };
    const originalExperienceWrite = CharacterWriteQueue.experience;
    let persisted = null;
    ServerResponse.userInfo = () => Buffer.alloc(0);
    ServerResponse.consoleText = () => Buffer.alloc(0);
    CharacterWriteQueue.experience = (id, level, exp, sp) => { persisted = { id, level, exp, sp }; };
    try {
        const actor = actorAt(40, level40Maximum, 1000);
        const session = { dataSendToMe() {}, dataSendToOthers() {} };
        const result = ExperienceReward(session, actor, 1000, 10);
        assert.deepStrictEqual(result, {
            requestedExp: 1000,
            grantedExp: 0,
            discardedExp: 1000,
            totalExp: level40Maximum,
            grantedSp: 10,
            totalSp: 10
        });
        assert.deepStrictEqual(actor.snapshot(), { level: 40, exp: level40Maximum, sp: 10, karma: 1000 });
        assert.deepStrictEqual(persisted, { id: 101, level: 40, exp: level40Maximum, sp: 10 });
    } finally {
        ServerResponse.userInfo = originalResponse.userInfo;
        ServerResponse.consoleText = originalResponse.consoleText;
        CharacterWriteQueue.experience = originalExperienceWrite;
    }

    const cappedGoals = NeedsEvaluator.evaluate({
        level: 40,
        exp: level40Maximum,
        adena: 100000,
        activity: 'hunting',
        vitals: { hp: 100, maxHp: 100, mp: 100, maxMp: 100 },
        stats: { equipment: [] },
        inventory: {}
    }, { now: 1, spot: { id: 'test', risk: 0 } });
    assert(!cappedGoals.some((goal) => goal.type === 'progress_level'),
        'a capped bot must not request level 41');

    const coldState = {
        characterId: 102,
        name: 'ColdCap',
        level: 40,
        exp: level40Maximum,
        sp: 0,
        adena: 0,
        phase: 'cold',
        activity: 'hunting',
        spotId: 'test',
        loc: { locX: 0, locY: 0, locZ: 0 },
        vitals: { hp: 100, maxHp: 100, mp: 100, maxMp: 100 },
        timing: {},
        party: {},
        inventory: {},
        stats: { classId: 0, classProgressionLevel: 40, classProgressionClassId: 0, karma: 1000 }
    };
    const cold = await BotLifeState.prepareResolve(coldState, {
        materialize: { exp: 1000, sp: 10, adena: 0, items: [] },
        patch: {},
        debug: {},
        nextResolveAt: 60001
    }, { timestamp: 1, persist: false, projectClassProgression: true });
    assert.strictEqual(cold.exp, level40Maximum);
    assert.strictEqual(cold.level, 40);
    assert.strictEqual(cold.sp, 10);
    assert.strictEqual(cold.stats.karma, 1000, 'discarded cold EXP must not reduce karma');
    assert.strictEqual(cold.stats.expEarned, 0);
    assert.deepStrictEqual(cold.stats.lastExperienceAward, { requested: 1000, accepted: 0, discarded: 1000 });

    const belowCap = ProgressionCap.applyAward(Number(DataCache.experience[39]),
        level40Maximum, config(78, 40));
    assert.strictEqual(belowCap.totalExp, level40Maximum);
    assert.strictEqual(ProgressionCap.levelForExperience(belowCap.totalExp), 40);

    console.log('progression content cap ok');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
