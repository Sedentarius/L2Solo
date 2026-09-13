const EffectStats = invoke('GameServer/Effects/EffectStats');
const Formulas = invoke('GameServer/Formulas');

// Lisvus Formulas.calcSkillMastery / L2Character.doCast. Focus Skill
// Mastery multiplies the learned passive's chance; it is not a flat bonus.
function succeeds(actor, skill, rng = Math.random) {
    const semantic = skill.fetchSemantic?.() || {};
    if (semantic.isPotion || semantic.operateType === 'toggle'
        || skill.fetchPassive?.() || semantic.skillType === 'fishing') return false;
    const base = EffectStats.add(actor, 'skillMastery');
    if (base <= 0) return false;
    const stat = actor.isSpellcaster?.() ? 'INT' : 'STR';
    const raw = stat === 'INT' ? actor.fetchInt?.() : actor.fetchStr?.();
    const adjusted = Math.max(1, Math.round(((Number(raw) || 0) + EffectStats.add(actor, stat))
        * EffectStats.multiplier(actor, `${stat}Mul`)));
    const chance = base * EffectStats.multiplier(actor, 'skillMasteryMul')
        * Formulas.calcBaseMod[stat](adjusted);
    return Math.floor(rng() * 100) < chance;
}

module.exports = { succeeds };
