module.exports = async function nativeFriends(session, parts) {
    if (!session?.actor) return;
    const Menu = invoke('GameServer/World/Generics/NpcBypasses/BotFriends');
    const Friends = invoke('GameServer/Bot/AI/BotFriendship');
    const action = parts[1];
    if (action === 'open') {
        session.nativeFriendsVersion = parts[2] === '1' ? 1 : 0;
        session.nativeFriendsOpen = session.nativeFriendsVersion === 1;
        session.nativeFriendsRevision = (session.nativeFriendsRevision || 0) + 1;
        if (session.nativeFriendsOpen) return Menu.renderNative(session, true);
        return Menu.render(session, session.botFriendsView?.mode || 'friends');
    }
    if (session.nativeFriendsVersion !== 1) return;
    if (action === 'close') { session.nativeFriendsOpen = false; session.nativeFriendsRevision = (session.nativeFriendsRevision || 0) + 1; return; }
    if (!session.nativeFriendsOpen || session.nativeFriendsBusy) return;
    const view = session.botFriendsView ||= { mode: 'friends', page: 0 };
    if (action === 'tab') {
        if (!['friends', 'add'].includes(parts[2])) return;
        view.mode = parts[2]; view.page = 0;
        return Menu.renderNative(session);
    }
    if (action === 'page') {
        if (!/^\d{1,6}$/.test(parts[2] || '')) return;
        const page = Number(parts[2]);
        if (page > view.page + 1 || (page > view.page && !session.nativeFriendsHasNext)) return;
        view.page = page; return Menu.renderNative(session);
    }
    if (action === 'refresh') return Menu.renderNative(session);
    if (!['request', 'remove', 'const', 'form'].includes(action)) return;
    const row = session.nativeFriendsVisible?.find((r) => String(r.id) === parts[2]);
    if (action !== 'form' && !row) return;
    if (action === 'request' ? view.mode !== 'add' : view.mode !== 'friends') return;
    const actor = session.actor;
    const operation = session.nativeFriendsBusy = {};
    const current = () => session.actor === actor && session.nativeFriendsBusy === operation;
    let message = '';
    try {
        if (action === 'request') {
            const Life = invoke('GameServer/Bot/Population/BotLifeState');
            const state = await Life.findByName(row.name);
            if (!current()) return;
            const result = Number(state?.characterId) === row.id
                ? await Friends.request(session, state) : { ok: false, reason: 'missing_bot' };
            message = result.ok ? 'Friend request accepted.' : `Declined: ${Menu.requestReasonText(result.reason)}.`;
        } else if (action === 'remove') {
            const result = await Friends.remove(session, row.id);
            message = result.ok ? 'Friend removed. Social memory was kept.' : 'Could not remove friend.';
        } else if (action === 'const') {
            const result = await Friends.toggleConst(session, row.id);
            message = result.ok ? (result.selected ? 'Added to your const party.' : 'Removed from your const party.')
                : result.reason === 'const_full' ? 'Your const party already has 8 members.' : 'This bot is no longer a friend.';
        } else {
            const World = invoke('GameServer/World/World');
            const bots = await Friends.selected(session);
            let joined = 0;
            for (const bot of bots) {
                if (!current()) return;
                if (await World.inviteFriendByName(session, actor, bot.characterName || bot.name, undefined, 'friend_const')) joined++;
            }
            message = `Party invitations processed: ${joined} / ${bots.length}.`;
        }
        if (current()) await Menu.renderNative(session, false, message);
    } catch (error) {
        utils.infoWarn('BotFriends', 'native action failed: %s', error.message);
        if (current()) await Menu.renderNative(session, false, 'Action failed. Please refresh.');
    } finally { if (session.nativeFriendsBusy === operation) session.nativeFriendsBusy = false; }
};
