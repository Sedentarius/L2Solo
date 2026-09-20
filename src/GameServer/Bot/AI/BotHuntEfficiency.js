const Roles = invoke('GameServer/Bot/AI/BotRoles');
const Rates = invoke('GameServer/ProgressionRates');
const MAX_SPOTS = 8;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
function signature(state, mode) {
    const inventory = state.inventory || {};
    const items = Array.isArray(inventory) ? inventory : Object.values(inventory);
    const equipped = items.filter(item => item.equipped || Number(item.equippedCount) > 0)
        .map(item => `${item.selfId}:${item.enchant || 0}`).sort();
    const level = Number(state.fetchLevel?.() || state.level || state.stats?.level || 1);
    const grouped = mode ? ['party','duo','party_pve'].includes(mode)
        : !!state.party?.partyId || ['party','duo'].includes(state.stats?.routeMode) || state.activity==='grouped';
    // Pre-migration samples used gross rewards and cannot establish net profit.
    return ['net-xp-v1',Roles.classIdOf(state),level,grouped?'party':'solo',Rates.profile().exp,...equipped].join(':');
}
function record(state, { spotId, combatMs, recoveryMs = 0, exp = 0, timestamp = Date.now() }) {
    const key = signature(state);
    const prior = Array.isArray(state.stats?.huntEfficiency) ? state.stats.huntEfficiency : [];
    const kept = prior.filter(row => row.signature === key && timestamp >= row.at && timestamp-row.at < MAX_AGE_MS);
    const cycleMs = Math.max(0,Number(combatMs)) + Math.max(0,Number(recoveryMs));
    if (!spotId || !Number.isFinite(cycleMs) || cycleMs <= 0 || !Number.isFinite(exp)) return kept;
    const old = kept.find(row => row.spotId === spotId);
    const mix = (field,value) => old ? Number(old[field])*0.75+value*0.25 : value;
    const next = { spotId,signature:key,at:timestamp,samples:Math.min(32,(old?.samples||0)+1),
        exp:mix('exp',exp),cycleMs:mix('cycleMs',cycleMs),
        source:'cold_combat_and_estimated_recovery' };
    return [next,...kept.filter(row=>row.spotId!==spotId)].slice(0,MAX_SPOTS);
}
function scores(state, timestamp = Date.now(), mode) {
    const key = signature(state,mode);
    const rows = (Array.isArray(state.stats?.huntEfficiency)?state.stats.huntEfficiency:[])
        .filter(row => row.signature===key && row.samples>=3 && timestamp>=row.at && timestamp-row.at<MAX_AGE_MS
            && Number.isFinite(row.exp) && Number.isFinite(row.cycleMs) && row.cycleMs>0);
    const best = Math.max(0,...rows.map(row=>row.exp/row.cycleMs));
    if (!(best>0)) return new Map(rows.map(row=>[row.spotId,-40]));
    // A bounded preference leaves unknown spots available for exploration and
    // cannot override party/level/territory safety gates in LevelingRoutes.
    return new Map(rows.map(row=>[row.spotId,Math.round(Math.max(-40,Math.min(15,55*row.exp/row.cycleMs/best-40)))]));
}
module.exports = { record, scores, signature, MAX_SPOTS, MAX_AGE_MS };
