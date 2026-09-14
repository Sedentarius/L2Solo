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
            session.dataSendToMeAndOthers(ServerResponse.pickupItem(actor.fetchId(), item), actor);
            // Lisvus awards on arrival; GetItem's client animation does not
            // impose a server-side pickup cooldown.
            World.pickupItem(session, actor, item);
            onComplete?.();
        });
        if (scheduled === false) onComplete?.();
    }).catch((err) => {
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
