const assert = require('assert');

require('../src/Global');

const Attack = invoke('GameServer/Actor/Attack');
const Formulas = invoke('GameServer/Formulas');

function fixture({ kind = 'Weapon.Bow', mp = 10, cost = 4, distance = 100, soulshotLoaded = false } = {}) {
    let currentMp = mp;
    const timers = [];
    const packets = [];
    let approaches = 0;
    let soulshotsConsumed = 0;
    const actor = {
        effects: {},
        soulshotLoaded,
        fetchId: () => 2000100,
        fetchLocX: () => 0,
        fetchLocY: () => 0,
        fetchLocZ: () => 0,
        fetchHead: () => 0,
        fetchRadius: () => 10,
        fetchCollectiveAtkSpd: () => 333,
        fetchCollectivePAtk: () => 100,
        fetchCollectiveCritical: () => 0,
        fetchMp: () => currentMp,
        setMp: (value) => { currentMp = value; },
        statusUpdateVitals() {},
        state: {
            hits: false,
            setHits(value) { this.hits = value; },
            fetchDead: () => false,
            setCombats() {}
        },
        automation: {
            scheduleAction() { approaches += 1; },
            abortAll() {}
        },
        backpack: {
            fetchTotalWeaponKind: () => kind,
            fetchEquippedWeapon: () => ({ fetchConsumedMp: () => cost, fetchRank: () => 'none' }),
            fetchTotalWeaponPAtkRnd: () => 0,
            fetchAutoShot: () => null,
            isAutoShotEnabled: () => false,
            consumeSoulshot() { soulshotsConsumed += 1; }
        }
    };
    const target = {
        effects: {},
        state: { fetchDead: () => false },
        fetchId: () => 1000100,
        fetchLocX: () => distance,
        fetchLocY: () => 0,
        fetchLocZ: () => 0,
        fetchRadius: () => 10,
        fetchCollectivePDef: () => 100,
        fetchDex: () => 30,
        fetchHead: () => 0,
        fetchKind: () => 'Monster',
        isDead: () => false
    };
    const session = {
        actor,
        dataSendToMe(packet) { packets.push(packet); },
        dataSendToOthers() {},
        dataSendToMeAndOthers(packet) { packets.push(packet); }
    };
    actor.session = session;
    const attack = new Attack();
    actor.attack = attack;
    attack.resolveMeleeTargets = () => [target];
    attack.prepareMeleeHit = (_actor, _target, landed) => ({ damage: landed ? 10 : 0, flags: landed ? 0 : 1 });
    attack.queueTimer = (callback) => { timers.push(callback); };
    attack.checkParticipants = () => false;
    attack.blockedPvpDefense = () => false;
    attack.recordPlayerAggression = () => {};
    return {
        actor, target, session, attack, timers, packets,
        mp: () => currentMp,
        approaches: () => approaches,
        soulshotsConsumed: () => soulshotsConsumed
    };
}

const originalHitChance = Formulas.calcHitChance;
try {
    Formulas.calcHitChance = () => false;

    const bow = fixture();
    bow.attack.meleeHit(bow.session, bow.target);
    assert.strictEqual(bow.mp(), 6, 'a launched bow shot must consume the authored weapon MP once');
    assert.strictEqual(bow.timers.length, 2);
    bow.timers.shift()();
    assert.strictEqual(bow.mp(), 6, 'a miss must not refund or consume bow MP again at impact');
    bow.timers.shift()();
    assert.strictEqual(bow.mp(), 2, 'autoattack must consume once for the next launched arrow');

    const insufficient = fixture({ mp: 3, soulshotLoaded: true });
    insufficient.attack.meleeHit(insufficient.session, insufficient.target);
    assert.strictEqual(insufficient.mp(), 3);
    assert.strictEqual(insufficient.timers.length, 0, 'insufficient MP must not schedule hit or retry timers');
    assert.strictEqual(insufficient.actor.state.hits, false);
    assert.strictEqual(insufficient.actor.soulshotLoaded, true, 'a rejected shot must not consume a loaded Soulshot');
    assert.strictEqual(insufficient.soulshotsConsumed(), 0);

    const approaching = fixture({ distance: 2000 });
    approaching.attack.meleeHit(approaching.session, approaching.target);
    assert.strictEqual(approaching.mp(), 10, 'approach must not consume bow MP before launch');
    assert.strictEqual(approaching.approaches(), 1);

    const melee = fixture({ kind: 'Weapon.Sword' });
    melee.attack.meleeHit(melee.session, melee.target);
    assert.strictEqual(melee.mp(), 10, 'melee normal attacks must not consume weapon MP');

    console.log('Normal bow attack MP checks passed');
} finally {
    Formulas.calcHitChance = originalHitChance;
}
