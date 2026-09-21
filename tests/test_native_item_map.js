const assert = require('assert');
const fs = require('fs');
require('../src/Global');
// Advance a monotonic test clock between intentional UI actions. Burst behavior
// is exercised separately by test_native_item_requests.js.
let requestTime = 0;
Object.defineProperty(require('node:perf_hooks').performance, 'now', { configurable: true, value: () => requestTime });
const Native = invoke('GameServer/World/Generics/NpcBypasses/NativeItems');
const Locations = invoke('GameServer/World/Generics/NativeItemLocations');
const Areas = invoke('GameServer/World/WorldAreaCatalog');
const catalog = invoke('GameServer/World/Generics/NativeKnowledgeBase')();
const packets = [], fixtures = [];
const session = { actor: { fetchId: () => 42, fetchLocX: () => 82698, fetchLocY: () => 148638 }, dataSendToMe: (p) => packets.push(p) };
const command = (text) => { requestTime += 250; return invoke('GameServer/World/Generics/NpcTalkResponse')(session, { link: `native-items ${text}` }); };
function body() {
    const p = packets.at(-1); assert.strictEqual(p[0], 0x0f);
    let end = 5; while (p.readUInt16LE(end)) end += 2;
    return p.subarray(5, end).toString('utf16le');
}
const state = () => body().split('\n')[1].split('\t');
const map = () => body().split('\n')[2].split('\t');
const rows = () => body().split('\n').slice(3).map((r) => r.split('\t'));
const radar = (p) => { assert.strictEqual(p[0], 0xeb); assert(p.length >= 21); assert(p.subarray(21).every((b) => b === 0)); return [1,5,9,13,17].map((o) => p.readInt32LE(o)); };
Native.open(session, '57'); command('open 1'); command('inspect 57');
const sources = catalog.itemDetail(57).sources.drops;
const sourceIndex = sources.findIndex((n) => Locations.locations(n.id).length > 8);
assert(sourceIndex >= 0);
const sourcePage = Math.floor(sourceIndex / 8), npcId = sources[sourceIndex].id;
command(`page ${sourcePage}`);
let count = packets.length;
command('map 999999'); assert.strictEqual(packets.length, count, 'only a displayed item source can open a map');
command(`map ${npcId}`);
assert.strictEqual(state()[4], 'map'); assert.strictEqual(Number(map()[1]), npcId);
assert(Number(state()[10]) > 8); assert.strictEqual(map()[3], rows()[0][1]);
fixtures.push(body());
const first = session.nativeItemsView.places[0];
command(`track ${first.id}`);
assert.deepStrictEqual(radar(packets.at(-3)), [2,2,0,0,0]);
assert.deepStrictEqual(radar(packets.at(-2)), [0,1,first.x,first.y,first.z]);
assert.strictEqual(Number(map()[4]), first.id);
const second = session.nativeItemsView.places[1];
count = packets.length; command(`place ${second.id}`);
assert.strictEqual(packets.length, count + 1, 'selecting a map place does not change the compass');
assert.strictEqual(Number(map()[3]), second.id); fixtures.push(body());
command(`track ${second.id}`);
assert.deepStrictEqual(radar(packets.at(-3)), [2,2,0,0,0]);
assert.deepStrictEqual(radar(packets.at(-2)), [0,1,second.x,second.y,second.z]);
// Older mod versions still label the active button Track: repeating that
// request must toggle off too, using the same reset as explicit Clear.
for (let i = 0; i < 2; i++) {
    count = packets.length; command(`track ${second.id}`);
    assert.strictEqual(packets.length, count + 2);
    assert.deepStrictEqual(radar(packets.at(-2)), [2,2,0,0,0]);
    assert.strictEqual(Number(map()[4]), 0);
    assert.strictEqual(session.nativeItemsWaypoint, null);
    command(`track ${second.id}`);
    assert.strictEqual(Number(map()[4]), second.id);
    assert.deepStrictEqual(radar(packets.at(-2)), [0,1,second.x,second.y,second.z]);
}
session.questWaypoints = new Map([[Locations.key(second), [second.x,second.y,second.z]]]);
count = packets.length; command('untrack');
assert.strictEqual(packets.length, count + 3, 'reset the overhead arrow, then restore the overlapping quest marker');
assert.deepStrictEqual(radar(packets.at(-3)), [2,2,0,0,0]);
assert.deepStrictEqual(radar(packets.at(-2)), [0,1,second.x,second.y,second.z]);
assert(session.questWaypoints.size === 1 && !session.nativeItemsWaypoint);
// Distinct quest markers survive switching Track and clearing direction.
command(`track ${first.id}`);
assert.deepStrictEqual(radar(packets.at(-4)), [2,2,0,0,0]);
assert.deepStrictEqual(radar(packets.at(-3)), [0,1,second.x,second.y,second.z]);
assert.deepStrictEqual(radar(packets.at(-2)), [0,1,first.x,first.y,first.z]);
command('untrack');
assert.deepStrictEqual(radar(packets.at(-3)), [2,2,0,0,0]);
assert.deepStrictEqual(radar(packets.at(-2)), [0,1,second.x,second.y,second.z]);
session.questWaypoints.clear();
command(`track ${first.id}`); command('untrack');
assert.deepStrictEqual(radar(packets.at(-2)), [2,2,0,0,0], 'no quest: arrow must be disabled, not just its point deleted');
count = packets.length; command('untrack'); assert.strictEqual(packets.length, count + 1, 'repeated clear is a no-op for radar');
command('page 1'); fixtures.push(body());
assert.strictEqual(Number(state()[8]), 1); assert.strictEqual(map()[3], rows()[0][1]);
count = packets.length;
for (const invalid of ['place 1', 'track 1', 'track -1', 'track 999999', 'track 9 0 0 0', 'map 1']) {
    command(invalid); assert.strictEqual(packets.length, count, invalid);
}
command('sources'); assert.strictEqual(state()[4], 'drops'); assert.strictEqual(Number(state()[8]), sourcePage);
command('list'); assert.strictEqual(state()[5], '57');
command('close'); count = packets.length; command('track 1'); assert.strictEqual(packets.length, count);

