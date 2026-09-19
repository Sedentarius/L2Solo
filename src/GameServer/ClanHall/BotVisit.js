const Runtime = require('./Runtime');
const Services = require('./Services');
const Approach = invoke('GameServer/Bot/AI/TownNpcApproach');
const Navigation = invoke('GameServer/Bot/AI/CompanionNavigationRecovery');
const RETRY_MS = 300000;
const VISIT_MS = 180000;

function duty(session) {
    const stats = session.coldLifeState?.stats || {};
    return (
        session.clanAllianceQuest ||
        session.clanAllianceSupportLeaderId ||
        stats.clanPartyObjective ||
        stats.equipmentPlan?.clanGoal ||
        stats.supplyErrand
    );
}
function safe(session, actor) {
    return (
        !actor.isDead?.() &&
        !actor.state?.fetchDead?.() &&
        !actor.state?.fetchCombats?.() &&
        !actor.state?.fetchHits?.() &&
        !actor.state?.fetchCasts?.() &&
        !session.pvpDefense &&
        !session.currentTargetId &&
        !session.incomingThreatId &&
        !duty(session) &&
        Number(actor.fetchKarma?.() || 0) === 0
    );
}
function local(actor, hall) {
    const p = Services.point(actor);
    const town = invoke('GameServer/World/TownRespawn').getClosestTown(p.locX, p.locY, p.locZ);
    return (
        Runtime.Policy.inside(hall, actor) ||
        (town?.name === hall.town && Math.hypot(p.locX - hall.spawn.locX, p.locY - hall.spawn.locY) <= 7500)
    );
}
function finish(session, actor, retryAt) {
    session.clanHallVisit = null;
    session.clanHallRetryAt = retryAt;
    if (session.coldLifeState?.stats) {
        session.coldLifeState.stats.clanHallVisit = null;
        session.coldLifeState.stats.clanHallRetryAt = retryAt;
        session.coldLifeState.stats.travel = null;
    }
    Approach.reset(session);
    Navigation.clear(session);
    if (actor.state?.fetchSeated?.()) {
        actor.state.setSeated(false);
        session.dataSendToOthers?.(invoke('GameServer/Network/Response').sitAndStand(actor), actor);
    }
}
function tick(session, actor, timestamp = Date.now()) {
    if (session.clanHallVisit === undefined)
        session.clanHallVisit = session.coldLifeState?.stats?.clanHallVisit || null;
    const visit = session.clanHallVisit;
    const hall = Runtime.forActor(actor);
    const npc = Services.manager(hall);
    const grouped = !!(session.followPlayerSession || session.partyCompanion || session.hotBackgroundPartyId);
    if (
        !safe(session, actor) ||
        !Services.available(hall, timestamp) ||
        !npc ||
        (visit && (visit.hallId !== hall.id || timestamp >= visit.expiresAt)) ||
        (grouped && !Services.near(actor, npc))
    ) {
        if (visit) finish(session, actor, timestamp + RETRY_MS);
        return false;
    }
    if (!visit) {
        if (
            !['hunting', 'resting', 'following'].includes(session.plan) ||
            timestamp < Number(session.clanHallRetryAt ?? session.coldLifeState?.stats?.clanHallRetryAt ?? 0) ||
            !local(actor, hall)
        )
            return false;
        if (!Services.missing(actor, hall, timestamp).length && !Services.recovery(actor, hall)) return false;
        session.clanHallVisit = { hallId: hall.id, startedAt: timestamp, expiresAt: timestamp + VISIT_MS };
        actor.automation?.abortAll?.(actor);
        actor.unselect?.();
    }
    session.roleDecision = {
        ...(session.roleDecision || {}),
        action: 'refresh_buffs',
        reason: 'clan_hall_services',
        at: timestamp
    };
    if (!Services.near(actor, npc)) {
        const target = {
            ...Services.point(npc),
            npcSelfId: npc.fetchSelfId(),
            actorId: npc.fetchId(),
            head: npc.fetchHead?.(),
            name: npc.fetchName?.() || 'Clan Hall Manager',
            town: hall.town
        };
        const approach = Approach.plan(session, actor, target, 'clan_hall');
        if (approach?.waiting) return true;
        const route = Navigation.move(session, actor, approach?.destination || target, 'clan_hall', {
            targetActor: null,
            arrivalRadius: approach?.arrivalRadius ?? 100
        });
        if (route.status === 'exhausted') {
            finish(session, actor, timestamp + RETRY_MS);
            return false;
        }
        return true;
    }
    Approach.reset(session);
    Navigation.clear(session);
    const skill = Services.missing(actor, hall, timestamp)[0];
    if (skill) {
        if (timestamp < Number(session.clanHallVisit.nextCastAt || 0)) return true;
        const result = Services.cast(session, actor, npc, skill.fetchSelfId(), timestamp);
        session.clanHallVisit.nextCastAt = timestamp + (result.ok ? 1500 : 5000);
        if (!result.ok && result.code !== 'manager_needs_mp') finish(session, actor, timestamp + RETRY_MS);
        return true;
    }
    if (!grouped && Runtime.Policy.inside(hall, actor) && Services.recovery(actor, hall)) {
        if (!actor.state?.fetchSeated?.()) {
            actor.state.setSeated(true);
            session.dataSendToOthers?.(invoke('GameServer/Network/Response').sitAndStand(actor), actor);
        }
        actor.automation?.replenishVitals?.(actor);
        return true;
    }
    finish(session, actor, timestamp + 60000);
    if (!grouped) {
        session.plan = 'hunting';
        session.currentSpot = null;
        session.pendingFarmDepartureAnnouncement = true;
    }
    return false;
}
module.exports = { RETRY_MS, VISIT_MS, safe, local, tick, finish };
