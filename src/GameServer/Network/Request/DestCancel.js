const ReceivePacket = invoke('Packet/Receive');

function destCancel(session, buffer) {
    invoke('GameServer/Geodata/PlayerTransitionRecovery').cancel(session);
    const packet = new ReceivePacket(buffer);
    packet.readH();

    const isEscKeyPressed = packet.data[0] === 0;
    if (isEscKeyPressed && session.actor.attack?.abortCast?.(session, session.actor)) {
        return;
    }

    session.actor.unselect();
}

module.exports = destCancel;
