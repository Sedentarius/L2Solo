const SendPacket = invoke('Packet/Send');

module.exports = function beginRotation(objectId, heading, side = 1, speed = 65535) {
    return new SendPacket(0x62)
        .writeD(objectId).writeD(heading).writeD(side).writeD(speed)
        .fetchBuffer();
};
