const EffectStore = invoke('GameServer/Effects/EffectStore');
const BotRoles = invoke('GameServer/Bot/AI/BotRoles');
const ClassProgression = invoke('GameServer/ClassProgression');
const Intent = invoke('GameServer/Bot/AI/BotSkillIntent');

const DESTROYER_CLASS_ID = 46;

function ratio(value, max) {
    return Number(value || 0) / Math.max(1, Number(max || 1));
}

function learned(actor, id) {
    return actor?.skillset?.fetchSkill?.(id) || null;
}

function lineageClassId(actor) {
    const classId = Number(actor?.fetchClassId?.());
    return Number(ClassProgression.getThirdClass(classId)?.parentClassId || classId);
}

function hasEquippedShield(actor) {
    return (actor?.backpack?.fetchEquippedArmors?.() || [])
        .some((item) => item?.fetchKind?.() === 'Armor.Shield');
}

function usable(actor, skill, reserveRatio = 0.10) {
    return Intent.usable(actor,skill,reserveRatio)
        && !invoke('GameServer/Bot/AI/BotActionFeedback').blocked(actor,actor,skill);
}

function active(actor, skill) {
    if (!skill) return false;
    if (Intent.equivalentActive(actor,skill)) return true;
    // Frenzy and Guts replace the same sourced OrcBuff stack. Do not alternate
    // them merely because the number of nearby targets changes between ticks.
    if (skill.fetchSemantic?.()?.stackFamily === 'OrcBuff'
        && EffectStore.list(actor).some(effect=>effect.stackFamily==='OrcBuff')) return true;
    const id = Number(skill.fetchSelfId?.() || 0);
    const effect = String((skill.fetchSemantic?.() || {}).effect || '').toLowerCase();
    return EffectStore.list(actor, { includeDebuffs: false }).some((entry) => (
        Number(entry.id || 0) === id || (effect && String(entry.key || '').toLowerCase() === effect)
    ));
}

function selfAction(actor, { role = BotRoles.inferRole(actor), activeMobs = 0 } = {}) {
    const hpRatio = ratio(actor?.fetchHp?.(), actor?.fetchMaxHp?.());

    if (role === 'tank') {
        const ultimateDefense = learned(actor, 110);
        if (activeMobs >= 2 && hpRatio < 0.45 && usable(actor, ultimateDefense, 0.05) && !active(actor, ultimateDefense)) {
            return { skill: ultimateDefense, target: actor, reason: 'multiple_mobs_low_hp' };
        }
        const majesty = learned(actor, 82);
        if (activeMobs > 0 && hpRatio < 0.85 && usable(actor, majesty, 0.25) && !active(actor, majesty)) {
            return { skill: majesty, target: actor, reason: 'tank_defensive_stance' };
        }
    }

    if (role === 'dps' && [45, DESTROYER_CLASS_ID].includes(lineageClassId(actor))) {
        const battleRoar = learned(actor, 121);
        if (hpRatio < 0.55 && usable(actor, battleRoar, 0.05) && !active(actor, battleRoar)) {
            return { skill: battleRoar, target: actor, reason: 'destroyer_battle_roar' };
        }
        if (hpRatio <= 0.30) {
            const skill = activeMobs >= 2 ? learned(actor, 139) : learned(actor, 176);
            if (usable(actor, skill, 0.05) && !active(actor, skill)) {
                return { skill, target: actor, reason: activeMobs >= 2 ? 'destroyer_guts' : 'destroyer_frenzy' };
            }
        }
    }

    return null;
}

function nearest(actor, targets) {
    return [...targets].sort((a, b) => {
        const distance = (target) => Math.hypot(
            Number(actor.fetchLocX?.() || 0) - Number(target.fetchLocX?.() || 0),
            Number(actor.fetchLocY?.() || 0) - Number(target.fetchLocY?.() || 0)
        );
        return distance(a) - distance(b);
    })[0] || null;
}

function crowdControlled(target) {
    const impairments = EffectStore.impairments(target);
    return impairments.disabled;
}

function tankMassAggroAction(actor, threats) {
    const others = threats.filter((target) => Number(target.fetchDestId?.()) !== Number(actor.fetchId?.()));
    const hateAura = learned(actor, 18);
    if (others.length >= 2 && usable(actor, hateAura, 0.08)) {
        const radius = Math.max(0, Number((hateAura.fetchSemantic?.() || {}).radius) || 0);
        const inAura = others.filter((target) => Math.hypot(
            Number(actor.fetchLocX?.() || 0) - Number(target.fetchLocX?.() || 0),
            Number(actor.fetchLocY?.() || 0) - Number(target.fetchLocY?.() || 0)
        ) <= radius);
        if (inAura.length >= 2) return { skill: hateAura, target: actor, reason: 'recover_multiple_targets' };
    }
    return null;
}

function tankStunAction(actor, threats, { protectedRole = null } = {}) {
    const others = threats.filter((target) => Number(target.fetchDestId?.()) !== Number(actor.fetchId?.()));
    const shieldStun = learned(actor, 92);
    const shouldControl = threats.length >= 2 || ['leader', 'healer', 'buffer'].includes(protectedRole);
    const stunTarget = shouldControl
        ? nearest(actor, others.filter((target) => !crowdControlled(target)))
        : null;
    if (stunTarget && hasEquippedShield(actor) && usable(actor, shieldStun, 0.10)) {
        return { skill: shieldStun, target: stunTarget, reason: 'control_dangerous_add' };
    }

    return null;
}

function tankControlAction(actor, threats, options = {}) {
    return tankMassAggroAction(actor, threats) || tankStunAction(actor, threats, options);
}

function supportCrowdControl(actor, threats, { primaryTargetId = null, selfDefense = false } = {}) {
    const role = BotRoles.inferRole(actor);
    if (!['mage', 'healer', 'buffer'].includes(role) || threats.length < (selfDefense ? 1 : 2)) return null;
    if (!selfDefense && ratio(actor.fetchMp?.(), actor.fetchMaxMp?.()) < 0.45) return null;
    const add = nearest(actor, threats.filter((target) => (
        Intent.alive(target) && (selfDefense || Number(target.fetchId?.()) !== Number(primaryTargetId || 0)) &&
        !crowdControlled(target)
    )));
    if (!add) return null;

    const preference = role === 'mage'
        ? [1069]
        : (role === 'healer' ? [1201, 1069] : [1201, 1069, 1097, 1208]);
    const skill = preference.map((id) => learned(actor, id)).find((candidate) => usable(actor, candidate, selfDefense ? 0 : 0.35)
        && Intent.debuffUseful(actor,add,candidate, { fleeing:selfDefense }));
    return skill ? { skill, target: add, reason: selfDefense ? 'control_personal_attacker' : 'control_party_add' } : null;
}

module.exports = {
    usable,
    hasEquippedShield,
    selfAction,
    tankMassAggroAction,
    tankStunAction,
    tankControlAction,
    supportCrowdControl
};
