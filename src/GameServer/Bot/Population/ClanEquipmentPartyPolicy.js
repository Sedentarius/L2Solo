const Config = require('../../Clan/ClanSimulationConfig');
const Risk = require('./SpotRiskPolicy');
let templates, levels = new Map();

function sourceLevel(objective) {
    const Data = invoke('GameServer/DataCache');
    if (templates !== Data.npcs) {
        templates = Data.npcs;
        levels = new Map((templates || []).map(npc => [Number(npc.selfId), Number(npc.template?.level || 0)]));
    }
    return levels.get(Number(objective?.npcId)) || Number(objective?.sourceLevel || 0);
}
function applies(objective) {
    return objective?.clanOperation === 'equipment' && Number(objective.clanId) > 0;
}
function allowed(member, objective, timestamp = Date.now()) {
    if (!applies(objective)) return true;
    const level = sourceLevel(objective);
    if (level && Number(member.level) > 0
        && Number(member.level) < level - Config.operationMaxTargetLevelGap) return false;
    return !(member.stats?.clanHuntBackoffs || []).some(entry =>
        String(entry.spotId) === String(objective.spotId) && Number(entry.until) > timestamp);
}
function needsReview(party, members, timestamp) {
    return members.some(member => !allowed(member, party.stats?.objective, timestamp));
}
function recordOutcome(state, result, objective, timestamp) {
    if (!applies(objective) || !Number(result.debug?.fights)) return result;
    const deaths = Math.max(0, Number(result.patch?.deathCount ?? state.stats?.deaths ?? 0)
        - Number(state.stats?.deaths ?? state.deathCount ?? 0));
    const spotId = result.debug.spotId || objective.spotId;
    const priorBackoff = (state.stats?.clanHuntBackoffs || []).find(entry => String(entry.spotId) === String(spotId));
    const previous = priorBackoff && priorBackoff.until <= timestamp
        && Number(state.stats?.clanHuntRisk?.enteredAt || 0) <= priorBackoff.startedAt
        ? {} : state.stats?.clanHuntRisk || {};
    const risk = Risk.recordResolve(previous, {
        spotId, timestamp, fights: result.debug.fights, wins: result.debug.wins, deaths
    });
    const projected = { spotId, stats: { spotRisk: risk, spotBackoffs: state.stats?.clanHuntBackoffs || [] } };
    const backoff = Risk.backoffForStates([projected], spotId, timestamp);
    const remembered = backoff ? Risk.withBackoff(projected, backoff, timestamp) : projected;
    return { ...result, patch: { ...result.patch, stats: { ...result.patch?.stats,
        clanHuntRisk: risk, clanHuntBackoffs: remembered.stats.spotBackoffs } } };
}
module.exports = { sourceLevel, applies, allowed, needsReview, recordOutcome };
