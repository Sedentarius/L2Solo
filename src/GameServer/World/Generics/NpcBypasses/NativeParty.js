// Client capabilities change presentation only. Every order still uses the
// existing companion handler and resolves membership again on the server.
module.exports = function nativeParty(session, parts) {
    if (!session?.actor) return;
    const CompanionControl = invoke('GameServer/World/Generics/NpcBypasses/CompanionControl');
    const operation = parts[1];
    if (operation === 'open') {
        session.nativePartyUiVersion = parts[2] === '1' ? 1 : 0;
        session.nativePartyUiOpen = session.nativePartyUiVersion === 1;
        CompanionControl.render(session, 0, { open: true });
        return;
    }
    if (session.nativePartyUiVersion !== 1) return;
    if (operation === 'close') {
        session.nativePartyUiOpen = false;
        return;
    }
    if (!session.nativePartyUiOpen) return;
    if (operation === 'refresh') {
        CompanionControl.render(session);
        return;
    }
    if (operation === 'action') {
        const command = parts[2];
        const value = parts[3];
        const allowed = {
            combat: ['assist', 'protect', 'passive'],
            movement: ['follow', 'hold'],
            pull: ['auto', 'leader', 'off']
        };
        if (command === 'regroup' || (Object.hasOwn(allowed, command) && allowed[command].includes(value))) {
            CompanionControl(session, ['companion-control', command, value]);
        }
        return;
    }
    if (operation === 'member') {
        if (!/^\d{1,10}$/.test(parts[2] || '')) return;
        const Party = invoke('GameServer/Bot/AI/PartyCompanionService');
        const member = Party.membersForLeader(session).find((candidate) => (
            candidate.actor?.fetchId() === Number(parts[2])
        ));
        if (!member) {
            CompanionControl.render(session);
            return;
        }
        const name = member.actor.fetchName();
        const action = parts[3];
        if (['follow', 'stay', 'summon'].includes(action)) {
            CompanionControl(session, ['companion-control', action, name]);
        } else if (action === 'pull-on' || action === 'pull-off') {
            CompanionControl(session, ['companion-control', 'member-pull', action === 'pull-on' ? 'on' : 'off', name]);
        }
    }
};
