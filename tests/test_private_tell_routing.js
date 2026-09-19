const assert = require('assert');

require('../src/Global');

const SendPacket = invoke('Packet/Send');
const SpeakRequest = invoke('GameServer/Network/Request/Speak');
const World = invoke('GameServer/World/World');
const BotManager = invoke('GameServer/Bot/BotManager');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const ReceivePacket = invoke('Packet/Receive');

function actor(name, id = 2000001) {
    return {
        fetchId: () => id,
        fetchName: () => name,
        fetchIsOnline: () => true
    };
}

function privateTellBuffer(text, target) {
    return new SendPacket(0x38)
        .writeS(text)
        .writeD(2)
        .writeS(target)
        .fetchBuffer(false);
}

const originalMessageBotByName = World.messageBotByName;
const originalHandlePlayerSpeak = BotManager.handlePlayerSpeak;
const originalFindSessionByName = BotManager.findSessionByName;

async function main() {
const originalFindCold = LifeState.findByName;
const originalUsers = World.user;
World.user = { sessions: [] };
try {
    const packets = [];
    const decode = buffer => {
        const packet = new ReceivePacket(buffer);
        packet.readD().readD().readS().readS();
        return packet.data;
    };
    const playerSession = {
        accountId: 'player_test',
        actor: actor('Slava'),
        selfPackets: 0,
        failed: 0,
        broadcasts: 0,
        dataSendToMe(packet) { this.selfPackets++; packets.push(packet); },
        dataSendToMeAndOthers() { this.broadcasts++; }
    };

    let routedTell = null;
    let nearbyHookCalled = false;

    BotManager.findSessionByName = (name) => (
        String(name).toLowerCase() === 'partybot'
            ? { accountId: 'bot_partybot', actor: actor('PartyBot', 2000002) }
            : null
    );
    BotManager.handlePlayerSpeak = () => {
        nearbyHookCalled = true;
    };
    World.messageBotByName = (session, requestActor, name, text, source) => {
        routedTell = {
            session,
            actorName: requestActor.fetchName(),
            name,
            text,
            source
        };
        return Promise.resolve(true);
    };

    await SpeakRequest(playerSession, privateTellBuffer('follow me', 'PartyBot'));

    assert.deepStrictEqual(routedTell, {
        session: playerSession,
        actorName: 'Slava',
        name: 'PartyBot',
        text: 'follow me',
        source: 'client_tell'
    });
    assert.strictEqual(nearbyHookCalled, false, 'private tell should not trigger nearby bot chat hook');
    assert.strictEqual(playerSession.broadcasts, 0, 'private tell should not broadcast to nearby players/bots');
    assert.strictEqual(playerSession.selfPackets, 1, 'private tell should echo the outgoing line to the sender');
    assert.deepStrictEqual(decode(packets.at(-1)), [2000001, 2, '->PartyBot', 'follow me']);
    for (let i = 0; i < 3; i++) {
        await SpeakRequest(playerSession, privateTellBuffer('more', 'partybot'));
        assert.equal(decode(packets.at(-1))[2], '->PartyBot', 'consecutive tells must retain the recipient before a bot reply');
    }
    LifeState.findByName = async () => ({ name: 'ColdBot' });
    await SpeakRequest(playerSession, privateTellBuffer('hello cold', 'coldbot'));
    assert.deepStrictEqual(decode(packets.at(-1)), [2000001, 2, '->ColdBot', 'hello cold']);
    const incoming = [];
    World.user.sessions = [{ accountId: 'human', actor: actor('OtherPlayer', 2000003), dataSendToMe(packet) { incoming.push(packet); } }];
    await SpeakRequest(playerSession, privateTellBuffer('hello human', 'otherplayer'));
    assert.deepStrictEqual(decode(packets.at(-1)), [2000001, 2, '->OtherPlayer', 'hello human']);
    assert.deepStrictEqual(decode(incoming[0]), [2000001, 2, 'Slava', 'hello human'], 'recipient still sees the actual sender');

} finally {
    LifeState.findByName = originalFindCold;
    World.user = originalUsers;
    World.messageBotByName = originalMessageBotByName;
    BotManager.handlePlayerSpeak = originalHandlePlayerSpeak;
    BotManager.findSessionByName = originalFindSessionByName;
}

console.log('Private tell routing and native recipient echo checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
