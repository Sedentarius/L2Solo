const assert = require('assert');
const fs = require('fs');
const path = require('path');

require('../src/Global');

const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const DeathExperience = invoke('GameServer/Progression/DeathExperience');
const databasePath = path.join(process.cwd(), 'tmp', 'test-death-experience.sqlite');

fs.rmSync(databasePath, { force: true });
options.default.Database.path = path.relative(process.cwd(), databasePath);
Database.init();
DataCache.init();

function actorAt(id, level, exp, skills = []) {
    let currentLevel = level;
    let currentExp = exp;
    let currentSp = 77;
    return {
        characterId: id,
        skillset: { fetchSkills: () => skills },
        fetchId: () => id,
        fetchLevel: () => currentLevel,
        fetchExp: () => currentExp,
        fetchSp: () => currentSp,
        setLevel: (value) => { currentLevel = value; },
        setExpSp: (nextExp, nextSp) => { currentExp = nextExp; currentSp = nextSp; },
        snapshot: () => ({ level: currentLevel, exp: currentExp, sp: currentSp })
    };
}

async function run() {
    const level = 20;
    const start = Number(DataCache.experience[level - 1]);
    const interval = Number(DataCache.experience[level]) - start;
    const exp = start + Math.floor(interval / 2);
    const expectedLoss = Math.round(interval * (6.5 - 0.07 * level) / 100);
    const ordinary = DeathExperience.calculateLoss(actorAt(1, level, exp));
    assert.strictEqual(ordinary.expLost, expectedLoss);
    assert.strictEqual(ordinary.expAfterDeath, exp - expectedLoss);
    assert.strictEqual(DeathExperience.calculateLoss(actorAt(1, level, exp), { clanWar: true }).expLost,
        Math.round(interval * ((6.5 - 0.07 * level) / 4) / 100));
    assert.strictEqual(DeathExperience.calculateLoss(actorAt(1, level, exp), { arena: true }).expLost, 0);
    assert.strictEqual(DeathExperience.calculateLoss(actorAt(1, 4, 100, [{ selfId: 194 }])).expLost, 0);

    const boundaryActor = actorAt(0, 20, start + 1);
    const boundaryDeath = DeathExperience.applyDeathPenalty(null, boundaryActor, { timestamp: 10 });
    assert.strictEqual(boundaryActor.snapshot().level, 19, 'death loss must resolve a downward level transition');
    const duplicate = DeathExperience.applyDeathPenalty(null, boundaryActor, { timestamp: 11 });
    assert.strictEqual(duplicate.duplicate, true);
    assert.strictEqual(boundaryActor.snapshot().exp, boundaryDeath.expAfterDeath);

    for (const percent of [40, 55, 100]) {
        const subject = actorAt(0, level, ordinary.expAfterDeath);
        subject.deathExperience = {
            expBeforeDeath: exp,
            expLost: expectedLoss,
            expAfterDeath: ordinary.expAfterDeath,
            pendingRestoration: true
        };
        const restored = DeathExperience.restoreFromResurrection(null, subject, { restoreExpPercent: percent });
        assert.strictEqual(restored.restoredExp, Math.round(expectedLoss * percent / 100));
        assert.strictEqual(DeathExperience.restoreFromResurrection(null, subject, { restoreExpPercent: percent }).eligible, false,
            'a death entitlement must be consumed once');
    }

    const cold = DeathExperience.applyColdDeath({ level, exp, stats: {} }, { timestamp: 20 });
    assert.strictEqual(cold.result.expLost, expectedLoss);
    assert.strictEqual(cold.state.exp, ordinary.expAfterDeath);
    const coldDuplicate = DeathExperience.applyColdDeath(cold.state, { timestamp: 21 });
    assert.strictEqual(coldDuplicate.result.duplicate, true);
    const coldRestored = DeathExperience.restoreCold(cold.state, { restoreExpPercent: 40 });
    assert.strictEqual(coldRestored.result.restoredExp, Math.round(expectedLoss * 0.4));
    assert.strictEqual(DeathExperience.restoreCold(coldRestored.state, { restoreExpPercent: 40 }).result.eligible, false);

    await Database.createAccount('death_exp', 'secret');
    await Database.createCharacter('death_exp', {
        name: 'DeathExp', race: 0, classId: 0, maxHp: 100, maxMp: 100,
        sex: 0, face: 0, hair: 0, hairColor: 0, locX: 0, locY: 0, locZ: 0
    });
    const character = (await Database.fetchCharacters('death_exp'))[0];
    const id = Number(character.id);
    await Database.updateCharacterExperience(id, level, exp, 77);
    const persistentActor = actorAt(id, level, exp);
    const applied = DeathExperience.applyDeathPenalty(null, persistentActor, { timestamp: 100 });
    await applied.persistence;
    let [storedCharacter] = await Database.execute(['SELECT level, exp FROM characters WHERE id = ?', [id]]);
    let storedDeath = await Database.fetchCharacterDeathExperience(id);
    assert.strictEqual(Number(storedCharacter.exp), ordinary.expAfterDeath, 'death EXP must persist immediately');
    assert.strictEqual(Number(storedDeath.pendingRestoration), 1);

    persistentActor.deathExperience = null;
    const afterRestart = DeathExperience.restoreFromResurrection(null, persistentActor, { restoreExpPercent: 40, timestamp: 200 });
    const persistedRestore = await afterRestart.persistence;
    assert.strictEqual(persistedRestore.restoredExp, Math.round(expectedLoss * 0.4));
    storedDeath = await Database.fetchCharacterDeathExperience(id);
    assert.strictEqual(Number(storedDeath.pendingRestoration), 0);
    assert.strictEqual(await Database.restoreCharacterDeathExperience(id, 40), null,
        'persistent restoration must not be reusable');

    await Database.updateCharacterExperience(id, level, exp, 77);
    persistentActor.deathExperience = null;
    persistentActor.setExpSp(exp, 77);
    persistentActor.setLevel(level);
    await DeathExperience.applyDeathPenalty(null, persistentActor, { timestamp: 300 }).persistence;
    await DeathExperience.clearPendingRestoration(persistentActor, 'restart_to_town', 301);
    storedDeath = await Database.fetchCharacterDeathExperience(id);
    assert.strictEqual(storedDeath.resolutionReason, 'restart_to_town');
    assert.strictEqual(Number(storedDeath.pendingRestoration), 0);

    console.log('C4 death and resurrection experience checks passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => Database.close());
