const SendPacket = invoke('Packet/Send');

// C4/Lisvus ValidateLocation: local coordinate correction, not world travel.
module.exports = function validateLocation(id, loc) {
    const packet = new SendPacket(0x61);
    packet.writeD(id).writeD(loc.locX).writeD(loc.locY).writeD(loc.locZ).writeD(loc.head);
    return packet.fetchBuffer();
};
