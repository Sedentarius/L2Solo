const ServerResponse = invoke('GameServer/Network/Response');
const World          = invoke('GameServer/World/World');

function pickupExec(session, actor, data, onComplete, canContinue = () => true) {
    const isCurrent = () => actor && session?.actor === actor &&
        !actor.isDead?.() && actor.fetchIsOnline?.() !== false && canContinue();
    World.fetchItem(data.id).then((item) => {
        if (!isCurrent()) { onComplete?.(); return; }
        actor.automation.schedulePickup(session, actor, item, () => {
            if (!isCurrent()) { onComplete?.(); return; }
            actor.state.setPickinUp(true);
            session.dataSendToMeAndOthers(ServerResponse.pickupItem(actor.fetchId(), item), actor);

            setTimeout(() => {
                if (isCurrent()) World.pickupItem(session, actor, item);
            }, 250);

            setTimeout(() => {
                // A cancelled party attempt must not clear a newer native
                // action's state. Its owner already reset the pickup flag.
                if (isCurrent()) actor.state.setPickinUp(false);
                onComplete?.();
            }, 500);
        });
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
