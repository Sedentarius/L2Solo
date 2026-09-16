const DataCache = invoke('GameServer/DataCache');
const ProgressionCap = invoke('GameServer/Progression/ProgressionCap');
const Database = invoke('Database');

const LUCKY_SKILL_ID = 194;
const pendingWrites = new Map();

function subjectValue(subject, getter, key, fallback = 0) {
    if (typeof subject?.[getter] === 'function') return Number(subject[getter]()) || fallback;
    return Number(subject?.[key]) || fallback;
}

function hasLuckyProtection(actor, level) {
    if (level > 4) return false;
    const skills = actor?.skillset?.fetchSkills?.() || actor?.skills || [];
    return skills.some((skill) => Number(skill?.fetchSelfId?.() ?? skill?.selfId) === LUCKY_SKILL_ID);
}

function noPenaltyReason(actor, context, level) {
    if (context.noPenalty) return context.reason || 'explicit_no_penalty';
    if (context.arena || context.event || context.duel) return context.arena ? 'arena' : context.event ? 'event' : 'duel';
    if (hasLuckyProtection(actor, level) || context.lucky) return 'lucky';
    if (context.pvpZone && context.killerPlayable && !context.siegeZone) return 'pvp_zone';
    if (context.siegeZone && context.siegeParticipant
        && (context.killerPlayable || context.killerSiegeNpc)) return 'siege_participant';
    return null;
}

function levelInterval(level, table = DataCache.experience, maxLevel = ProgressionCap.maxLevel()) {
    if (!Array.isArray(table) || table.length <= level) throw new Error(`Experience interval unavailable for level ${level}`);
    if (level >= maxLevel) {
        return Math.max(0, Number(table[maxLevel - 1]) - Number(table[maxLevel - 2]));
    }
    return Math.max(0, Number(table[level]) - Number(table[level - 1]));
}

function calculateLoss(actor, context = {}, table = DataCache.experience) {
    const level = Math.max(1, subjectValue(actor, 'fetchLevel', 'level', 1));
    const expBeforeDeath = Math.max(0, subjectValue(actor, 'fetchExp', 'exp'));
    const reason = noPenaltyReason(actor, context, level);
    if (reason) return { eligible: false, reason, level, percent: 0, expBeforeDeath, expLost: 0, expAfterDeath: expBeforeDeath };

    let percent = Math.max(0, 6.5 - (0.07 * level));
    if (context.clanWar || context.festival) percent /= 4;
    const calculatedLoss = Math.round(levelInterval(level, table) * percent / 100);
    const expAfterDeath = Math.max(0, expBeforeDeath - calculatedLoss);
    const expLost = expBeforeDeath - expAfterDeath;
    return {
        eligible: expLost > 0,
        reason: expLost > 0 ? 'c4_death_penalty' : 'no_experience_to_lose',
        level,
        percent,
        expBeforeDeath,
        expLost,
        expAfterDeath
    };
}

function calculateRestoration(actor, deathRecord, context = {}) {
    if (!deathRecord || deathRecord.pendingRestoration === false || Number(deathRecord.pendingRestoration) === 0) {
        return { eligible: false, restoredExp: 0, reason: 'no_pending_death' };
    }
    const restorePercent = Math.max(0, Math.min(100, Number(context.restoreExpPercent) || 0));
    const currentExp = Math.max(0, subjectValue(actor, 'fetchExp', 'exp'));
    const expLost = Math.max(0, Number(deathRecord.expLost) || 0);
    const restoredExp = Math.min(expLost, Math.round(expLost * restorePercent / 100));
    const totalExp = Math.min(Number(deathRecord.expBeforeDeath), currentExp + restoredExp);
    return {
        eligible: true,
        restorePercent,
        restoredExp: Math.max(0, totalExp - currentExp),
        totalExp,
        level: ProgressionCap.levelForExperience(totalExp, subjectValue(actor, 'fetchLevel', 'level', 1))
    };
}

function databaseReady() {
    return typeof Database.isReady !== 'function' || Database.isReady();
}

function queue(characterId, work) {
    if (!characterId || !databaseReady()) return Promise.resolve(null);
    const previous = pendingWrites.get(characterId) || Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    pendingWrites.set(characterId, next);
    next.catch((error) => utils.infoWarn('DeathEXP', 'persistence failed for %s: %s', characterId, error.message));
    next.finally(() => {
        if (pendingWrites.get(characterId) === next) pendingWrites.delete(characterId);
    }).catch(() => {});
    return next;
}

function synchronizeActor(session, actor, exp, level) {
    actor.setExpSp?.(exp, subjectValue(actor, 'fetchSp', 'sp'));
    actor.setLevel?.(level);
    if (actor.model && session) {
        invoke('GameServer/Actor/Generics/CalculateStats')(session, actor);
        const response = invoke('GameServer/Network/Response');
        session.dataSendToMe?.(response.userInfo(actor));
    }
}

