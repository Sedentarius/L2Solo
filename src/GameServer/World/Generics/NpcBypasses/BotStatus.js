const BotManager = invoke('GameServer/Bot/BotManager');

function botStatus(session, parts) {
    const name = parts[1];
    const actor = session.actor;
    if (!actor) return;
    const selected = !name && actor.fetchDestId?.() ? BotManager.findSessionById(actor.fetchDestId()) : null;
    const request = session.botStatusRequest = (session.botStatusRequest || 0) + 1;
    const revision = session.nativeStatusRevision = (session.nativeStatusRevision || 0) + 1;
    const current = () => session.actor === actor && session.botStatusRequest === request && session.nativeStatusRevision === revision;
    const show = (target, saved = null) => {
        if (!current()) return;
        session.botStatusName = target?.actor?.fetchName() || saved?.name || saved?.characterName || name || '';
        if (session.nativeStatusVersion === 1) return invoke('GameServer/World/Generics/NpcBypasses/NativeStatus').open(session, session.botStatusName);
        if (saved) return BotManager.renderColdBotStatusPanel(session, saved);
        return BotManager.renderBotStatusPanel(session, target);
    };
    let targetSession = null;

    if (name) {
        targetSession = BotManager.findSessionByName(name);
        if (!targetSession) {
            const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
            return LifeState.findByName(name).then((coldState) => {
                if (!current()) return;
                const active = BotManager.findSessionByName(name);
                if (active || coldState) return show(active, active ? null : coldState);
                const SystemMessage = invoke('GameServer/Network/Response/SystemMessage');
                session.dataSendToMe(SystemMessage.text(`Bot "${String(name).slice(0, 32)}" not found.`));
            });
        }
    } else if (selected) {
        targetSession = selected;
    }

    return show(targetSession);
}

module.exports = botStatus;
