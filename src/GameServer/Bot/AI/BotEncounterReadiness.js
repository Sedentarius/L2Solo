const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Readiness to start a voluntary solo fight. Emergency retreat thresholds
// govern an existing fight and must not be used to admit the next one.
function evaluate(actor, target = {}) {
    const hpRatio = actor.hp / Math.max(1, actor.maxHp);
    const mpRatio = actor.mp / Math.max(1, actor.maxMp);
    const levelGap = Number(target.level || actor.level) - Number(actor.level);
    const targetHpRatio = clamp(Number(target.hp ?? target.maxHp ?? 1)
        / Math.max(1, Number(target.maxHp ?? target.hp ?? 1)), 0, 1);
    const fullTargetHpNeed = clamp(0.70 + Math.max(0, levelGap) * 0.04
        + Math.min(0, levelGap) * 0.025, 0.55, 0.90);
    const hpNeeded = clamp(0.40 + (fullTargetHpNeed - 0.40) * targetHpRatio, 0.40, 0.90);
    const fullTargetMpNeed = clamp(0.45 + Math.max(0, levelGap) * 0.03, 0.35, 0.70);
    const mpNeeded = actor.manaDependent
        ? clamp(0.20 + (fullTargetMpNeed - 0.20) * targetHpRatio, 0.20, 0.70) : 0;
    const ready = hpRatio >= hpNeeded && (!actor.manaDependent || mpRatio >= mpNeeded);
    return { ready, reason: hpRatio < hpNeeded ? 'hp_reserve' : (!ready ? 'mp_reserve' : 'ready'),
        hpRatio, hpNeeded, mpRatio, mpNeeded, targetHpRatio, levelGap };
}

module.exports = { evaluate };
