function pickupRequest(session, actor, data) {
    const Generics = invoke(path.actor);

    if (actor.isDead()) {
        session.dataSendToMe(invoke('GameServer/Network/Response').actionFailed());
        return;
    }

    if (actor.isBlocked()) {
        session.dataSendToMe(invoke('GameServer/Network/Response').actionFailed());
        Generics.queueRequest(session, actor, 'pickup', data);
        return;
    }

    if (actor.state.fetchTowards() === 'pickup' && actor.automation.pickupTargetId === data.id) return;

    Generics.clearStoredActions(session, actor);
    Generics.stopAutomation(session, actor);
    // StopMove is not a position handshake. Start immediately and allow a
    // new item request to replace an in-flight pickup approach.
    Generics.pickupExec(session, actor, data);
}

module.exports = pickupRequest;
