const assert = require('assert');
require('../src/Global');
const fixture = require('./fixtures/c4_toggle_skills.json');
const ActorModel = invoke('GameServer/Model/Actor');
const Actor = invoke('GameServer/Actor/Actor');
const Skill = invoke('GameServer/Model/Skill');
const Attack = invoke('GameServer/Actor/Attack');
const Automation = invoke('GameServer/Automation');
const Store = invoke('GameServer/Effects/EffectStore');
const Stats = invoke('GameServer/Effects/EffectStats');
const Restrictions = invoke('GameServer/Effects/EffectRestrictions');
const Toggle = invoke('GameServer/Skills/ToggleSkills');
const request = invoke('GameServer/Actor/Generics/SkillRequest');
const calculate = invoke('GameServer/Actor/Generics/CalculateStats');
const Formulas = invoke('GameServer/Formulas');
const Mastery = invoke('GameServer/Skills/SkillMastery');

// A deterministic clock runs the actual EffectTicker callbacks. Cleared
// intervals cannot fire, and advancing time also detects leaked MP/HP drains.
let now = 0;
const timers = new Set();
const originalInterval = global.setInterval;
const originalClear = global.clearInterval;
global.setInterval = (fn, ms) => {
    const timer = { fn, ms, due: now + ms, unref() {} };
    timers.add(timer);
    return timer;
};
global.clearInterval = timer => timers.delete(timer);
function advance(ms) {
    const end = now + ms;
    for (;;) {
        const next = [...timers].filter(t => t.due <= end).sort((a, b) => a.due - b.due)[0];
        if (!next) break;
        now = next.due;
        next.due += next.ms;
        next.fn();
    }
    now = end;
}
function close(a) {
    invoke('GameServer/Effects/EffectTicker').clearAll(a);
    a.automation.stopReplenish();
}
function near(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-7, `${message}: got ${actual}, expected ${expected}`);
}
function at(value, level) { return Array.isArray(value) ? value[level - 1] : value; }
function makeSkill(id, level = 1) {
    const row = fixture.skills.find(s => s.id === id);
    return new Skill({ selfId: id, level, name: row?.name || 'Test', passive: false,
        spell: false, mp: 0, hp: 0, power: 1, distance: -1, reuse: 1000 });
}
function actor(level = 76) {
    const a = new ActorModel({ id: 2000001, name: 'ToggleAudit', level, classId: 49,
        hp: 100, mp: 100, con: 30, men: 30, str: 30, dex: 30, int: 30, wit: 30,
        pAtk: 10, mAtk: 10, pDef: 10, mDef: 10, atkSpd: 300, castSpd: 333,
        walk: 80, run: 120, critical: 40, locX: 0, locY: 0, locZ: 0, head: 0 });
    a.skills = [];
    a.skillset = { fetchSkill: id => a.skills.find(s => s.fetchSelfId() === id), fetchSkills: () => a.skills };
    a.effects = {};
    a.weaponKind = 'Weapon.Pole';
    a.shield = true;
    a.backpack = {
        fetchTotalArmorBonusMp: () => 0, fetchTotalLoad: () => 0,
        fetchTotalWeaponPAtk: () => 100, fetchTotalWeaponMAtk: () => 50,
        fetchTotalArmorPDef: () => 100, fetchTotalArmorMDef: () => 80,
        fetchTotalWeaponAccur: () => 5, fetchTotalArmorEvasion: () => 2,
        fetchTotalWeaponCritical: () => 40, fetchTotalWeaponAtkSpd: () => 300,
        fetchTotalWeaponKind: () => a.weaponKind,
        fetchTotalWeaponPAtkRnd: () => 0,
        fetchTotalShieldPDef: () => a.shield ? 100 : 0,
        fetchTotalShieldRate: () => a.shield ? 20 : 0,
        fetchEquippedArmors: () => a.shield ? [{ fetchKind: () => 'Armor.Shield' }] : []
    };
    a.isDead = () => a.state.fetchDead();
    a.attack = new Attack();
    a.automation = new Automation();
    a.automation.setRevHp(5);
    a.automation.setRevMp(2);
    a.skillReuseUntil = new Map();
    a.markSkillReuse = Actor.prototype.markSkillReuse;
    a.statusUpdateVitals = () => calculate({}, a);
    a.statusUpdateVitals();
    a.setHp(a.fetchMaxHp() / 2);
    a.setMp(a.fetchMaxMp());
    const packets = [];
    a.castSession = { actor: a, packets, dataSendToMe: p => packets.push(p), dataSendToMeAndOthers: p => packets.push(p) };
    return a;
}
function use(a, skill) {
    if (!a.skills.includes(skill)) a.skills.push(skill);
    request(a.castSession, a, { selfId: skill.fetchSelfId() });
}
function lastIconIds(a) {
    const packet = a.castSession.packets.filter(p => p[0] === 0x7f).at(-1);
    assert(packet, 'Request sends effect icons');
    return Array.from({ length: packet.readUInt16LE(1) }, (_, i) => packet.readUInt32LE(3 + i * 10));
}
const sourceStats = {
    'pAtk-undead': 'pAtkUndeadMul', darkVuln: 'darkVuln', runSpd: 'runSpdMul',
    pAtkSpd: 'pAtkSpdMul', regHp: 'regHpAdd', accCombat: 'pAccuracyCombatAdd',
    rShld: 'rShldMul', cAtkAdd: 'pCritDamageAdd', skillMastery: 'skillMasteryMul',
    paralyzeVuln: 'paralyzeVuln', stunVuln: 'stunVuln', mAtkSpd: 'castSpdMul',
    MagicalMpConsumeRate: 'magicalMpConsumeMul', mReuse: 'mReuseMul',
    reflectDam: 'reflectDam', reflectSkillPhysic: 'reflectSkillPhysic', reflectSkillMagic: 'reflectSkillMagic',
    transDam: 'transDam'
};
function statKey(s) { return s.op === 'div' ? `${s.stat}Div` : sourceStats[s.stat] || `${s.stat}${s.op === 'mul' ? 'Mul' : 'Add'}`; }
function checkStats(a, row, level, active) {
    for (const stat of row.stats) {
        const key = statKey(stat);
        const multiplicative = stat.op === 'mul' || stat.op === 'div';
        const expected = active ? at(stat.value, level) * (stat.op === 'sub' ? -1 : 1) : multiplicative ? 1 : 0;
        near(multiplicative ? Stats.multiplier(a, key) : Stats.add(a, key), expected, `${row.name} ${key} active=${active}`);
    }
    if ([221, 296].includes(row.id)) assert.strictEqual(a.silentMoving === true, active, row.name);
    if (row.id === 60) {
        assert.strictEqual(a.fakeDeath === true, active, 'Fake Death state');
        assert.strictEqual(Restrictions.canMove(a), !active, 'Fake Death movement');
        assert.strictEqual(Restrictions.canAttack(a), !active, 'Fake Death attack');
    }
}
function expectedDrain(row, skillLevel, charLevel) {
    const base = at(row.consume, skillLevel);
    return row.effect === 'MpConsumePerLevel' ? (charLevel - 1) / 7.5 * base * row.periodSeconds : base;
}
try {
    let count = 0;
    for (const row of fixture.skills) {
        for (let level = 1; level <= row.levels; level++) {
            for (const charLevel of [40, 76]) {
                const a = actor(charLevel);
                if (row.id === 222) a.weaponKind = 'Weapon.DualFist';
                const skill = makeSkill(row.id, level);
                const mp = a.fetchMp(), hp = a.fetchHp();
                use(a, skill);
                assert(Toggle.isActive(a, skill), `${row.name} ${level} activates`);
                assert(lastIconIds(a).includes(row.id), `${row.name} sends active icon to client`);
                near(a.fetchMp(), mp - at(row.initialMp, level), `${row.name} activation MP`);
                checkStats(a, row, level, true);
                const drain = expectedDrain(row, level, charLevel);
                const period = (row.periodSeconds || 3) * 1000;
                advance(period * 2);
                near(a.fetchMp(), mp - at(row.initialMp, level) - (row.effect === 'DamOverTime' ? 0 : drain * 2), `${row.name} two MP ticks`);
                near(a.fetchHp(), hp - (row.effect === 'DamOverTime' ? drain * 2 : 0), `${row.name} two HP ticks`);
                // OFF must remain available even when the current state blocks casting.
                Store.apply(a, { id: 9999, key: 'audit_stun', type: 'debuff', category: 'stun' });
                assert(!Restrictions.canCast(a), 'OFF test actually blocks ordinary casts');
                use(a, skill);
                Store.remove(a, 'audit_stun');
                assert(!Toggle.isActive(a, skill), `${row.name} switches off`);
                assert(!lastIconIds(a).includes(row.id), `${row.name} removes client icon on OFF`);
                checkStats(a, row, level, false);
                assert(!Store.packetEffects(a).some(e => e.id === row.id), `${row.name} icon removed`);
                const after = [a.fetchHp(), a.fetchMp()];
                advance(period * 3);
                assert.deepStrictEqual([a.fetchHp(), a.fetchMp()], after, `${row.name} no drain after OFF`);
                assert.strictEqual(Object.keys(a.effectTimers || {}).length, 0, `${row.name} timer removed`);
                close(a);
                count++;
            }
        }
        const a = actor();
        if (row.id === 222) a.weaponKind = 'Weapon.DualFist';
        const skill = makeSkill(row.id, row.levels);
        if (at(row.initialMp, row.levels) > 0) {
            a.setMp(at(row.initialMp, row.levels) - 0.1);
            const mp = a.fetchMp();
            use(a, skill);
            assert(!Toggle.isActive(a, skill), `${row.name} rejects insufficient activation MP`);
            near(a.fetchMp(), mp, 'rejection preserves MP');
        }
        a.setMp(a.fetchMaxMp());
        use(a, skill);
        const drain = expectedDrain(row, row.levels, 76);
        if (drain > 0) {
            if (row.effect === 'DamOverTime') a.setHp(drain + 1);
            else a.setMp(drain - 0.01);
            advance(row.periodSeconds * 1000);
            assert(!Toggle.isActive(a, skill), `${row.name} auto-stops when upkeep cannot be paid`);
            checkStats(a, row, row.levels, false);
        }
        close(a);
        console.log(`${row.id} ${row.name}: levels 1-${row.levels}, ON/ticks/OFF/upkeep checked`);
    }

    // Gameplay consumers, not merely presence of effect metadata.
    const a = actor(), attack = a.attack;
    for (const id of [1001, 1283, 288, 222, 256, 339, 340, 336, 337, 338, 7029]) {
        if (id === 222) a.weaponKind = 'Weapon.DualFist';
        const skill = makeSkill(id);
        const read = () => [a.fetchCollectivePAtk(), a.fetchCollectivePDef(), a.fetchCollectiveMDef(),
            a.fetchCollectiveAccur(), a.fetchCollectiveAtkSpd(), a.fetchCollectiveRunSpd(),
            a.fetchCollectiveCastSpd(), a.fetchCollectiveMAtk()];
        a.statusUpdateVitals();
        const base = read();
        use(a, skill);
        assert.notDeepStrictEqual(read(), base, `${skill.fetchName()} affects calculated character stats`);
        use(a, skill);
        assert.deepStrictEqual(read(), base, `${skill.fetchName()} restores calculated stats`);
    }
    const relax = makeSkill(226);
    a.state.setSeated(true);
    const restingRegen = a.automation.fetchRevHpAmount(a);
    a.state.setSeated(false);
    use(a, relax);
    assert(a.state.fetchSeated(), 'Relax sits the player');
    near(a.automation.fetchRevHpAmount(a), restingRegen + 7.5, 'Relax adds 5 HP regen with sitting multiplier');
    const hp = a.fetchHp();
    a.canReplenishVitals = () => true;
    a.automation.replenishVitalsTick(a);
    near(a.fetchHp() - hp, restingRegen + 7.5, 'Relax affects real HP regeneration tick');
    use(a, relax);
    near(a.automation.fetchRevHpAmount(a), restingRegen, 'Relax bonus removed while player remains seated');
    for (const id of [226, 296]) {
        a.state.setSeated(false);
        const skill = makeSkill(id);
        use(a, skill);
        a.state.setSeated(false);
        advance(3000);
        assert(!Toggle.isActive(a, skill), `${skill.fetchName()} stops after standing`);
    }
    use(a, relax);
    a.setHp(a.fetchMaxHp());
    advance(2000);
    assert(!Toggle.isActive(a, relax), 'Relax stops at full HP');
    use(a, relax);
    assert(!Toggle.isActive(a, relax), 'Relax cannot start at full HP');
    close(a);

    const b = actor();
    const enemy = actor();
    enemy.model.id = 2000002;
    enemy.model.locX = -100;
    const parry = makeSkill(339);
    const beforeParry = [b.fetchCollectivePDef(), b.fetchCollectiveMDef(), b.fetchCollectiveAtkSpd(), b.fetchCollectiveRunSpd(), b.fetchCollectiveAccur()];
    use(b, parry);
    assert.deepStrictEqual([b.fetchCollectivePDef(), b.fetchCollectiveMDef(), b.fetchCollectiveAtkSpd(), b.fetchCollectiveRunSpd(), b.fetchCollectiveAccur()],
        [Math.round(beforeParry[0] * 1.25), Math.round(Formulas.calcMDef(76, 30, 80) * 1.25), Math.round(beforeParry[2] * 0.8), Math.round(beforeParry[3] * 0.9), beforeParry[4] - 4], 'Parry applies both defenses and all three penalties');
    use(b, parry);

    const C4Effects = invoke('GameServer/Skills/C4SkillEffects');
    const C4Rules = invoke('GameServer/Skills/C4SkillRules');
    const fortitude = makeSkill(335);
    const originalChance = Formulas.calcSkillEffectSuccessRate;
    let resistModifier;
    Formulas.calcSkillEffectSuccessRate = function (params) {
        resistModifier = params.resistModifier;
        return originalChance.call(this, params);
    };
    try {
        for (const trait of ['shock', 'paralyze']) {
            // No effect payload is needed to test the real landing calculation.
            const hostile = makeSkill(9998);
            hostile.semantic = { skillType: C4Rules.EFFECT, target: 'enemy', effectType: 'debuff', trait,
                baseLandRate: 50, magicLevel: 76, levelDepend: 1 };
            const roll = () => C4Effects.execute(enemy.castSession, enemy, b, hostile, { magicSkill: false, rng: () => 0.99 });
            roll();
            near(resistModifier, 1, `${trait} base resistance`);
            use(b, fortitude);
            roll();
            near(resistModifier, 0.7, `Fortitude changes actual ${trait} land-rate calculation`);
            use(b, fortitude);
            roll();
            near(resistModifier, 1, `Fortitude OFF restores ${trait} land rate`);
        }
    } finally { Formulas.calcSkillEffectSuccessRate = originalChance; }

    const spell = new Skill({ selfId: 9997, name: 'Test magic', spell: true, passive: false, mp: 100, reuse: 10000 });
    for (const [id, cost] of [[336, 70], [337, 110], [338, 110]]) {
        const skill = makeSkill(id);
        use(b, skill);
        near(b.attack.skillMpCost(b, spell), cost, `${skill.fetchName()} changes casting MP cost`);
        use(b, skill);
        near(b.attack.skillMpCost(b, spell), 100, `${skill.fetchName()} OFF restores casting MP cost`);
    }
    const aegis = makeSkill(318);
    assert(!b.attack.isShieldFacing(b, enemy), 'Attacker starts behind shield');
    use(b, aegis);
    assert(b.attack.isShieldFacing(b, enemy), 'Aegis blocks from behind');
    use(b, aegis);
    assert(!b.attack.isShieldFacing(b, enemy), 'Aegis OFF restores normal shield arc');

    const focusAttack = makeSkill(317);
    b.weaponKind = 'Weapon.Pole';
    let queriedArea = false;
    b.attack.fetchSkillTargetsInRadius = () => { queriedArea = true; return []; };
    b.attack.resolveMeleeTargets(b, enemy);
    assert(queriedArea, 'Polearm normally queries splash targets');
    use(b, focusAttack);
    queriedArea = false;
    assert.deepStrictEqual(b.attack.resolveMeleeTargets(b, enemy), [enemy]);
    assert(!queriedArea, 'Focus Attack suppresses actual polearm splash selection');
    use(b, focusAttack);
    b.attack.resolveMeleeTargets(b, enemy);
    assert(queriedArea, 'Focus Attack OFF restores splash selection');

    const transfer = makeSkill(1262, 5);
    const transferDamage = invoke('GameServer/Actor/Generics/ReceivedHit').applyTransferPain;
    b.summon = { hp: 500, fetchHp() { return this.hp; }, setHp(v) { this.hp = v; } };
    use(b, transfer);
    near(transferDamage(enemy.castSession, b, 100), 50, 'Transfer Pain reduces incoming damage');
    near(b.summon.hp, 450, 'Transfer Pain damages the summon');
    use(b, transfer);
    near(transferDamage(enemy.castSession, b, 100), 100, 'Transfer Pain OFF restores incoming damage');
    near(b.summon.hp, 450, 'Transfer Pain OFF stops summon damage');
    use(b, transfer);
    b.summon.hp = 10;
    near(transferDamage(enemy.castSession, b, 100), 91, 'Transfer cannot kill a low-HP servitor');
    near(b.summon.hp, 1, 'Transfer leaves servitor alive');
    b.summon.hp = 500;
    b.summon.fetchLocX = () => 4001;
    near(transferDamage(enemy.castSession, b, 100), 100, 'Transfer stops outside C4 forget range');
    near(b.summon.hp, 500, 'Distant summon takes no transferred damage');
    use(b, transfer);

    const riposte = makeSkill(340);
    for (const magicSkill of [false, true]) {
        const hostile = makeSkill(9998);
        hostile.semantic = { skillType: C4Rules.EFFECT, target: 'enemy', effectType: 'debuff', trait: 'root', baseLandRate: 100 };
        const cast = () => C4Effects.execute(enemy.castSession, enemy, b, hostile, { magicSkill, rng: () => 0 });
        assert(!cast().reflected);
        use(b, riposte);
        assert(cast().reflected, 'Riposte reflects incoming skill effects');
        use(b, riposte);
        assert(!cast().reflected, 'Riposte OFF stops skill reflection');
    }

    const mastery = makeSkill(334);
    const passive = new Skill({ selfId: 331, level: 1, name: 'Skill Mastery', passive: true });
    b.skills.push(passive);
    const baseChance = 2 * Formulas.calcBaseMod.INT(30);
    const roll = () => Math.ceil(baseChance) / 100;
    assert(!Mastery.succeeds(b, spell, roll), 'Chosen roll fails without Focus Skill Mastery');
    use(b, mastery);
    assert(Mastery.succeeds(b, spell, roll), 'Focus doubles learned mastery chance');
    const originalRandom = Math.random;
    try {
        Math.random = roll;
        b.markSkillReuse(spell, 1000);
        assert.strictEqual(b.skillReuseUntil.get(9997), 1100, 'Mastery reaches native reuse calculation');
        use(b, mastery);
        b.markSkillReuse(spell, 1000);
        assert(b.skillReuseUntil.get(9997) > 1100, 'Focus OFF restores ordinary reuse for same roll');
    } finally { Math.random = originalRandom; }
    b.skills = b.skills.filter(s => s !== passive);
    use(b, mastery);
    assert(!Mastery.succeeds(b, spell, () => 0), 'Focus cannot create mastery without learned passive');
    use(b, mastery);

    const superHaste = makeSkill(7029, 4);
    use(b, superHaste);
    b.markSkillReuse(spell, 1000);
    near(b.skillReuseUntil.get(9997) - 1000, Math.round(10000 / 30 * 333 / b.fetchCollectiveCastSpd()), 'Super Haste applies sourced reuse division in whole milliseconds');
    use(b, superHaste);
    b.markSkillReuse(spell, 1000);
    near(b.skillReuseUntil.get(9997) - 1000, Math.round(10000 * 333 / b.fetchCollectiveCastSpd()), 'Super Haste OFF restores reuse in whole milliseconds');

    const shieldBase = b.attack.fetchShieldPDef(b);
    const fortress = makeSkill(322, 6);
    use(b, fortress);
    near(b.attack.fetchShieldPDef(b), shieldBase + 560, 'Shield Fortress feeds real block defense');
    use(b, fortress);
    near(b.attack.fetchShieldPDef(b), shieldBase, 'Shield Fortress OFF restores block defense');
    const guard = makeSkill(288);
    const shieldRate = b.attack.fetchShieldRate(b);
    use(b, guard);
    near(b.attack.fetchShieldRate(b), shieldRate * 1.5, 'Guard Stance changes real block rate');
    use(b, guard);
    near(b.attack.fetchShieldRate(b), shieldRate, 'Guard Stance OFF restores block rate');
    use(b, aegis);
    near(b.attack.fetchShieldPDef(b), shieldBase * 0.6, 'Aegis reduces actual block defense');
    use(b, aegis);

    enemy.shield = false;
    const criticalHit = () => b.attack.prepareMeleeHit(b, enemy, true, false, () => 0).damage;
    const vicious = makeSkill(312, 20);
    const baseCrit = criticalHit();
    use(b, vicious);
    assert(criticalHit() > baseCrit, 'Vicious Stance increases real critical damage');
    use(b, vicious);
    near(criticalHit(), baseCrit, 'Vicious Stance OFF restores critical damage');
    const holyBlade = makeSkill(196);
    enemy.fetchUndead = () => true;
    use(b, holyBlade);
    assert(criticalHit() > baseCrit, 'Holy Blade increases real damage against undead');
    enemy.fetchUndead = () => false;
    near(criticalHit(), baseCrit, 'Holy Blade does not increase damage against living targets');
    use(b, holyBlade);
    enemy.fetchUndead = () => true;
    near(criticalHit(), baseCrit, 'Holy Blade OFF removes undead bonus');

    const holyArmor = makeSkill(197, 2);
    const darkSpell = new Skill({ selfId: 9996, level: 1, name: 'Dark damage', spell: true, power: 100 });
    darkSpell.semantic.trait = 'dark';
    const darkHit = () => enemy.attack.prepareSkillDamage(enemy, b, darkSpell, true, () => 0.99);
    const baseDark = darkHit();
    use(b, holyArmor);
    const sourcedDark = Formulas.calcMagicDamage(enemy.fetchCollectiveMAtk(), 100, b.fetchCollectiveMDef());
    near(darkHit(), Math.round(sourcedDark * 0.9), 'Holy Armor reduces real dark damage');
    use(b, holyArmor);
    near(darkHit(), baseDark, 'Holy Armor OFF restores dark damage');

    const actorGenerics = invoke(path.actor);
    const originalReceivedHit = actorGenerics.receivedHit;
    let reflected = 0;
    actorGenerics.receivedHit = (session, target, damage) => { reflected += damage; };
    try {
        use(b, riposte);
        b.attack.applyReflectedDamage(enemy.castSession, enemy, b, 100);
        near(reflected, 30, 'Riposte reflects 30 percent of an ordinary hit');
        use(b, riposte);
        b.attack.applyReflectedDamage(enemy.castSession, enemy, b, 100);
        near(reflected, 30, 'Riposte OFF stops ordinary damage reflection');
    } finally { actorGenerics.receivedHit = originalReceivedHit; }

    const npcAggro = invoke('GameServer/Npc/NpcAggro');
    const geodata = invoke('GameServer/Geodata/GeodataEngine');
    const originalLos = geodata.hasLineOfSight;
    geodata.hasLineOfSight = () => true;
    const npc = { fetchHostile: () => true, fetchLocX: () => 10, fetchLocY: () => 0, fetchLocZ: () => 0 };
    try {
        for (const id of [60, 221, 296]) {
            b.state.setSeated(false);
            const skill = makeSkill(id);
            assert(npcAggro.canEngage(npc, b), 'Ordinary NPC can aggro before toggle');
            use(b, skill);
            assert(!npcAggro.canEngage(npc, b), `${skill.fetchName()} blocks ordinary NPC aggro`);
            use(b, skill);
            assert(npcAggro.canEngage(npc, b), `${skill.fetchName()} OFF restores NPC aggro`);
        }
    } finally { geodata.hasLineOfSight = originalLos; }

    for (const id of [222, 317, 322]) {
        b.state.setSeated(false);
        b.weaponKind = id === 222 ? 'Weapon.DualFist' : 'Weapon.Pole';
        b.shield = true;
        const skill = makeSkill(id);
        use(b, skill);
        assert(Toggle.isActive(b, skill));
        b.weaponKind = 'Weapon.Sword';
        b.shield = false;
        Toggle.syncEquipment(b.castSession, b);
        assert(!Toggle.isActive(b, skill), `${skill.fetchName()} stops when required equipment is removed`);
        const mp = b.fetchMp();
        use(b, skill);
        assert(!Toggle.isActive(b, skill), `${skill.fetchName()} rejects missing equipment`);
        near(b.fetchMp(), mp, 'Rejected equipment condition costs no MP');
    }
    close(b);
    close(enemy);
    assert.strictEqual(timers.size, 0, 'No toggle interval leaks');
    console.log(`Toggle matrix passed: ${fixture.skills.length} skills, ${count} level/character combinations`);
} finally {
    global.setInterval = originalInterval;
    global.clearInterval = originalClear;
}
