const SendPacket = invoke('Packet/Send');

// C4 RadarControl (0xEB): action 0 adds a point and enables the overhead
// arrow; 1 removes a point only; 2 disables the arrow and clears all points.
function radarControl(showRadar, type, locX, locY, locZ) {
    const packet = new SendPacket(0xeb);

    packet
        .writeD(showRadar)
        .writeD(type)
        .writeD(locX)
        .writeD(locY)
        .writeD(locZ);

    return packet.fetchBuffer();
}

module.exports = radarControl;
