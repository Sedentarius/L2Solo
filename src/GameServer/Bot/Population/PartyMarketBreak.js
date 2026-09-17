const cleanupNeed = (member, now) => invoke('GameServer/Bot/Economy/ItemDisposition').inventoryCleanupNeed(member, { now });

const RESERVATION_MS = 15 * 60 * 1000;
function clanDuty(party) {
    const objective = party?.stats?.objective;
    return objective?.priority === 'required' && !!objective.clanGoalKey;
}
function pending(party, now = Date.now()) {
    return Object.values(party?.stats?.marketAbsences || {}).filter(value => Number(value.until) > now);
}
function allowed(party, member, now = Date.now()) {
    if (!clanDuty(party)) return true;
    return !pending(party, now).length
        && cleanupNeed(member, now)?.reason === 'inventory_capacity';
}
function goal(party, member, current, now) {
    if (!clanDuty(party)) return current;
    const need = cleanupNeed(member, now);
    if (need?.reason !== 'inventory_capacity') return null;
    return { type: 'sell_inventory', status: 'active', priority: 96,
        target: { cleanupReason: need.reason, itemCount: need.slots },
        plan: { expectedBenefit: 'market_sale_inventory', cleanupReason: need.reason } };
}
function departure(party, member, travel, now) {
    if (!clanDuty(party)) return travel;
    const need = cleanupNeed(member, now);
    const token = { partyId: party.partyId, characterId: member.characterId, until: now + RESERVATION_MS,
        objective: { ...party.stats.objective }, startedAt: now, cleanupReason: need?.reason,
        slots: need?.slots, limit: need?.limit };
    return { ...travel, stats: { ...travel.stats, partyMarketReturn: token,
        lastPartyMarketBreak: token, clanPartyObjective: token.objective } };
}
function stats(party, departed) {
    const token = departed?.stats?.partyMarketReturn;
    return token ? { marketAbsences: { ...party.stats?.marketAbsences, [departed.characterId]: token } } : {};
}
function ready(state) {
    return !!state?.stats?.partyMarketReturn && !state.party?.partyId && !state.partyId
        && !state.stats?.travel && !state.stats?.marketReturn
        && ['hunting', 'party_wait', 'grouped'].includes(state.activity);
}
module.exports = { clanDuty, pending, allowed, goal, departure, stats, ready };
