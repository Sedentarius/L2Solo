const assert = require('node:assert/strict');
require('../src/Global');
const World = invoke('GameServer/World/World');
const Clan = invoke('GameServer/Clan/ClanService');
const Response = invoke('GameServer/Network/Response');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const originalCachedState = LifeState.cachedState;
LifeState.cachedState = id => Number(id) === 101 ? { characterId: 101, phase: 'cold' } : null;
const originalUser = World.user;
World.user = { sessions: [], revision: 0 };
function session(id, clanId, online = true) {
    return {
        packets: [], fetchAccountId: () => id,
        actor: {
            fetchId: () => id, fetchClanId: () => clanId,
            fetchName: () => `Member${id}`, fetchLevel: () => 11,
            fetchClassId: () => 10, fetchIsOnline: () => online
        },
        dataSendToMe(packet) { this.packets.push(packet); }
    };
}
function status(packet) {
    assert.equal(packet[0], 0x54);
    let offset = 1;
    while (packet.readUInt16LE(offset)) offset += 2;
    return packet.readInt32LE(offset + 2 + 16);
}
try {
    const player = session(100, 1), bot = session(101, 1);
    const outsider = session(102, 2), offline = session(103, 1, false);
    bot.botSession = true;
    World.user.sessions = [player, outsider, offline];
    assert.equal(status(Response.pledgeShowMemberListUpdate(bot.actor)), 101, 'cold bot is online before activation');
    assert.equal(Clan.liveMember({ id: 101, name: 'Member101' }).online, true);
    const coldMember = { id: 101, name: 'Member101', level: 11, classId: 10 };
    const roster = Response.pledgeShowMemberListAll({
        id: 1, name: 'TestClan', leaderId: 100, members: [coldMember]
    }, player.actor);
    const memberName = Buffer.from('Member101\0', 'utf16le');
    const memberOffset = roster.indexOf(memberName);
    assert(memberOffset >= 0);
    assert.equal(roster.readInt32LE(memberOffset + memberName.length + 16), 101,
        'initial clan roster must show a cold bot online');
    const added = Response.pledgeShowMemberListAdd(coldMember);
    assert.equal(added.readInt32LE(1 + memberName.length + 16), 101,
        'new clan member packet must also show a cold bot online');
    assert.equal(Clan.liveMember({ id: 999, name: 'OfflinePlayer', isOnline: 1 }).online, false, 'stale player status must not imply online');
    World.insertUser(bot);
    Clan.broadcastMemberPresence(bot.actor);
    assert.equal(player.packets.length, 1);
    assert.equal(status(player.packets[0]), 101, 'bot activation updates the existing clan row to online');
    assert.equal(bot.packets.length, 0);
    assert.equal(outsider.packets.length, 0);
    assert.equal(offline.packets.length, 0);
    World.removeUser(bot);
    assert.equal(player.packets.length, 2);
    assert.equal(status(player.packets[1]), 101, 'cold transition keeps the bot online');
    assert.equal(Clan.onlineObjectId({ id: 101 }), 101);
    assert(!World.user.sessions.includes(bot), 'online clan status must not activate a cold bot');
    World.removeUser(bot);
    assert.equal(player.packets.length, 2, 'duplicate removal must not send another update');
    World.insertUser(bot);
    Clan.broadcastMemberPresence(bot.actor);
    assert.equal(status(player.packets.at(-1)), 101, 'reactivation restores the online status');
    const human = session(104, 1);
    World.insertUser(human);
    Clan.broadcastMemberPresence(human.actor);
    assert.equal(status(player.packets.at(-1)), 104);
    World.removeUser(human);
    assert.equal(status(player.packets.at(-1)), 0, 'real players still go offline');
    console.log('Clan presence: activation, removal, reactivation and recipient isolation passed');
} finally {
    World.user = originalUser;
    LifeState.cachedState = originalCachedState;
}
