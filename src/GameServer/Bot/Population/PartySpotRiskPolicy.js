const Risk = require('./SpotRiskPolicy');

function rosterKey(party) {
    return [...new Set((party?.memberIds || []).map(Number))].sort((a, b) => a - b).join(',');
}
function state(party) {
    const memory = party?.stats?.partySpotRisk;
    const current = memory?.partyId === party?.partyId && memory?.rosterKey === rosterKey(party) ? memory : {};
    return { spotId: party?.spotId, stats: { spotRisk: current.spotRisk, spotBackoffs: current.spotBackoffs,
        coldCompetition: party?.stats?.coldCompetition } };
}
function memory(party, stats) {
    return { partyId: party.partyId, rosterKey: rosterKey(party),
        spotRisk: stats.spotRisk || null, spotBackoffs: stats.spotBackoffs || [] };
}
function excludedSpotIds(party, timestamp) {
    return Risk.excludedSpotIdsForStates([state(party)], timestamp);
}
function backoff(party, spotId, timestamp) {
    return Risk.backoffForStates([state(party)], spotId, timestamp);
}
function withBackoff(party, value, timestamp) {
    if (!value) return party;
    const next = Risk.withBackoff(state(party), value, timestamp);
    return { ...party, stats: { ...party.stats, partySpotRisk: memory(party, next.stats) } };
}
function record(party, result, timestamp) {
    const fights = Number(result?.debug?.fights || 0);
    const deaths = Math.max(0, Number(result?.partyPatch?.stats?.deaths || 0) - Number(party?.stats?.deaths || 0));
    if (!party || !fights && !deaths) return result;
    const previous = state(party).stats;
    const spotRisk = Risk.recordResolve(previous.spotRisk || {}, {
        spotId: result.debug?.spotId || party.spotId, timestamp,
        fights, wins: Number(result.debug?.wins || 0), deaths
    });
    return { ...result, partyPatch: { ...result.partyPatch, stats: { ...result.partyPatch?.stats,
        partySpotRisk: memory(party, { ...previous, spotRisk }) } } };
}
module.exports = { rosterKey, excludedSpotIds, backoff, withBackoff, record };
