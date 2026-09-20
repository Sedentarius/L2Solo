const MIN_DEATHS_AT_SPOT = 2;
const MIN_DEATH_RATE = 0.2;
const RISK_WINDOW_VERSION = 2;
const RISK_WINDOW_FIGHTS = 12;
const MAX_LOW_WIN_RATE = 0.25;
const BACKOFF_MS = 60 * 60 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
const MAX_BACKOFFS = 8;
const CAPACITY_BACKOFF_MS = 60000;
const MAX_FAILED_HUNTS = 3;
const FAILED_HUNT_RECOVERY_WINS = 3;

function normalizedSpotId(value) {
    const spotId = String(value || '').trim();
    return spotId || null;
}

function pressureForWindow({ spotId, fights = 0, wins = 0, deaths = 0, unrecoveredDeaths = 0, failedHunts = 0 } = {}) {
    const resolved = Math.max(0, Number(fights || 0));
    const won = Math.max(0, Math.min(resolved, Number(wins || 0)));
    const dead = Math.max(0, Number(deaths || 0));
    const deathRate = dead / Math.max(1, resolved);
    if ((dead >= MIN_DEATHS_AT_SPOT && deathRate >= MIN_DEATH_RATE) || unrecoveredDeaths >= MIN_DEATHS_AT_SPOT) {
        return { spotId, deaths: Math.max(dead, unrecoveredDeaths), fights: resolved, wins: won, deathRate, winRate: won / Math.max(1, resolved), reason: 'death_pressure' };
    }
    const winRate = won / Math.max(1, resolved);
    if (resolved >= RISK_WINDOW_FIGHTS && winRate <= MAX_LOW_WIN_RATE) {
        return { spotId, deaths: dead, fights: resolved, wins: won, deathRate, winRate, reason: 'low_win_rate' };
    }
    if (failedHunts >= MAX_FAILED_HUNTS) {
        return { spotId, deaths: dead, fights: resolved, wins: won, deathRate, winRate, reason: 'failed_hunts' };
    }
    return null;
}

function recordResolve(previous = {}, sample = {}) {
    const spotId = normalizedSpotId(sample.spotId);
    const timestamp = Number(sample.timestamp || Date.now());
    const sameSpot = spotId && normalizedSpotId(previous.spotId) === spotId;
    const currentWindow = sameSpot && Number(previous.version || 0) === RISK_WINDOW_VERSION
        ? pressureForWindow({
            spotId,
            fights: previous.windowFights,
            wins: previous.windowWins,
            deaths: previous.windowDeaths,
            unrecoveredDeaths: previous.unrecoveredDeaths,
            failedHunts: previous.failedHunts
        })
        : null;
    // Keep a failed sample stable until the existing routing pass consumes it.
    // This prevents a delayed travel/rest cycle from diluting the signal and
    // also keeps the persisted counters bounded without a separate timer.
    if (currentWindow) return { ...previous };
    const continueWindow = sameSpot
        && Number(previous.version || 0) === RISK_WINDOW_VERSION
        && Number(previous.windowFights || 0) < RISK_WINDOW_FIGHTS;
    const base = continueWindow ? previous : {};
    const deaths = Math.max(0, Number(sample.deaths || 0));
    const recoveryWins = deaths ? 0 : Math.min(RISK_WINDOW_FIGHTS,
        (sameSpot ? Number(previous.recoveryWins || 0) : 0) + Math.max(0, Number(sample.wins || 0)));
    const unrecoveredDeaths = recoveryWins >= RISK_WINDOW_FIGHTS ? 0 : Math.min(MIN_DEATHS_AT_SPOT,
        (sameSpot ? Number(previous.unrecoveredDeaths ?? previous.windowDeaths ?? 0) : 0) + deaths);

    const failedHuntRecoveryWins = deaths || sample.failedHunts ? 0 : Math.min(FAILED_HUNT_RECOVERY_WINS,
        (sameSpot ? Number(previous.failedHuntRecoveryWins || 0) : 0) + Math.max(0, Number(sample.wins || 0)));

    return {
        version: RISK_WINDOW_VERSION,
        spotId,
        enteredAt: sameSpot && Number(previous.version || 0) === RISK_WINDOW_VERSION
            ? Number(previous.enteredAt || timestamp)
            : timestamp,
        deathsAtEntry: sameSpot && Number(previous.version || 0) === RISK_WINDOW_VERSION
            ? Number(previous.deathsAtEntry || 0)
            : Math.max(0, Number(sample.totalDeaths || 0)),
        fightsAtEntry: sameSpot && Number(previous.version || 0) === RISK_WINDOW_VERSION
            ? Number(previous.fightsAtEntry || 0)
            : Math.max(0, Number(sample.totalFights || 0)),
        winsAtEntry: sameSpot && Number(previous.version || 0) === RISK_WINDOW_VERSION
            ? Number(previous.winsAtEntry || 0)
            : Math.max(0, Number(sample.totalWins || 0)),
        windowFights: Math.max(0, Number(base.windowFights || 0)) + Math.max(0, Number(sample.fights || 0)),
        windowWins: Math.max(0, Number(base.windowWins || 0)) + Math.max(0, Number(sample.wins || 0)),
        windowDeaths: Math.max(0, Number(base.windowDeaths || 0)) + Math.max(0, Number(sample.deaths || 0)),
        recoveryWins, unrecoveredDeaths,
        failedHuntRecoveryWins,
        // A lucky kill must not erase repeated abandoned fights. Require a
        // short run of clean wins before trusting the same ground again.
        failedHunts: Math.min(MAX_FAILED_HUNTS,
            (sameSpot && failedHuntRecoveryWins < FAILED_HUNT_RECOVERY_WINS && !deaths ? Number(previous.failedHunts || 0) : 0)
            + Math.max(0, Number(sample.failedHunts || 0)))
    };
}

