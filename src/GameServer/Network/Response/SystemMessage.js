const SendPacket = invoke('Packet/Send');

// C4 SystemMessage packet (opcode 0x64).
function systemMessage(id, ...strings) {
    const packet = new SendPacket(0x64)
        .writeD(Number(id) || 0)
        .writeD(strings.length);
    for (const value of strings) packet.writeD(0).writeS(String(value));
    return packet.fetchBuffer();
}

// Lisvus SystemMessage.sendString: S1_S2 (614), one TYPE_TEXT (0) argument.
systemMessage.text = function text(message) {
    return systemMessage(614, message);
};

module.exports = systemMessage;
