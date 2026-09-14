const ReceivePacket = invoke('Packet/Receive');
const playerMoveDestination = invoke('GameServer/Geodata/PlayerMoveDestination');

function moveToLocation(session, buffer) {
    const packet = new ReceivePacket(buffer);

    packet
        .readD()  // Destination X
        .readD()  // Destination Y
        .readD()  // Destination Z
        .readD()  // Source X
        .readD()  // Source Y
        .readD(); // Source Z

    consume(session, {
        from: {
            locX: packet.data[3],
            locY: packet.data[4],
            locZ: packet.data[5],
        },
        to: {
            locX: packet.data[0],
            locY: packet.data[1],
            // C4 sends the clicked floor Z, while movement destinations use
            // actor Z. Match Lisvus MoveBackwardToLocation's collisionHeight
            // correction here, at the client boundary, so server-generated
            // routes and the already-correct source Z are not raised again.
            locZ: Math.trunc(packet.data[2] + session.actor.fetchSize()),
        }
    });
}

function consume(session, data) {
    const recovery = invoke('GameServer/Geodata/PlayerTransitionRecovery');
    data.from = recovery.source(session, data.from);
    data.to = playerMoveDestination(session.actor, data.from, data.to);
    session.actor.moveTo(data);
    recovery.command(session, data);
}

module.exports = moveToLocation;
