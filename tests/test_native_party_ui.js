const assert = require('assert');
require('../src/Global');
const Protocol = invoke('GameServer/World/Generics/NativePartyProtocol');
const NativeParty = invoke('GameServer/World/Generics/NpcBypasses/NativeParty');
const CompanionControl = invoke('GameServer/World/Generics/NpcBypasses/CompanionControl');
const Party = invoke('GameServer/Bot/AI/PartyCompanionService');
const BotManager = invoke('GameServer/Bot/BotManager');
const BotRoles = invoke('GameServer/Bot/AI/BotRoles');
const NpcTalkResponse = invoke('GameServer/World/Generics/NpcTalkResponse');
const Speak = invoke('GameServer/Network/Request/Speak');
const SendPacket = invoke('Packet/Send');

function actor(id, name) {
    return {
        fetchId: () => id, fetchName: () => name, fetchLevel: () => 40,
        isDead: () => false,
        fetchLocX: () => 10, fetchLocY: () => 20, fetchLocZ: () => 30,
        state: { fetchDead: () => false }
    };
}
const packets = [];
const leader = { actor: actor(1, 'Leader'), dataSendToMe: (p) => packets.push(p) };
let members = Array.from({ length: 8 }, (_, i) => ({ actor: actor(i + 10, `Companion${i}`) }));
let settings = { combatMode: 'assist', movementMode: 'follow', pullMode: 'auto' };
const restore = [];
function replace(object, key, value) {
    const old = object[key]; restore.push(() => { object[key] = old; }); object[key] = value;
}
function body(packet = packets.at(-1)) {
    assert.strictEqual(packet[0], 0x0f);
    assert.strictEqual(packet.readInt32LE(1), 1);
    let end = 5;
    while (packet.readUInt16LE(end) !== 0) end += 2;
    assert.strictEqual(packet.readInt32LE(end + 2), 0, 'C4 trailing field');
    return packet.subarray(5, end).toString('utf16le');
}
function command(value) { NativeParty(leader, ['native-party', ...value.split(' ')]); }
try {
    replace(Party, 'membersForLeader', (session) => session === leader ? members : []);
    replace(Party, 'getSettings', () => settings);
    replace(Party, 'updateSettings', (_session, patch) => Object.assign(settings, patch));
    replace(BotManager, 'getBotStatus', () => ({ intent: 'idle' }));
    replace(BotManager, 'botSay', () => {});
    replace(BotRoles, 'inferRole', () => 'dps');
    replace(BotRoles, 'presentation', () => ({ role: 'dps', className: 'Gladiator' }));

    CompanionControl.render(leader);
    assert(body().includes('<title>Party Control</title>'), 'unmodified client receives HTML');
    const legacy = body();
    command('action combat passive');
    assert.strictEqual(settings.combatMode, 'assist', 'orders require negotiation');
    NpcTalkResponse(leader, { link: 'native-party open 1' });
    assert(body().startsWith(Protocol.PREFIX), 'actual bypass route negotiates native UI');
    assert(body().includes('state\tassist\tfollow\tauto\t8\t1'));
    assert.strictEqual(body().split('\n').length, 10, 'all eight companions fit one packet');
    assert(body().length < 8192);

    command('action combat passive');
    assert.strictEqual(settings.combatMode, 'passive');
    assert(body().includes('state\tpassive\tfollow\tauto\t8\t0'));
    command('member 10 stay');
    assert.strictEqual(members[0].botStay, true);
    assert.deepStrictEqual(members[0].stayLocation, { locX: 10, locY: 20, locZ: 30 });
    command('member 10 follow');
    assert.strictEqual(members[0].botStay, false);
    command('member 999 stay');
    assert(members.every((m) => !m.botStay), 'outsider cannot be controlled');
    const removed = members.shift();
    command('member 10 stay');
    assert.strictEqual(removed.botStay, false, 'stale row cannot control a removed member');
    for (const invalid of ['action combat bogus', 'action constructor foo', 'member -1 stay', 'member 11 dismiss']) {
        const before = packets.length; command(invalid); assert.strictEqual(packets.length, before);
    }

    command('close');
    const before = packets.length;
    CompanionControl.render(leader);
    command('refresh'); command('action combat assist');
    assert.strictEqual(packets.length, before, 'closed panels do not receive background updates');
    assert.strictEqual(settings.combatMode, 'passive');
    Speak(leader, new SendPacket(0x38).writeS('.b').writeD(0).fetchBuffer(false));
    assert.strictEqual(leader.nativePartyUiOpen, true, '.b explicitly reopens the native panel');
    assert(body().includes('state\tpassive\tfollow\tauto\t7\t1'));
    members.unshift(removed); settings.combatMode = 'assist';
    command('open 0');
    assert.strictEqual(body(), legacy, 'fallback preserves existing HTML output');
    members = [];
    command('open 1');
    assert.strictEqual(body(), Protocol.PREFIX + 'state\tassist\tfollow\tauto\t0\t1');

    const hostile = { id: 20, name: 'Алиса\t\n\0' + 'x'.repeat(40), level: 40,
        className: 'c'.repeat(60), role: 'dps', stance: 'hold', order: '\nmember\t99', note: 'n'.repeat(200), canPull: true };
    const bounded = Protocol.encode(settings, Array.from({ length: 9 }, (_, i) => ({ ...hostile, id: i + 20 })));
    const lines = bounded.split('\n');
    assert.strictEqual(lines.length, 10);
    for (const line of lines.slice(2)) {
        const fields = line.split('\t');
        assert.strictEqual(fields.length, 10);
        assert.strictEqual(fields[2].length, 32);
        assert.strictEqual(fields[4].length, 40);
        assert.strictEqual(fields[8].length, 64);
        assert(!line.includes('\0'));
    }
    if (process.argv[2]) require('fs').writeFileSync(process.argv[2], Buffer.from(bounded, 'utf16le'));
} finally { restore.reverse().forEach((fn) => fn()); }
console.log('Native party UI: wire format, full/empty party, negotiation, fallback, reopen and current membership checks passed');
