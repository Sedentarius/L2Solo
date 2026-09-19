const SendPacket = invoke('Packet/Send');
const SkillReuse = invoke('GameServer/Skills/SkillReuse');

module.exports = function skillCoolTime(actor, now = Date.now()) {
    const rows = SkillReuse.entries(actor, now);
    const packet = new SendPacket(0xc1).writeD(rows.length);
    for (const row of rows) {
        packet.writeD(row.id).writeD(row.level)
            .writeD(Math.floor(row.duration / 1000))
            .writeD(Math.floor((row.until - now) / 1000));
    }
    return packet.fetchBuffer();
};
