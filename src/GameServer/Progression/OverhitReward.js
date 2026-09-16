const MAX_BONUS_RATIO = 0.25;

function skillEligible(skill) {
    if (!skill) return false;
    const semantic = skill.fetchSemantic?.() || invoke('GameServer/Skills/C4SkillRules').resolve(skill) || {};
    return semantic.overHit === true;
}

function contextForHit({ attacker, skill, targetHpBeforeHit, targetMaxHp, finalDamage, encounterId, timestamp = Date.now() } = {}) {
    const hpBefore = Math.max(0, Number(targetHpBeforeHit) || 0);
    const damage = Math.max(0, Number(finalDamage) || 0);
    const maxHp = Math.max(1, Number(targetMaxHp) || 1);
    const attackerId = Number(attacker?.fetchId?.() || attacker?.characterId || 0);
    if (!attackerId || attacker?.fetchIsSummon?.() === true || attacker?.fetchIsPet?.() === true
        || !skillEligible(skill) || damage <= hpBefore) return null;
    return {
        attackerId,
        skillId: Number(skill?.fetchSelfId?.() || skill?.selfId || 0),
        skillLevel: Number(skill?.fetchLevel?.() || skill?.level || 1),
        overHitEligible: true,
        targetHpBeforeHit: hpBefore,
        targetMaxHp: maxHp,
        finalDamage: damage,
        overhitDamage: damage - hpBefore,
        encounterId: Number(encounterId || 0),
        timestamp: Number(timestamp)
    };
}

function capture(target, attacker, { skill = null, damage = 0, timestamp = Date.now() } = {}) {
    if (!target) return null;
    const holder = target.model || target;
    delete holder.overhitContext;
    const context = contextForHit({
        attacker,
        skill,
        targetHpBeforeHit: target.fetchHp?.(),
        targetMaxHp: target.fetchMaxHp?.(),
        finalDamage: damage,
        encounterId: target.fetchId?.(),
        timestamp
    });
    if (context) holder.overhitContext = context;
    return context;
}

function resolveContext(context, baseExp) {
    const normalExp = Math.max(0, Number(baseExp) || 0);
    if (!context?.overHitEligible || !(Number(context.overhitDamage) > 0) || !(Number(context.targetMaxHp) > 0)) {
        return { eligible: false, baseExp: normalExp, bonusRatio: 0, bonusExp: 0, adjustedExp: normalExp };
    }
    const bonusRatio = Math.min(MAX_BONUS_RATIO, Number(context.overhitDamage) / Number(context.targetMaxHp));
    const bonusExp = Math.round(normalExp * bonusRatio);
    return { eligible: bonusExp > 0, baseExp: normalExp, bonusRatio, bonusExp, adjustedExp: normalExp + bonusExp };
}

function consume(target, finalAttacker, baseExp) {
    const holder = target?.model || target;
    const context = holder?.overhitContext || null;
    if (holder) delete holder.overhitContext;
    const attackerId = Number(finalAttacker?.fetchId?.() || finalAttacker?.characterId || 0);
    if (!context || Number(context.attackerId) !== attackerId
        || Number(context.encounterId) !== Number(target?.fetchId?.() || 0)) {
        return { ...resolveContext(null, baseExp), context: null };
    }
    return { ...resolveContext(context, baseExp), context };
}

function clear(target) {
    const holder = target?.model || target;
    if (holder) delete holder.overhitContext;
}

module.exports = { MAX_BONUS_RATIO, skillEligible, contextForHit, capture, resolveContext, consume, clear };
