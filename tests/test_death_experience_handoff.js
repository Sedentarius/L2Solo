const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('../src/Global');
const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const Life = invoke('GameServer/Bot/Population/BotLifeState');
const Owner = invoke('GameServer/Bot/Population/ColdSimulationOwner');
const Death = invoke('GameServer/Progression/DeathExperience');
const dbPath = path.join(process.cwd(), 'tmp', 'test-death-experience-handoff.sqlite');
fs.rmSync(dbPath, { force: true });
options.default.Database.path = dbPath;
Database.init();
DataCache.init();

function hotActor(state) {
    return {
        level: state.level, exp: state.exp,
        fetchId: () => state.characterId,
        fetchLevel() { return this.level; }, fetchExp() { return this.exp; }, fetchSp: () => state.sp,
        setLevel(level) { this.level = level; }, setExpSp(exp) { this.exp = exp; }
    };
}

(async () => {
    const exp = DataCache.experience[19] + 100000;
    await Database.createAccount('death_handoff', 'test');
    await Database.createCharacter('death_handoff', {
        name: 'DeathHandoff', race: 0, classId: 0, maxHp: 100, maxMp: 50,
        sex: 0, face: 0, hair: 0, hairColor: 0, locX: 0, locY: 0, locZ: 0
    });
    const { id } = (await Database.fetchCharacters('death_handoff'))[0];
    await Database.updateCharacterExperience(id, 20, exp, 77);
    await Database.execute([`INSERT INTO bot_life_state
        (characterId, accountName, characterName, level, exp, activity, phase,
         hp, maxHp, mp, maxMp, statsJson, inventorySummary, updatedAt)
        VALUES (?, 'death_handoff', 'DeathHandoff', 20, ?, 'hunting', 'cold',
                100, 100, 50, 50, '{}', '{}', 1000)`, [id, exp]]);
    let state = {
        characterId: id, accountName: 'death_handoff', name: 'DeathHandoff',
        level: 20, exp, sp: 77, adena: 0, phase: 'cold', activity: 'hunting',
        loc: { locX: 0, locY: 0, locZ: 0 },
        vitals: { hp: 100, maxHp: 100, mp: 50, maxMp: 50 },
        timing: {}, party: {}, inventory: {},
        stats: { classId: 0, classProgressionLevel: 20, classProgressionClassId: 0, karma: 0, deaths: 0 },
        simulation: { ownerId: Owner.LEGACY_OWNER_ID, revision: 0 }, updatedAt: 1000
    };
    let timestamp = 2000;
    async function resolve(patch, debug = {}) {
        timestamp += 1000;
        const token = await Owner.claim(state, { timestamp, leaseMs: 5000 });
        assert(token.ok);
        const nextState = await Life.prepareResolve(state, {
            patch, events: [], materialize: { exp: 0, sp: 0, adena: 0, items: [] },
            nextResolveAt: timestamp + 1000, debug
        }, { persist: false, timestamp, projectClassProgression: true });
        const [committed] = await Owner.commitAndReleaseBatch([{ token, nextState }], { timestamp });
        assert(committed.ok);
        state = Life.cachedState(id);
        // A stale lease cannot overwrite either EXP or the death entitlement.
        const [replayed] = await Owner.commitAndReleaseBatch([{ token, nextState }], { timestamp });
        assert.strictEqual(replayed.ok, false);
        return Database.fetchCharacterDeathExperience(id);
    }
    async function die() {
        return resolve({ activity: 'dead', deathCount: state.stats.deaths + 1,
            vitals: { ...state.vitals, hp: 0 } }, { died: true, fights: 1, wins: 0 });
    }
    let death = await die();
    assert.strictEqual(death.pendingRestoration, 1, 'worker commit must durably store restoration');
    assert.strictEqual(death.expAfterDeath, state.exp);
    assert.strictEqual(death.deathSequence, 1);
    const corpse = hotActor(state);
    await Death.load(corpse);
    assert.strictEqual(corpse.deathExperience.pendingRestoration, true);
    assert.strictEqual(typeof corpse.deathExperience.deathContext, 'object');
    const restoration = Death.restoreFromResurrection(null, corpse, { restoreExpPercent: 100 });
    await restoration.persistence;
    assert.strictEqual(corpse.exp, exp, 'cold death must be recoverable after hot activation');
    assert.strictEqual((await Database.fetchCharacterDeathExperience(id)).pendingRestoration, 0);
    // Model the hot snapshot returned to cold, including the consumed record.
    state = { ...state, exp: corpse.exp, level: corpse.level, activity: 'resting',
        vitals: { ...state.vitals, hp: 100 },
        stats: { ...state.stats, deathExperience: { ...corpse.deathExperience } } };
    await resolve({ activity: 'hunting' });
    death = await die();
    assert.strictEqual(death.deathSequence, 2, 'a new death after hot resurrection must remain eligible');
    const beforeRestore = state.exp;
    death = await resolve({ activity: 'resting', restoreExpPercent: 40,
        vitals: { ...state.vitals, hp: 1 } });
    assert.strictEqual(death.pendingRestoration, 0, 'cold resurrection must consume durable restoration');
    assert.strictEqual(death.resolutionReason, 'resurrection');
    assert.strictEqual(state.exp, beforeRestore + Math.round(death.expLost * 0.4));
    const afterColdResurrection = hotActor(state);
    await Death.load(afterColdResurrection);
    assert.strictEqual(Death.restoreFromResurrection(null, afterColdResurrection,
        { restoreExpPercent: 100 }).eligible, false, 'hot activation cannot restore the same death twice');
    death = await die();
    assert.strictEqual(death.deathSequence, 3);
    const beforeTown = state.exp;
    death = await resolve({ activity: 'resting', clearDeathExperience: 'restart_to_town',
        vitals: { ...state.vitals, hp: 100 } });
    assert.strictEqual(death.pendingRestoration, 0);
    assert.strictEqual(death.resolutionReason, 'restart_to_town');
    assert.strictEqual(state.exp, beforeTown, 'town recovery must not restore EXP');
    const [character] = await Database.execute(['SELECT exp, sp FROM characters WHERE id = ?', [id]]);
    assert.strictEqual(character.exp, state.exp);
    assert.strictEqual(character.sp, state.sp);
    // Loading a persisted corpse must not overwrite a newer local transition.
    const racing = hotActor(state);
    const loaded = Death.load(racing);
    const newer = { pendingRestoration: false, resolutionReason: 'newer_transition' };
    racing.deathExperience = newer;
    await loaded;
    assert.strictEqual(racing.deathExperience, newer);
    const novice = { level: 4, exp: DataCache.experience[3] + 100,
        stats: { coldCombat: { skills: [{ selfId: 194, level: 1 }] } } };
    assert.strictEqual(Death.applyColdDeath(novice).result.expLost, 0, 'cold Lucky must protect novice EXP');
    assert.strictEqual(Death.calculateLoss({ ...novice, skills: [{ selfId: 194 }] }).expLost, 0);
    assert(Death.calculateLoss({ ...novice, stats: {} }).expLost > 0, 'protection still requires Lucky');
    assert(Death.calculateLoss({ ...novice, level: 5 }).expLost > 0, 'Lucky stops protecting after level 4');
    // Upgrade a database that ran the original PR's migration 40 before main's
    // cooldown migration. Both features must survive the shared version number.
    await Database.close();
    const { DatabaseSync } = require('node:sqlite');
    const oldBranchDb = new DatabaseSync(dbPath);
    oldBranchDb.exec('DELETE FROM schema_migrations WHERE version = 41; ALTER TABLE characters DROP COLUMN skillCooldowns;');
    oldBranchDb.close();
    Database.init();
    const columns = await Database.execute(['PRAGMA table_info(characters)', []]);
    assert(columns.some(column => column.name === 'skillCooldowns'));
    assert.strictEqual((await Database.fetchCharacterDeathExperience(id)).resolutionReason, 'restart_to_town');
    const versions = await Database.execute(['SELECT version FROM schema_migrations WHERE version IN (40, 41) ORDER BY version', []]);
    assert.deepStrictEqual(versions.map(row => row.version), [40, 41]);
    console.log('Death EXP worker commits, rejected replays, hot/cold restoration, town recovery and Lucky passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => Database.close());
