const ServerResponse = invoke('GameServer/Network/Response');
const World          = invoke('GameServer/World/World');

function pickupExec(session, actor, data, onComplete, canContinue = () => true) {
    const generation = actor?.automation?.pickupGeneration;
    const isCurrent = () => actor && session?.actor === actor &&
        actor.automation?.pickupGeneration === generation &&
        !actor.isDead?.() && actor.fetchIsOnline?.() !== false && canContinue();
    World.fetchItem(data.id).then((item) => {
        if (!isCurrent()) { onComplete?.(); return; }
        const scheduled = actor.automation.schedulePickup(session, actor, item, () => {
            if (!isCurrent()) { onComplete?.(); return; }
            // C4 clears the client's pending Action before the pickup animation.
            session.dataSendToMe(ServerResponse.actionFailed());
            session.dataSendToMeAndOthers(ServerResponse.stopMove(actor.fetchId(), {
                locX: actor.fetchLocX(), locY: actor.fetchLocY(), locZ: actor.fetchLocZ(),
                head: actor.fetchHead()
            }), actor);
            session.dataSendToMeAndOthers(ServerResponse.pickupItem(actor.fetchId(), item), actor);
            // Lisvus awards on arrival; GetItem's client animation does not
            // impose a server-side pickup cooldown.
            World.pickupItem(session, actor, item);
            onComplete?.();
        });
        if (scheduled === false) {
            session.dataSendToMe(ServerResponse.actionFailed());
            onComplete?.();
        }
    }).catch((err) => {
        if (isCurrent()) session.dataSendToMe(ServerResponse.actionFailed());
        utils.infoWarn(
            'GameServer',
            'Pickup failed actor=%s item=%s error=%s',
            actor?.fetchName?.() || actor?.fetchId?.() || 'unknown',
            data?.id || 'unknown',
            err?.message || String(err)
        );
        onComplete?.();
    });
}

module.exports = pickupExec;
