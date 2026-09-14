const Geo = invoke('GameServer/Geodata/GeodataEngine');
const Restrictions = invoke('GameServer/Effects/EffectRestrictions');
const Responses = invoke('GameServer/Network/Response');

// Contact planes measured at the five reported transitions. Normals point
// into the building / uphill. These are deliberately not global unstuck rules.
const transitions = [
    { id: 'aden-accessory-west', x: 146309.5, y: 28244, z: -2259, nx: -1, ny: 0, width: 30 },
    { id: 'aden-accessory-south', x: 146668, y: 28730.6, z: -2259, nx: 0, ny: 1, width: 30 },
    { id: 'aden-grocery-south', x: 148240, y: 28731.6, z: -2259, nx: 0, ny: 1, width: 30 },
    { id: 'aden-grocery-east', x: 148603.5, y: 28244, z: -2259, nx: 1, ny: 0, width: 30 },
    // 275-unit mesh edge, centred at its midpoint and offset outward by
    // the player's radius. Leave about 12 units of margin at either end.
    { id: 'hunters-stair', x: 116134.58, y: 75619.87, z: -2712, nx: -0.6213, ny: -0.7836, width: 125 }
];
const depth = (t, p) => (p.locX - t.x) * t.nx + (p.locY - t.y) * t.ny;
const lateral = (t, p) => -(p.locX - t.x) * t.ny + (p.locY - t.y) * t.nx;
const near = (t, p) => Math.abs(depth(t, p)) <= 6 && Math.abs(lateral(t, p)) <= t.width && Math.abs(p.locZ - t.z) <= 24;
const position = actor => ({ locX: actor.fetchLocX(), locY: actor.fetchLocY(), locZ: actor.fetchLocZ() });
function eligible(session) {
    const a = session.actor;
    return a && typeof a.fetchLocX === 'function' && typeof a.automation?.abortAll === 'function'
        && session.constructor?.name !== 'BotSession' && !session.accountId?.startsWith('bot_')
        && !a.isDead?.() && !a.isBlocked?.() && Restrictions.canMove(a)
        && !a.isFlying?.() && !a.stateWater && !a.boatId && !a.boat
        && !a.fetchBoatId?.() && !a.fetchBoat?.() && !(a.fallingUntil > Date.now());
}
function cancel(session) {
    if (!session) return;
    clearTimeout(session.transitionAttempt?.timer);
    session.transitionAttempt = null;
}
function crossing(t, from, to, plane = 0) {
    const start = depth(t, from), end = depth(t, to);
    if (end <= start || start > plane || end < plane) return null;
    const ratio = (plane - start) / (end - start);
    return { locX: from.locX + (to.locX - from.locX) * ratio,
        locY: from.locY + (to.locY - from.locY) * ratio, locZ: from.locZ };
}
function schedule(session, p, now) {
    const attempt = session.transitionAttempt;
    clearTimeout(attempt.timer);
    const t = attempt.transition;
    // Predict only the short, geodata-clear final approach. New reports replace
    // this estimate; other actions invalidate it via moveRouteGeneration.
    if (depth(t, p) < -200 || depth(t, p) >= -4) return;
    const speed = Number(session.actor.fetchCollectiveRunSpd?.());
    if (!(speed > 0 && speed <= 500)) return;
    const entry = crossing(t, p, attempt.to, -4);
    if (!entry || Math.abs(lateral(t, entry)) > t.width) return;
    if (!Geo.hasGeo(p.locX, p.locY) || !Geo.hasGeo(entry.locX, entry.locY)) return;
    entry.locZ = Geo.getCellData(entry.locX, entry.locY, p.locZ).z;
    if (Math.abs(entry.locZ - p.locZ) > 64 || !Geo.hasLineOfSight(p.locX, p.locY, p.locZ, entry.locX, entry.locY, entry.locZ)) return;
    const delay = Math.ceil(Math.hypot(entry.locX - p.locX, entry.locY - p.locY) / speed * 1000);
    if (delay > 2000) return;
    attempt.timer = setTimeout(() => {
        if (session.transitionAttempt !== attempt || session.actor !== attempt.actor
            || session.moveRouteGeneration !== attempt.generation || !eligible(session)
            || session.socket?.destroyed || session.actor.fetchIsOnline?.() === false) return;
        if (Number(session.actor.fetchCollectiveRunSpd?.()) !== speed || Date.now() - now > delay + 300) return;
        observe(session, entry);
    }, delay);
    attempt.timer.unref?.();
}
function stale(session, p, now) {
    const r = session.transitionRecovery;
    return r && r.actor === session.actor && now - r.at < 600
        && Math.hypot(session.actor.fetchLocX() - r.loc.locX, session.actor.fetchLocY() - r.loc.locY) <= 64
        && Math.abs(session.actor.fetchLocZ() - r.loc.locZ) <= 64
        && depth(r.transition, p) < 12 && Math.abs(lateral(r.transition, p)) <= r.transition.width
        && Math.abs(p.locZ - r.loc.locZ) <= 64
        && Math.hypot(p.locX - r.loc.locX, p.locY - r.loc.locY) <= 64;
}
function source(session, p, now = Date.now()) {
    return stale(session, p, now) ? position(session.actor) : p;
}
function command(session, coords, now = Date.now()) {
    if (!eligible(session)) return cancel(session);
    const t = transitions.find(t => depth(t, coords.from) >= -2000 && depth(t, coords.from) <= 6
        && Math.abs(coords.from.locZ - t.z) <= 64 && depth(t, coords.to) >= 32
        && Math.abs(lateral(t, crossing(t, coords.from, coords.to, Math.max(0, depth(t, coords.from))) || coords.from)) <= t.width);
    if (!t) return cancel(session);
    cancel(session);
    session.transitionAttempt = {
        actor: session.actor, transition: t, to: { ...coords.to }, at: now,
        generation: session.moveRouteGeneration
    };
    observe(session, coords.from, now);
}
function observe(session, p, now = Date.now()) {
    if (stale(session, p, now)) return true;
    const a = session.actor, attempt = session.transitionAttempt;
    if (!attempt) return false;
    if (!eligible(session) || attempt.actor !== a || attempt.generation !== session.moveRouteGeneration
        || now - attempt.at > 15000) {
        cancel(session);
        return false;
    }
    if (!near(attempt.transition, p)) {
        const entry = crossing(attempt.transition, p, attempt.to);
        if (!entry || Math.abs(lateral(attempt.transition, entry)) > attempt.transition.width) cancel(session);
        else schedule(session, p, now);
        return false;
    }
    const t = attempt.transition;
    if (now - (session.transitionRecovery?.at ?? -Infinity) < 3000) return false;
    if (Math.hypot(a.fetchLocX() - p.locX, a.fetchLocY() - p.locY) > 256
        || Math.abs(a.fetchLocZ() - p.locZ) > 96) return false;
    const distance = 32 - depth(t, p);
    const loc = { locX: Math.round(p.locX + t.nx * distance), locY: Math.round(p.locY + t.ny * distance), locZ: p.locZ, head: a.fetchHead?.() || 0 };
    if (!Geo.hasGeo(p.locX, p.locY) || !Geo.hasGeo(loc.locX, loc.locY)) return false;
    loc.locZ = Geo.getCellData(loc.locX, loc.locY, p.locZ).z;
    if (Math.abs(loc.locZ - p.locZ) > 64 || !Geo.hasLineOfSight(p.locX, p.locY, p.locZ, loc.locX, loc.locY, loc.locZ)) return false;
    // No long-distance teleport lifecycle: this is a local correction, with
    // immediate authoritative position and no pet/party travel or 1s delay.
    cancel(session);
    a.automation.abortAll(a);
    session.transitionRecovery = { actor: a, transition: t, at: now, loc: { ...loc } };
    a.updatePosition(loc);
    session.dataSendToMeAndOthers(Responses.validateLocation(a.fetchId(), loc), a);
    session.dataSendToMeAndOthers(Responses.moveToLocation(a.fetchId(), { from: loc, to: attempt.to }), a);
    return true;
}
module.exports = { command, observe, source, cancel, transitions };
