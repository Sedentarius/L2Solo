const Rules = invoke('GameServer/Skills/C4SkillRules');
const Roles = invoke('GameServer/Bot/AI/BotRoles');
const WeaponMask = invoke('GameServer/Skills/WeaponMask');

const MIN_EFFICIENCY = 0.15;
const ELEMENTS = ['fire', 'water', 'wind', 'earth', 'holy', 'dark'];
const DAMAGE_TYPES = new Set([Rules.DAMAGE, Rules.DAMAGE_EFFECT, Rules.DRAIN,
    Rules.DEATH_LINK, Rules.FATAL, Rules.BLOW]);
const weaponStat = kind => ({ 'Weapon.Bow': 'bowWpnVuln', 'Weapon.Knife': 'daggerWpnVuln',
    'Weapon.Blunt': 'bluntWpnVuln', 'Weapon.BigBlunt': 'bluntWpnVuln' })[kind];
const number = (value, fallback = 1) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = value => Math.max(1, number(value));
let npcSource, npcCount = 0, npcIndex = new Map();

function npcTemplate(id) {
    const source = invoke('GameServer/DataCache').npcs || [];
    if (npcSource !== source || npcCount !== source.length) {
        npcSource = source;
        npcCount = source.length;
        npcIndex = new Map(source.map(npc => [Number(npc.selfId), npc]));
    }
    return npcIndex.get(Number(id));
}

// A scan owns this snapshot: do not retain live effects, equipment or learned
// skills across decisions. Cold callers already own an immutable profile.
function actorProfile(actor) {
    return {
        classId: actor.fetchClassId?.(), level: actor.fetchLevel?.(),
        role: Roles.combatRoleFor(actor),
        pAtk: actor.fetchCollectivePAtk?.() ?? actor.fetchPAtk?.(),
        mAtk: actor.fetchCollectiveMAtk?.() ?? actor.fetchMAtk?.(),
        atkSpd: actor.fetchCollectiveAtkSpd?.() ?? actor.fetchAtkSpd?.() ?? 300,
        castSpd: actor.fetchCollectiveCastSpd?.() ?? actor.fetchCastSpd?.() ?? 333,
        maxMp: actor.fetchMaxMp?.(), weaponMask: WeaponMask.weaponMaskFor(actor),
        equipment: { weaponKind: actor.backpack?.fetchTotalWeaponKind?.() },
        skills: (actor.skillset?.skills || actor.skillset?.fetchSkills?.() || []).map(skill => ({
            selfId: skill.fetchSelfId?.(), level: skill.fetchLevel?.(),
            reuseReady: actor.canUseSkill?.(skill) !== false,
            semantic: skill.fetchSemantic?.() || {}, passive: skill.fetchPassive?.(),
            spell: skill.fetchSpell?.(), power: skill.fetchPower?.(), mp: skill.fetchConsumedMp?.(),
            hitTime: skill.fetchHitTime?.(), distance: skill.fetchDistance?.()
        }))
    };
}

function actorProfiles(actors) {
    return actors.filter(Boolean).flatMap(actor => {
        const profile = actorProfile(actor);
        if (actor.summon && !actor.summon.isDead?.() && !actor.summon.state?.fetchDead?.()) {
            return [profile, { ...actorProfile(actor.summon), role: 'dps' }];
        }
        return coldProfiles(profile, { vitals: { mp: actor.fetchMp?.() } });
    });
}

function coldProfiles(profile, state = {}, timestamp = Date.now()) {
    const profiles = [{ ...profile, skills: (profile.skills || []).map(skill => ({
        ...skill, semantic: skill.semantic || Rules.resolve(skill)
    })) }];
    const summon = state.stats?.coldCombat?.summon;
    if (summon?.active && number(summon.hp, summon.maxHp) > 0 && summon.expiresAt > timestamp) {
        profiles.push({ ...summon, role: 'dps', skills: [] });
    } else if (Roles.isSummoner(profile.classId)) {
        const Cold = invoke('GameServer/Bot/Population/ColdCombatProfile');
        const skill = Cold.summonSkills(profile).find(s => s.reuseReady !== false
            && number(s.mp, 0) <= number(state.vitals?.mp, profile.maxMp)
            && number(state.stats?.coldCombat?.cooldowns?.[s.selfId], 0) <= timestamp);
        if (skill) profiles.push({ ...invoke('GameServer/Bot/Population/ColdSummonProfile')(profile, Cold.summonDetails(skill)),
            role: 'dps', skills: [] });
    }
    return profiles;
}

function profileStats(profiles) {
    return [...new Set((profiles || []).flatMap(profile => [weaponStat(profile.equipment?.weaponKind),
        ...(profile.skills || []).map(skill => {
            const trait = (skill.semantic || Rules.resolve(skill)).trait;
            return skill.spell && ELEMENTS.includes(trait) ? `${trait}Vuln` : null;
        })]).filter(Boolean))];
}

function skillStats(actor) {
    return profileStats([{ equipment: { weaponKind: actor.backpack?.fetchTotalWeaponKind?.() },
        skills: (actor.skillset?.skills || []).map(skill => ({
            spell: skill.fetchSpell?.(), semantic: skill.fetchSemantic?.() || {}
        })) }]);
}

