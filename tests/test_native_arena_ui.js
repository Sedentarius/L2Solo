const assert = require('assert');
require('../src/Global');
const Arena = invoke('GameServer/World/ArenaDuelService');
const Geometry = invoke('GameServer/World/GiranArena');
const Native = invoke('GameServer/World/Generics/NpcBypasses/NativeArena');
const Protocol = invoke('GameServer/World/Generics/NativeArenaProtocol');
const restores = [];
function replace(object, key, value) { const old = Object.getOwnPropertyDescriptor(object, key); restores.push(() => Object.defineProperty(object, key, old)); Object.defineProperty(object, key, { configurable: true, writable: true, value }); }
const packets = [];
let nearby = true;
const session = { actor: { fetchId: () => 42, fetchLocX: () => Geometry.NPC.locX + (nearby ? 0 : 1000),
    fetchLocY: () => Geometry.NPC.locY, fetchLocZ: () => Geometry.NPC.locZ },
    activeNpcTalk: { selfId: 8225, objectId: 555 }, dataSendToMe: (p) => packets.push(p) };
const candidates = Array.from({ length: 23 }, (_, i) => ({ name: `Opponent${String(i).padStart(2, '0')}`,
    level: 50 + i % 15, phase: i % 2 ? 'hot' : 'cold', state: { characterId: 100 + i, stats: { classId: i % 2 ? 16 : 55 } } }));
function body() {
    const p = packets.findLast((p) => p[0] === 0x0f); assert(p);
    let end = 5; while (p.readUInt16LE(end)) end += 2;
    return p.subarray(5, end).toString('utf16le');
}
function state() { return body().split('\n')[1].split('\t'); }
const command = (text) => Native(session, ['native-arena', ...text.split(' ')]);
(async () => {
    try {
        replace(Arena, 'candidateCatalog', () => candidates);
        replace(Arena, 'active', null);
        replace(Arena, 'className', (id) => id === 16 ? 'Bishop' : 'Bounty Hunter');
        Arena.render(session); assert(body().includes('Giran Arena') && !body().startsWith(Protocol.PREFIX));
        nearby = false; const before = packets.length; await command('open 1'); assert.strictEqual(packets.length, before);
        nearby = true;
        invoke('GameServer/World/Generics/NpcTalkResponse')(session, { link: 'native-arena open 1' });
        assert(body().startsWith(Protocol.PREFIX)); assert.strictEqual(state()[6], '23');
        assert.deepStrictEqual(state().slice(8, 14), ['8', '2', '1', '0', '1', 'self']);
        if (process.argv[2]) require('fs').writeFileSync(process.argv[2], Buffer.from(body(), 'utf16le'));
        await command('filter Opponent 41-60 16');
        assert(body().split('\n').filter((s) => s.startsWith('candidate')).every((s) => s.includes('\t16\tBishop\t')));
        await command('filter Opponent00 61-80 all'); assert.strictEqual(state()[8], '0');
        await command('filter - all all'); await command('page 999999'); assert.strictEqual(state()[4], '2'); assert.strictEqual(state()[8], '7');
        for (const invalid of ['filter - bogus all', 'filter - all 999', 'page -1', 'buff bogus']) {
            const n = packets.length; await command(invalid); assert.strictEqual(packets.length, n);
        }
        let selects = 0, resolveSelect, validate;
        replace(Arena, 'select', (s, id, options) => {
            assert.strictEqual(s, session); assert.strictEqual(options.renderResult, false); assert(session.nativeArenaVisible.includes(id));
            selects++; validate = options.validate; return new Promise((resolve) => { resolveSelect = resolve; });
        });
        await command('select 999'); assert.strictEqual(selects, 0);
        const id = session.nativeArenaVisible[0]; const choosing = command(`select ${id}`);
        await command(`select ${id}`); assert.strictEqual(selects, 1); assert(validate());
        nearby = false; assert(!validate(), 'selection must recheck range after async snapshot'); nearby = true;
        const actor = session.actor; session.actor = { ...actor }; assert(!validate(), 'selection cannot follow a changed actor'); session.actor = actor;
        await command('close'); const closed = packets.length; resolveSelect(true); await choosing;
        assert.strictEqual(packets.length, closed, 'late selection response cannot reopen');
        Arena.render(session); assert.strictEqual(session.nativeArenaOpen, true);
        Arena.active = { playerSession: {}, state: 'PREPARED' };
        await command('refresh'); assert.strictEqual(state()[10], '0'); assert(body().includes('Arena occupied'));
        await command(`select ${id}`); assert.strictEqual(selects, 1);
        Arena.active = { playerSession: session, state: 'PREPARED', sourceName: 'Opponent00', buffMode: 'self' };
        await command('refresh'); assert.deepStrictEqual(state().slice(10, 14), ['1', '1', '1', 'self']);
        let buffs = 0, heals = 0;
        replace(Arena, 'applyBuffMode', (s, mode, render) => { assert.strictEqual(render, false); buffs++; Arena.active.buffMode = mode; return true; });
        replace(Arena, 'heal', () => { heals++; return true; });
        await command('buff full'); assert.strictEqual(buffs, 1); assert.strictEqual(state()[13], 'full');
        await command('heal'); assert.strictEqual(heals, 1);
        nearby = false; await command('heal'); await command('buff self'); assert.strictEqual(heals, 1); assert.strictEqual(buffs, 1);
        assert.deepStrictEqual(state().slice(10, 13), ['0', '0', '0']); nearby = true;
        Arena.active.state = 'FIGHTING'; Arena.active.enteredArena = true;
        await command('refresh'); assert.deepStrictEqual(state().slice(10, 13), ['0', '0', '0']);
        session.activeNpcTalk.selfId = 1; await command('heal'); assert.strictEqual(heals, 1); session.activeNpcTalk.selfId = 8225;
        await command('open 0'); assert(body().includes('<html>') && !body().startsWith(Protocol.PREFIX));
    } finally { restores.reverse().forEach((fn) => fn()); }
    console.log('Native arena: NPC/range authorization, filters/classes, paging, occupied state, buff/heal, async validation and close passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
