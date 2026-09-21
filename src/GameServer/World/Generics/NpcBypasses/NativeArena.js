const Arena = invoke('GameServer/World/ArenaDuelService');
const Protocol = invoke('GameServer/World/Generics/NativeArenaProtocol');
const Response = invoke('GameServer/Network/Response');
const LEVELS = { all: [1, 80], '1-20': [1, 20], '21-40': [21, 40], '41-60': [41, 60], '61-80': [61, 80] };
function allowed(session) {
    return Number(session?.activeNpcTalk?.selfId) === Arena.NPC_SELF_ID && Arena.canUseManager(session);
}
function view(session) { return session.nativeArenaView ||= { query: '', level: 'all', classKey: 'all', page: 0 }; }
function render(session, open = false, message = '') {
    if (!session?.actor || session.nativeArenaVersion !== 1) return;
    if (open) { if (!allowed(session)) return; session.nativeArenaOpen = true; }
    if (!session.nativeArenaOpen) return;
    const state = view(session), near = allowed(session), duel = Arena.active;
    const own = duel?.playerSession === session;
    const editable = own && duel.state === 'PREPARED' && !duel.enteredArena;
    const catalog = Arena.candidateCatalog(session);
    const classes = [...new Set(catalog.map((c) => Number(c.subject?.fetchClassId?.() ?? c.state?.stats?.classId ?? c.state?.classId ?? 0)))]
        .filter((id) => Number.isInteger(id) && id >= 0 && id <= 136)
        .map((id) => ({ id, name: Arena.className(id) })).sort((a, b) => a.name.localeCompare(b.name));
    const [low, high] = LEVELS[state.level];
    let candidates = catalog.filter((c) => {
        const cls = Number(c.subject?.fetchClassId?.() ?? c.state?.stats?.classId ?? c.state?.classId ?? 0);
        return c.level >= low && c.level <= high && (state.classKey === 'all' || cls === Number(state.classKey));
    });
    candidates = state.query ? Arena.rankedNameMatches(candidates, state.query)
        : candidates.slice().sort((a, b) => Arena.candidateName(a).localeCompare(Arena.candidateName(b)));
    const pages = Math.max(1, Math.ceil(candidates.length / 8)); state.page = Math.min(state.page, pages - 1);
    const rows = candidates.slice(state.page * 8, state.page * 8 + 8).map((c) => {
        const cls = Number(c.subject?.fetchClassId?.() ?? c.state?.stats?.classId ?? c.state?.classId ?? 0);
        return { id: Number(c.subject?.fetchId?.() ?? c.state?.characterId), name: Arena.candidateName(c),
            level: c.level, classId: cls, className: Arena.className(cls), phase: c.phase === 'hot' ? 'active' : 'background' };
    });
    session.nativeArenaVisible = rows.map((r) => r.id);
    const busy = duel && !own;
    const hint = !near ? 'Return to the Arena Manager.' : busy ? 'Arena occupied. Please wait.'
        : own ? 'Enter the arena, then type .go.' : 'Choose an opponent to prepare a duel.';
    session.dataSendToMe(Response.npcHtml(session.activeNpcTalk?.objectId || 0, Protocol.encode({ ...state,
        pages, total: candidates.length, open, canSelect: near && !busy && (!own || editable),
        canBuff: near && editable, canHeal: near && (!own || editable), buffMode: own ? duel.buffMode : 'self',
        opponent: own ? duel.sourceName : '', message: message || hint
    }, rows, classes)));
}
async function handler(session, parts) {
    if (!session?.actor) return;
    const action = parts[1];
    if (action === 'close') { session.nativeArenaOpen = false; return; }
    if (!allowed(session)) {
        if (session.nativeArenaVersion === 1) render(session, false, 'Return to the Arena Manager.');
        return;
    }
    if (action === 'open') {
        if (!['0', '1'].includes(parts[2])) return;
        session.nativeArenaVersion = Number(parts[2]); session.nativeArenaOpen = parts[2] === '1';
        return session.nativeArenaOpen ? render(session, true) : Arena.menu(session);
    }
    if (session.nativeArenaVersion !== 1 || !session.nativeArenaOpen || session.nativeArenaBusy) return;
    const state = view(session);
    if (action === 'filter') {
        if (!Object.hasOwn(LEVELS, parts[3]) || !/^(all|\d{1,3})$/.test(parts[4] || '') || (parts[4] !== 'all' && Number(parts[4]) > 136)) return;
        state.query = parts[2] === '-' ? '' : Arena.searchText(parts[2]); state.level = parts[3]; state.classKey = parts[4]; state.page = 0;
    } else if (action === 'page') {
        if (!/^\d{1,6}$/.test(parts[2] || '')) return;
        state.page = Number(parts[2]);
    } else if (['select', 'buff', 'heal'].includes(action)) {
        const actor = session.actor, duel = Arena.active;
        const editable = !duel || (duel.playerSession === session && duel.state === 'PREPARED' && !duel.enteredArena);
        if (action === 'select' && (!editable || !session.nativeArenaVisible?.includes(Number(parts[2])))) return render(session);
        if (action === 'buff' && !['self', 'full'].includes(parts[2])) return;
        const operation = session.nativeArenaBusy = {};
        const current = () => session.actor === actor && session.nativeArenaBusy === operation;
        try {
            const ok = action === 'select' ? await Arena.select(session, Number(parts[2]), {
                renderResult: false, validate: () => current() && allowed(session)
            }) : action === 'buff' ? Arena.applyBuffMode(session, parts[2], false) : Arena.heal(session);
            if (current()) render(session, false, ok ? (action === 'select' ? 'Opponent ready. Enter the arena, then .go.'
                : action === 'buff' ? 'Buff mode updated.' : 'HP / MP / CP restored.') : 'Action unavailable. Please refresh.');
        } catch (error) {
            utils.infoWarn('Arena', 'native action failed: %s', error.message);
            if (current()) render(session, false, 'Action failed. Please refresh.');
        } finally { if (session.nativeArenaBusy === operation) session.nativeArenaBusy = false; }
        return;
    } else if (action !== 'refresh') return;
    render(session);
}
handler.render = render;
module.exports = handler;
