const assert = require('assert');
require('../src/Global');
const DataCache = invoke('GameServer/DataCache');
DataCache.init();
const Cold = invoke('GameServer/Bot/Population/ColdCombatProfile');
const Resolver = invoke('GameServer/Bot/Population/BackgroundResolver');
const originalNpc = Cold.npcForSpot;
const state = {
    characterId: 901, name: 'SlowFighter', level: 12, activity: 'hunting',
    vitals: { hp: 500, maxHp: 500, mp: 200, maxMp: 200 },
    stats: { classId: 0, karma: 240, coldCombat: {
        version: 1, classId: 0,
        base: { str: 40, dex: 30, con: 43, int: 21, wit: 11, men: 25 },
        equipment: { weaponKind: 'Weapon.Sword', pAtk: 80, pAtkRnd: 0, mAtk: 40,
            atkSpd: 379, critical: 0, accur: 100, pDef: 120, mDef: 50, evasion: 0,
            bonusMp: 0, shieldPDef: 0 },
        skills: [], effects: []
    } }
};
const spot = { id: 'budget', name: 'Budget field', minLevel: 12, maxLevel: 12,
    avgLevel: 12, density: 30, rewards: { exp: 1000, sp: 10, adenaMin: 1, adenaMax: 1 } };
try {
    Cold.npcForSpot = () => ({ level: 12, maxHp: 1200, pAtk: 1, pAtkRnd: 0,
        pDef: 200, mDef: 100, accur: 1, evasion: 0, critical: 0, atkSpd: 253 });
    const run = elapsedMs => Resolver.resolveSolo({ state: structuredClone(state), spot,
        elapsedMs, timestamp: 1750000000000, rng: () => 0.5 });
    const short = run(12000);
    assert.strictEqual(short.debug.wins, 0, 'this opponent must require more than twelve seconds');
    const full = run(60000);
    assert(full.debug.wins > 0, 'available cycle time must allow a slow fighter to finish its kill');
    assert(full.materialize.exp > 0, 'only a completed kill should award experience for karma washing');
    assert(full.debug.fights < 5, 'the same time must not also buy five fresh fights');
    assert(full.debug.combatActions <= 5 * 48, 'the previous cycle action budget must remain bounded');
    Cold.npcForSpot = () => ({ level: 12, maxHp: 1e9, pAtk: 1, pAtkRnd: 0,
        pDef: 200, mDef: 100, accur: 1, evasion: 0, critical: 0, atkSpd: 253 });
    const unkillable = run(60000);
    assert.strictEqual(unkillable.debug.wins, 0);
    assert.strictEqual(unkillable.debug.fights, 0, 'a pending fight is not a completed encounter');
    assert.strictEqual(unkillable.debug.attemptedFights, 1, 'a timeout must consume the cycle instead of resetting the mob five times');
    assert(unkillable.patch.stats.pveEncounter, 'unfinished damage must persist');
    assert.strictEqual(unkillable.materialize.exp, 0);
} finally {
    Cold.npcForSpot = originalNpc;
}
console.log('Cold solo combat time budget checks passed');