function deathPressure(state = {}, spotId = state.spotId) {
    const expectedSpotId = normalizedSpotId(spotId);
    const risk = state.stats?.spotRisk;
    if (!expectedSpotId || normalizedSpotId(risk?.spotId) !== expectedSpotId) return null;

    if (Number(risk.version || 0) === RISK_WINDOW_VERSION) {
        return pressureForWindow({
            spotId: expectedSpotId,
            fights: risk.windowFights,
            wins: risk.windowWins,
            deaths: risk.windowDeaths,
            unrecoveredDeaths: risk.unrecoveredDeaths,
            failedHunts: risk.failedHunts
        });
    }

    const deaths = Math.max(0, Number(state.stats?.deaths || 0) - Number(risk.deathsAtEntry || 0));
    const fights = Math.max(0, Number(state.stats?.fightsResolved || 0) - Number(risk.fightsAtEntry || 0));
    const deathRate = deaths / Math.max(1, fights);
    if (deaths < MIN_DEATHS_AT_SPOT || deathRate < MIN_DEATH_RATE) return null;
    return { spotId: expectedSpotId, deaths, fights, deathRate };
}

function recoveryFor(state = {}) {
    if (state.party?.partyId || state.partyId) return null;
    if (state.stats?.huntingRecovery) return state.stats.huntingRecovery;
    // Adopt a persisted failed visit on the first routing pass after upgrade.
    const deaths = Number(state.stats?.spotRisk?.unrecoveredDeaths ?? state.stats?.spotRisk?.windowDeaths ?? 0);
    if (!deaths && !deathPressure(state)) return null;
    return { levelPenalty: Math.min(6, Math.max(2, deaths * 2)), cleanWins: 0,
        resumeExp: Math.max(Number(state.exp || 0), Number(state.stats?.deathExperience?.expBeforeDeath || 0)) };
}

function recordRecovery(state, { deaths = 0, wins = 0, exp, expBeforeDeath, pressure } = {}) {
    let recovery = recoveryFor(state);
    if (deaths || pressure) {
        recovery = { levelPenalty: Math.min(6, Math.max(2, Number(recovery?.levelPenalty || 0) + (deaths ? 2 : 0))),
            cleanWins: 0, resumeExp: Math.max(Number(recovery?.resumeExp || 0), Number(expBeforeDeath ?? state.exp ?? 0)) };
    } else if (recovery?.levelPenalty > 0) {
        recovery = { ...recovery, cleanWins: Math.min(RISK_WINDOW_FIGHTS, Number(recovery.cleanWins || 0) + wins) };
        if (recovery.cleanWins >= RISK_WINDOW_FIGHTS && exp >= recovery.resumeExp) {
            recovery = { ...recovery, levelPenalty: Math.max(0, recovery.levelPenalty - 2), cleanWins: 0 };
        }
    }
    return recovery;
}

function activeBackoffs(state = {}, timestamp = Date.now()) {
    return (Array.isArray(state.stats?.spotBackoffs) ? state.stats.spotBackoffs : [])
        .filter((entry) => normalizedSpotId(entry?.spotId) && Number(entry.until || 0) > timestamp)
        .map((entry) => ({
            ...entry,
            spotId: normalizedSpotId(entry.spotId),
            until: Number(entry.until)
        }));
}

