const assert = require('assert');

require('../src/Global');

const DataCache = invoke('GameServer/DataCache');
const ProgressionCap = invoke('GameServer/Progression/ProgressionCap');
const DeathExperience = invoke('GameServer/Progression/DeathExperience');
const OverhitReward = invoke('GameServer/Progression/OverhitReward');
const ExperienceReward = invoke('GameServer/Actor/Generics/ExperienceReward');
const BotLifeState = invoke('GameServer/Bot/Population/BotLifeState');
const CharacterWriteQueue = invoke('GameServer/Persistence/CharacterWriteQueue');
const ServerResponse = invoke('GameServer/Network/Response');
const Generics = invoke(path.actor);

DataCache.init();

function hotActor(level, exp, sp = 0) {
    let currentLevel = level;
    let currentExp = exp;
    let currentSp = sp;
    return {
        effects: {},
        fetchId: () => 0,
        fetchLevel: () => currentLevel,
        fetchExp: () => currentExp,
        fetchSp: () => currentSp,
        fetchKarma: () => 0,
        fetchPvp: () => 0,
        fetchPk: () => 0,
        setLevel: (value) => { currentLevel = value; },
        setExpSp: (nextExp, nextSp) => { currentExp = nextExp; currentSp = nextSp; },
        snapshot: () => ({ level: currentLevel, exp: currentExp, sp: currentSp })
    };
}

function coldState(level, exp, sp = 0) {
    return {
        characterId: 0,
        name: 'Parity',
        level,
        exp,
        sp,
        adena: 0,
        phase: 'cold',
        activity: 'hunting',
        loc: { locX: 0, locY: 0, locZ: 0 },
        vitals: { hp: 100, maxHp: 100, mp: 100, maxMp: 100 },
        timing: {}, party: {}, inventory: {},
        stats: { classId: 0, classProgressionLevel: level, classProgressionClassId: 0, karma: 0 }
    };
}

async function coldAward(state, exp, sp) {
    return BotLifeState.prepareResolve(state, {
        patch: {}, events: [], materialize: { exp, sp, adena: 0, items: [] },
        nextResolveAt: 1000, debug: { fights: 1, wins: 1 }
    }, { timestamp: 1, persist: false, projectClassProgression: true });
}

async function run() {
    const original = {
        experience: CharacterWriteQueue.experience,
        userInfo: ServerResponse.userInfo,
        consoleText: ServerResponse.consoleText,
        levelUp: Generics.levelUp
    };
    CharacterWriteQueue.experience = () => {};
    ServerResponse.userInfo = () => Buffer.alloc(0);
    ServerResponse.consoleText = () => Buffer.alloc(0);
    Generics.levelUp = (_session, actor, level) => actor.setLevel(level);
    const session = { dataSendToMe() {}, dataSendToOthers() {} };
    try {
        const startExp = Number(DataCache.experience[19]) + 100;
        const ordinaryHot = hotActor(20, startExp, 5);
        ExperienceReward(session, ordinaryHot, 1000, 20);
        const ordinaryCold = await coldAward(coldState(20, startExp, 5), 1000, 20);
        assert.deepStrictEqual(ordinaryCold && {
            level: ordinaryCold.level, exp: ordinaryCold.exp, sp: ordinaryCold.sp
        }, ordinaryHot.snapshot(), 'ordinary kill progression must match hot and cold paths');

        const context = OverhitReward.contextForHit({
            attacker: { characterId: 7 },
            skill: { selfId: 56, fetchSemantic: () => ({ overHit: true }) },
            targetHpBeforeHit: 20, targetMaxHp: 100, finalDamage: 30, encounterId: 9
        });
        const adjusted = OverhitReward.resolveContext(context, 1000).adjustedExp;
        const overhitHot = hotActor(20, startExp, 5);
        ExperienceReward(session, overhitHot, adjusted, 20);
        const overhitCold = await coldAward(coldState(20, startExp, 5), adjusted, 20);
        assert.deepStrictEqual({ level: overhitCold.level, exp: overhitCold.exp, sp: overhitCold.sp },
            overhitHot.snapshot(), 'Over-hit EXP and unchanged SP must match hot and cold paths');

        const cappedExp = ProgressionCap.maximumAllowedExperience();
        const cappedLevel = ProgressionCap.effectiveLevelCap();
        const cappedHot = hotActor(cappedLevel, cappedExp, 5);
        ExperienceReward(session, cappedHot, 1000, 20);
        const cappedCold = await coldAward(coldState(cappedLevel, cappedExp, 5), 1000, 20);
        assert.deepStrictEqual({ level: cappedCold.level, exp: cappedCold.exp, sp: cappedCold.sp },
            cappedHot.snapshot(), 'content-cap discard must match hot and cold paths');

        const deathHot = hotActor(20, startExp, 5);
        const hotDeath = DeathExperience.applyDeathPenalty(null, deathHot, { timestamp: 10 });
        const coldDeath = DeathExperience.applyColdDeath(coldState(20, startExp, 5), { timestamp: 10 });
        assert.strictEqual(coldDeath.result.expLost, hotDeath.expLost);
        assert.deepStrictEqual({
            level: coldDeath.state.level, exp: coldDeath.state.exp, sp: coldDeath.state.sp
        }, deathHot.snapshot(), 'death EXP delta and final level must match hot and cold paths');

        console.log('Hot/cold progression parity checks passed');
    } finally {
        CharacterWriteQueue.experience = original.experience;
        ServerResponse.userInfo = original.userInfo;
        ServerResponse.consoleText = original.consoleText;
        Generics.levelUp = original.levelUp;
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