// Every catalog point is bounded and classified; dungeon markers use the
// catalog's entrance anchor, never an invented coordinate or a live actor.
const mobs = require('../data/KnowledgeBase/mobs.json');
let total = 0, entrances = 0, timed = 0;
for (const npc of mobs) {
    const places = Locations.locations(npc.id);
    assert.strictEqual(new Set(places.map((r) => `${Locations.key(r)}:${r.kind}:${r.period}`)).size, places.length);
    for (const r of places) {
        assert([r.x,r.y,r.z].every((n) => Number.isSafeInteger(n) && Math.abs(n) <= 2000000));
        if (r.kind === 'entrance') {
            const area = Areas.AREAS.find((a) => a.name === r.name);
            assert(area?.mapAnchor); assert.strictEqual(r.x, Math.round(area.mapAnchor.locX)); entrances++;
        }
        if (r.period !== 'always') timed++;
        total++;
    }
}
assert(total > 1000 && entrances > 0 && timed > 0);
assert.deepStrictEqual(Locations.locations(999999), []);
// Real HTML clients retain a usable map-place/radar path too.
command('open 0'); command('search 57'); command('inspect 57'); command(`page ${sourcePage}`);
assert(body().includes('native-items map ')); command(`map ${npcId}`);
assert(body().includes('Track on radar') && body().includes('Back to sources'));
command('track 1'); assert.strictEqual(packets.at(-2)[0], 0xeb);
assert(body().includes('Stop tracking'));
command('untrack'); assert(!body().includes('Stop tracking'));
assert.deepStrictEqual(radar(packets.at(-2)), [2,2,0,0,0]);
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(packets.filter((p) => p[0] === 0xeb).map(radar)));
if (process.argv[2]) fs.writeFileSync(process.argv[2], Buffer.from(fixtures.join('\0'), 'utf16le'));
console.log(`Native item map: bypass/HTML/radar packets, selection/pages/back, quest isolation, ${total} catalog places (${entrances} entrances, ${timed} timed) passed`);
