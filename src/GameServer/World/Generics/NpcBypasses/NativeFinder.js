module.exports = function nativeFinder(session, parts) {
    if (!session?.actor) return;
    const Menu = invoke('GameServer/World/Generics/NpcBypasses/BotParty');
    const action = parts[1];
    if (action === 'open') {
        session.nativeFinderVersion = parts[2] === '1' ? 1 : 0;
        session.nativeFinderOpen = session.nativeFinderVersion === 1;
        if (session.nativeFinderOpen) Menu.renderNative(session, true);
        else Menu.open(session);
        return;
    }
    if (session.nativeFinderVersion !== 1) return;
    if (action === 'close') { session.nativeFinderOpen = false; return; }
    if (!session.nativeFinderOpen) return;
    const state = Menu.nativeState(session);
    if (action === 'filter') {
        const level = parts[3]; const role = parts[4];
        if (level !== 'all' && !Menu.LEVEL_RANGES.some((r) => r.key === level)) return;
        if (!['all', 'spoiler', ...Menu.ROLE_FILTERS.map((r) => r.key)].includes(role)) return;
        state.query = parts[2] === '-' ? '' : Menu.searchText(parts[2]);
        state.level = level; state.role = role; state.page = 0;
    } else if (action === 'page') {
        if (!/^\d{1,6}$/.test(parts[2] || '')) return;
        state.page = Number(parts[2]);
    } else if (action === 'invite') {
        const name = parts[2];
        if (!session.nativeFinderVisible?.includes(name) || session.nativeFinderInviting) return;
        const World = invoke('GameServer/World/World');
        const actor = session.actor;
        const operation = session.nativeFinderInviting = {};
        const current = () => session.actor === actor && session.nativeFinderInviting === operation;
        // Await cold activation too. The response describes the resulting state,
        // not a stale snapshot taken before inviteBotByName completes.
        return Promise.resolve().then(() => current() && World.inviteBotByName(session, actor, name, undefined, 'botparty'))
            .then((accepted) => {
                if (current()) Menu.renderNative(session, false, accepted ? 'Invitation processed.' : 'Invitation declined or unavailable.');
            }).catch(() => {
                if (current()) Menu.renderNative(session, false, 'Invitation failed. Please refresh.');
            }).finally(() => { if (session.nativeFinderInviting === operation) session.nativeFinderInviting = false; });
    } else if (action !== 'refresh') return;
    Menu.renderNative(session);
};