function deathContext(context = {}) {
    return Object.fromEntries(Object.entries(context).filter(([, value]) =>
        value === null || ['string', 'number', 'boolean'].includes(typeof value)));
}

function applyDeathPenalty(session, actor, context = {}) {
    if (actor?.deathExperience?.pendingRestoration) {
        return { ...actor.deathExperience, duplicate: true, persistence: flush(actor.fetchId?.()) };
    }
    const result = calculateLoss(actor, context);
    const characterId = Number(actor?.fetchId?.() || actor?.characterId || 0);
    const appliedAt = Number(context.timestamp || Date.now());
    if (!result.eligible) {
        actor.deathExperience = null;
        const persistence = queue(characterId, () => Database.clearCharacterDeathExperience(characterId, result.reason, appliedAt));
        return { ...result, duplicate: false, persistence };
    }
    const level = ProgressionCap.levelForExperience(result.expAfterDeath, result.level);
    const record = {
        characterId,
        level,
        expBeforeDeath: result.expBeforeDeath,
        expLost: result.expLost,
        expAfterDeath: result.expAfterDeath,
        deathContext: deathContext(context),
        penaltyAppliedAt: appliedAt,
        pendingRestoration: true
    };
    actor.deathExperience = record;
    synchronizeActor(session, actor, record.expAfterDeath, level);
    const persistence = queue(characterId, () => Database.applyCharacterDeathExperience(record));
    return { ...result, levelAfterDeath: level, duplicate: false, deathRecord: record, persistence };
}

function restoreFromResurrection(session, actor, context = {}) {
    const characterId = Number(actor?.fetchId?.() || actor?.characterId || 0);
    const local = actor?.deathExperience;
    if (local?.pendingRestoration) {
        const result = calculateRestoration(actor, local, context);
        local.pendingRestoration = false;
        local.resolutionReason = 'resurrection';
        if (result.eligible) synchronizeActor(session, actor, result.totalExp, result.level);
        result.persistence = queue(characterId, () => Database.restoreCharacterDeathExperience(
            characterId, result.restorePercent, Number(context.timestamp || Date.now())));
        return result;
    }
    if (local) {
        return { eligible: false, restoredExp: 0, reason: 'no_pending_death', persistence: Promise.resolve(null) };
    }
    if (!characterId || !databaseReady()) return { eligible: false, restoredExp: 0, reason: 'no_pending_death', persistence: Promise.resolve(null) };
    const persistence = queue(characterId, () => Database.restoreCharacterDeathExperience(
        characterId, context.restoreExpPercent, Number(context.timestamp || Date.now()))).then((record) => {
        if (!record) return null;
        actor.deathExperience = { ...record, pendingRestoration: false };
        synchronizeActor(session, actor, record.totalExp, record.level);
        return record;
    });
    return { eligible: true, restoredExp: null, pendingLoad: true, persistence };
}

function clearPendingRestoration(characterOrId, reason = 'invalidated', timestamp = Date.now()) {
    const actor = typeof characterOrId === 'object' ? characterOrId : null;
    const characterId = Number(actor?.fetchId?.() || actor?.characterId || characterOrId || 0);
    if (actor?.deathExperience) {
        actor.deathExperience.pendingRestoration = false;
        actor.deathExperience.resolutionReason = reason;
    }
    return queue(characterId, () => Database.clearCharacterDeathExperience(characterId, reason, timestamp));
}

function applyColdDeath(state, context = {}) {
    const current = state?.stats?.deathExperience;
    if (current?.pendingRestoration) return { state, result: { ...current, duplicate: true } };
    const result = calculateLoss(state, context);
    if (!result.eligible) return { state, result };
    const record = {
        expBeforeDeath: result.expBeforeDeath,
        expLost: result.expLost,
        expAfterDeath: result.expAfterDeath,
        penaltyAppliedAt: Number(context.timestamp || Date.now()),
        pendingRestoration: true,
        deathContext: deathContext(context)
    };
    return {
        state: {
            ...state,
            exp: result.expAfterDeath,
            level: ProgressionCap.levelForExperience(result.expAfterDeath, result.level),
            stats: { ...(state.stats || {}), deathExperience: record }
        },
        result: { ...result, deathRecord: record }
    };
}

function restoreCold(state, context = {}) {
    const record = state?.stats?.deathExperience;
    const result = calculateRestoration(state, record, context);
    if (!result.eligible) return { state, result };
    return {
        state: {
            ...state,
            exp: result.totalExp,
            level: result.level,
            stats: { ...(state.stats || {}), deathExperience: {
                ...record, pendingRestoration: false, resolutionReason: 'resurrection'
            } }
        },
        result
    };
}

function flush(characterId) {
    return pendingWrites.get(Number(characterId)) || Promise.resolve(null);
}

module.exports = {
    calculateLoss,
    calculateRestoration,
    applyDeathPenalty,
    restoreFromResurrection,
    clearPendingRestoration,
    applyColdDeath,
    restoreCold,
    levelInterval,
    flush
};
