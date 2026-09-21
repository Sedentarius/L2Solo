const ServerResponse = invoke('GameServer/Network/Response');
const Shared         = invoke('GameServer/Network/Shared');

async function restart(session, buffer) {
    invoke('GameServer/World/Generics/NativeUiSession').reset(session, { clearDirection: true });

    invoke('GameServer/World/ArenaDuelService').release(session, 'restart');
    await session.persistCharacterStatus?.();
    if (session.actor) invoke('GameServer/Effects/EffectTicker').clearAll(session.actor);
    session.actor?.destructor();

    session.dataSendToMe(
        ServerResponse.restart()
    );

    Shared.fetchCharacters(session.accountId).then((characters) => {
        Shared.enterCharacterHall(session, characters);
    });
}

module.exports = restart;
