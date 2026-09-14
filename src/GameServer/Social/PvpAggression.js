// A 0..1 aggression scale, not combat permission. The midpoint preserves balance.
function normalize(value) {
    if (value === undefined || value === null || String(value).trim() === '') return 0.5;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.5;
}

function scaleChance(chance, aggression) {
    const base = Math.max(0, Math.min(1, Number(chance) || 0));
    // Do not turn a fully restrained response (e.g. friendship) into aggression.
    if (base === 0) return 0;
    const level = normalize(aggression);
    return level <= 0.5 ? base * level * 2 : base + (1 - base) * (level * 2 - 1);
}

// Lower aggression demands a safer fight and makes withdrawal more likely.
// Keep a floor: aggression never removes risk/resource-based escape decisions.
function retreatMultiplier(aggression) {
    const level = normalize(aggression);
    return level <= 0.5 ? 2 / (1 + level * 2) : 1 - (level - 0.5) * 0.8;
}

function retreatChance(chance, aggression) {
    return Math.max(0, Math.min(1, chance * retreatMultiplier(aggression)));
}

function retreatHp(threshold, aggression) {
    return Math.max(0.1, Math.min(0.6, threshold * retreatMultiplier(aggression)));
}

module.exports = { normalize, scaleChance, retreatMultiplier, retreatChance, retreatHp };
