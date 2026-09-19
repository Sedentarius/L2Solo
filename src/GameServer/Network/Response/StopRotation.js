const SendPacket = invoke('Packet/Send');

module.exports = function stopRotation(objectId, heading, speed = 65535) {
    return new SendPacket(0x63)
        .writeD(objectId).writeD(heading).writeD(speed).writeC(0)
        .fetchBuffer();
};
