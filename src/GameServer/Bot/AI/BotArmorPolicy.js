const Sets = invoke('GameServer/Items/C4ArmorSets');
const Compatibility = invoke('GameServer/Bot/AI/BotEquipmentCompatibility');
const ARMOR_SLOTS = new Set([6, 9, 10, 11, 12, 15]);
function view(item) {
    return { source: item,
        id: Number(item.fetchSelfId?.() ?? item.selfId),
        slot: Number(item.fetchSlot?.() ?? item.etc?.slot ?? item.slot),
        pDef: Number(item.fetchPDef?.() ?? item.stats?.pDef ?? item.pDef ?? 0),
        mp: Number(item.fetchBonusMp?.() ?? item.stats?.maxMp ?? item.etc?.mp ?? item.maxMp ?? 0),
        price: Number(item.fetchPrice?.() ?? item.template?.price ?? item.price ?? 0) };
}
function completeSets(items) {
    const ids = new Set(items.map(item => view(item).id));
    return Sets.ARMOR_SETS.filter(set => [set.chest,set.legs,set.head,set.gloves,set.feet].every(id => !id || ids.has(id)));
}
function score(items, role, classId) {
    const rows = items.map(view).filter(item => ARMOR_SLOTS.has(item.slot));
    const defense = rows.reduce((sum,item) => sum + item.pDef, 0);
    const mana = rows.reduce((sum,item) => sum + item.mp, 0);
    const caster = Compatibility.isCasterRole(role, classId);
    let value = defense + mana * (caster ? 0.15 : 0.02);
    // Tunable utility weights, using native set effects. They express why a
    // complete casting/melee set can beat isolated higher-defense pieces.
    for (const set of completeSets(items)) {
        const stats = Sets.resolveSkill(set.skillId)?.stats || {};
        value += defense * ((stats.pDefMul ?? 1) - 1);
        value += Number(stats.maxHpAdd || 0) * 0.05 + Number(stats.maxMpAdd || 0) * (caster ? 0.15 : 0.02);
        value += ((stats.castSpdMul ?? 1) - 1) * (caster ? 250 : 0);
        value += ((stats.mAtkMul ?? 1) - 1) * (caster ? 200 : 0);
        value += ((stats.pAtkSpdMul ?? 1) - 1) * (caster ? 20 : 200);
        value += ((stats.pAtkMul ?? 1) - 1) * (caster ? 20 : 200);
    }
    return value;
}
function optimize(baseline, available, { role, classId, budget = Infinity } = {}) {
    const initial = baseline.filter(item => ARMOR_SLOTS.has(view(item).slot));
    const byId = new Map(available.filter(item => ARMOR_SLOTS.has(view(item).slot)).map(item => [view(item).id, item]));
    let best = initial, bestScore = score(initial, role, classId);
    for (const set of Sets.ARMOR_SETS) {
        const required = [set.chest,set.legs,set.head,set.gloves,set.feet].filter(Boolean);
        if (!required.every(id => byId.has(id))) continue;
        const parts = required.map(id => byId.get(id));
        const slots = new Set(parts.map(item => view(item).slot));
        if (slots.has(15)) { slots.add(10); slots.add(11); }
        else if (slots.has(10) || slots.has(11)) slots.add(15);
        const candidate = [...initial.filter(item => !slots.has(view(item).slot)), ...parts];
        if (candidate.reduce((sum,item) => sum + view(item).price, 0) > budget) continue;
        const candidateScore = score(candidate, role, classId);
        if (candidateScore > bestScore + 0.01) { best = candidate; bestScore = candidateScore; }
    }
    return best;
}
module.exports = { ARMOR_SLOTS, view, completeSets, score, optimize };