function backoffForStates(states = [], spotId, timestamp = Date.now()) {
    const expectedSpotId = normalizedSpotId(spotId);
    if (!expectedSpotId) return null;

    const stored = (states || []).flatMap((state) => activeBackoffs(state, timestamp))
        .filter((entry) => entry.spotId === expectedSpotId)
        .sort((left, right) => Number(right.until) - Number(left.until))[0];
    if (stored) return stored;

    const pressures = (states || [])
        .map((state) => deathPressure(state, expectedSpotId))
        .filter(Boolean)
        .sort((left, right) => right.deathRate - left.deathRate || right.deaths - left.deaths);
    const pressure = pressures[0];
    if (!pressure) return null;
    return {
        ...pressure,
        reason: pressure.reason || 'death_pressure',
        startedAt: timestamp,
        until: timestamp + BACKOFF_MS
    };
}

function excludedSpotIdsForStates(states = [], timestamp = Date.now()) {
    const excluded = new Set();
    (states || []).forEach((state) => {
        activeBackoffs(state, timestamp).forEach((entry) => excluded.add(entry.spotId));
        (state.stats?.capacityBackoffs || []).filter(entry => Number(entry.until) > timestamp)
            .forEach(entry => excluded.add(String(entry.spotId)));
        const avoid = state.stats?.coldCompetition?.avoid;
        if (normalizedSpotId(avoid?.spotId) && Number(avoid.until) > timestamp) excluded.add(normalizedSpotId(avoid.spotId));
        const pressure = deathPressure(state);
        if (pressure) excluded.add(pressure.spotId);
    });
    return excluded;
}

function withCapacityBackoff(state, spotId, timestamp = Date.now()) {
    const retained = (state.stats?.capacityBackoffs || [])
        .filter(entry => entry.until > timestamp && String(entry.spotId) !== String(spotId));
    return { ...state, stats: { ...state.stats,
        lastReason: 'route_capacity_full',
        capacityBackoffs: [...retained, { spotId: String(spotId), until: timestamp + CAPACITY_BACKOFF_MS }]
            .slice(-MAX_BACKOFFS)
    } };
}

function withBackoff(state = {}, backoff = null, timestamp = Date.now()) {
    const spotId = normalizedSpotId(backoff?.spotId);
    if (!spotId) return state;

    const prior = (Array.isArray(state.stats?.spotBackoffs) ? state.stats.spotBackoffs : [])
        .filter((entry) => normalizedSpotId(entry?.spotId) === spotId)
        .sort((left, right) => Number(right.startedAt || 0) - Number(left.startedAt || 0))[0];
    const continuing = prior
        && Number(prior.until || 0) > timestamp
        && Number(prior.startedAt || 0) === Number(backoff.startedAt || 0);
    const priorAttempts = prior ? Math.max(1, Number(prior.attempts || 1)) : 0;
    const attempts = continuing
        ? priorAttempts
        : Math.max(1, priorAttempts + 1);
    const escalationMs = Math.min(MAX_BACKOFF_MS, BACKOFF_MS * (2 ** Math.min(3, attempts - 1)));
    const retained = activeBackoffs(state, timestamp)
        .filter((entry) => entry.spotId !== spotId);
    const next = {
        ...backoff,
        spotId,
        reason: backoff.reason || 'death_pressure',
        attempts,
        startedAt: Number(backoff.startedAt || timestamp),
        until: Math.min(
            timestamp + MAX_BACKOFF_MS,
            Math.max(timestamp + escalationMs, Number(backoff.until || 0))
        )
    };
    const spotBackoffs = [...retained, next]
        .sort((left, right) => Number(right.until) - Number(left.until))
        .slice(0, MAX_BACKOFFS);
    return {
        ...state,
        stats: {
            ...(state.stats || {}),
            spotBackoffs
        }
    };
}

module.exports = {
    MIN_DEATHS_AT_SPOT,
    MIN_DEATH_RATE,
    RISK_WINDOW_VERSION,
    RISK_WINDOW_FIGHTS,
    MAX_LOW_WIN_RATE,
    BACKOFF_MS,
    MAX_BACKOFF_MS,
    MAX_BACKOFFS,
    CAPACITY_BACKOFF_MS,
    MAX_FAILED_HUNTS,
    FAILED_HUNT_RECOVERY_WINS,
    withCapacityBackoff,
    recordResolve,
    recoveryFor,
    recordRecovery,
    deathPressure,
    activeBackoffs,
    backoffForStates,
    excludedSpotIdsForStates,
    withBackoff
};