function targetView(target, stats = ['bowWpnVuln', 'bluntWpnVuln', 'daggerWpnVuln', ...ELEMENTS.map(e => `${e}Vuln`)]) {
    if (!target || typeof target.fetchHp !== 'function') return target || {};
    // ColdClassPolicy supplies the same projection as native target scans.
    if (target.matchupTarget) return target.matchupTarget;
    // Native effect evaluation loads World/GameTime; cold workers must use
    // their serialized target stats without importing the live world.
    const EffectStats = invoke('GameServer/Effects/EffectStats');
    const vulnerabilities = {};
    for (const stat of stats) {
        vulnerabilities[stat] = EffectStats.multiplier(target, stat, 1);
    }
    const pDef = target.fetchCollectivePDef?.() ?? target.fetchPDef?.();
    const mDef = target.fetchCollectiveMDef?.() ?? target.fetchMDef?.();
    return { vulnerabilities, pDef, mDef, undead: target.fetchUndead?.() === true,
        basePDef: target.fetchPDef?.() ?? pDef, baseMDef: target.fetchMDef?.() ?? mDef };
}

function modifier(target, semantic = {}, magic = false, kind = '') {
    const stat = magic ? (ELEMENTS.includes(semantic.trait) ? `${semantic.trait}Vuln` : null)
        : semantic.trait === 'bow' ? 'bowWpnVuln'
            : semantic.trait === 'dagger' ? 'daggerWpnVuln' : weaponStat(kind);
    const vuln = stat ? Math.max(0, number(target.vulnerabilities?.[stat])) : 1;
    const base = magic ? target.baseMDef : target.basePDef;
    const defense = magic ? target.mDef : target.pDef;
    return vuln * (number(base, 0) > 0 && number(defense, 0) > 0 ? base / defense : 1);
}

function skillModifier(actor, target, skill, view = targetView(target)) {
    return modifier(view, skill.fetchSemantic?.(), skill.fetchSpell?.() === true,
        actor.backpack?.fetchTotalWeaponKind?.() || '');
}

function channels(profile, target) {
    const role = profile.role || Roles.combatRoleFor(profile);
    const kind = profile.equipment?.weaponKind || '';
    const physical = role !== 'mage';
    const result = [];
    if (physical) result.push({ weight: 70 * positive(profile.pAtk) / positive(target.basePDef || target.pDef)
        * positive(profile.atkSpd || 300) / 500,
    modifier: modifier(target, {}, false, kind) });
    for (const skill of profile.skills || []) {
        const semantic = skill.semantic || Rules.resolve(skill);
        const magic = skill.spell === true;
        if (skill.passive || !DAMAGE_TYPES.has(semantic.skillType) || semantic.target !== 'enemy'
            || semantic.notUsedInC4 || (role === 'mage' && !magic)
            || (semantic.undeadOnly && target.undead !== true)
            || (number(profile.maxMp, 0) > 0 && number(skill.mp, 0) > profile.maxMp)
            || (semantic.requires?.weaponsAllowed && !(semantic.requires.weaponsAllowed & profile.weaponMask))
            || (kind === 'Weapon.Bow' && number(semantic.castRange ?? skill.distance, 0) < 400)) continue;
        const power = Math.max(0, number(skill.power ?? semantic.power, 0));
        if (!power) continue;
        const weight = magic
            ? 91 * Math.sqrt(positive(profile.mAtk)) * power / positive(target.baseMDef || target.mDef)
                / Math.max(0.5, number(skill.hitTime, 3000) / 1000 * 333 / positive(profile.castSpd || 333))
            : 70 * (positive(profile.pAtk) + power) / positive(target.basePDef || target.pDef)
                / Math.max(1, number(skill.hitTime, 1500) / 1000);
        result.push({ weight, modifier: modifier(target, semantic, magic, kind) });
    }
    return result;
}

function evaluate(profiles, target) {
    let neutral = 0, effective = 0;
    for (const profile of profiles || []) {
        const attacks = channels(profile, target);
        if (!attacks.length) continue; // Missing legacy skill data is not immunity.
        neutral += Math.max(...attacks.map(a => a.weight));
        effective += Math.max(...attacks.map(a => a.weight * a.modifier));
    }
    const efficiency = neutral > 0 ? effective / neutral : 1;
    return { efficiency, eligible: efficiency > MIN_EFFICIENCY,
        penalty: Math.round(Math.max(0, 1 - efficiency) * 900),
        reason: efficiency <= MIN_EFFICIENCY ? 'target_resistance' : 'target_efficiency' };
}

function stateProfiles(state, options = {}) {
    if (options.matchupProfiles) return options.matchupProfiles;
    const states = (options.capacityStates?.length ? options.capacityStates : [state])
        .filter(member => member.vitals?.hp !== 0 && member.activity !== 'dead');
    // Do not invent the other members of an incomplete party projection.
    if (options.mode === 'party' && states.length === 1) return [];
    const Cold = invoke('GameServer/Bot/Population/ColdCombatProfile');
    return states.flatMap(member => typeof member.fetchHp === 'function'
        ? actorProfiles([member])
        : coldProfiles(Cold.profileFor(member, options.timestamp), member, options.timestamp));
}

function spotMatchup(spot, profiles) {
    if (!profiles?.length) return evaluate([], {});
    const Cold = invoke('GameServer/Bot/Population/ColdCombatProfile');
    const HuntingPolicy = invoke('GameServer/Bot/AI/BotHuntingTargetPolicy');
    let total = 0, effective = 0, eligible = false;
    for (const entry of spot.npcEntries || []) {
        const npc = npcTemplate(entry.selfId);
        if (!npc || !HuntingPolicy.canHunt(npc)) continue;
        const weight = Math.max(1, number(entry.count));
        const match = evaluate(profiles, Cold.npcCombatStats(npc));
        total += weight;
        effective += weight * Math.min(1, match.efficiency);
        eligible ||= match.eligible;
    }
    const efficiency = total ? effective / total : 1;
    return { efficiency, eligible: !total || eligible, penalty: Math.round((1 - efficiency) * 250) };
}

module.exports = { MIN_EFFICIENCY, actorProfiles, coldProfiles, targetView, skillModifier, profileStats, skillStats,
    evaluate, stateProfiles, spotMatchup };
