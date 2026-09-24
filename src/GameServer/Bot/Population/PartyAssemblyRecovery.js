const WAIT_LIMIT_MS = 5 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const REASON = 'party_assembly_timeout';

function record(party, timestamp) {
    const previous = party.stats?.assemblyWait;
    const gap = timestamp - Number(previous?.lastAt || timestamp);
    // Count observed retry time, not server downtime or a long recovery.
    const elapsed = gap > 0 && gap <= 60000 ? gap : 0;
    return { since: previous?.since || timestamp, lastAt: timestamp,
        attempts: Number(previous?.attempts || 0) + 1,
        waitedMs: Number(previous?.waitedMs || 0) + elapsed };
}

function expired(party) {
    const wait = party?.stats?.assemblyWait;
    return Number(wait?.attempts || 0) >= 6 && Number(wait?.waitedMs || 0) >= WAIT_LIMIT_MS;
}

function coolingDown(state, timestamp = Date.now()) {
    const request = state?.stats?.partyRequest;
    return request?.deferReason === REASON && Number(request.deferredUntil || 0) > timestamp;
}

module.exports = { WAIT_LIMIT_MS, RETRY_MS, REASON, record, expired, coolingDown };
