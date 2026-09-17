const assert = require('node:assert/strict');
require('../src/Global');
const Response = invoke('GameServer/Network/Response');
const check = invoke('GameServer/Actor/Generics/UnderwaterCheck');
const original = Response.skillDurationBar;
Response.skillDurationBar = (duration, color) => ({ duration, color });
const packets = [];
const session = { dataSendToMe: packet => packets.push(packet) };
const actor = {
    x: -44015, y: 80000, z: -3900, stateWater: false,
    fetchLocX() { return this.x; },
    fetchLocY() { return this.y; },
    fetchLocZ() { return this.z; }
};
function at(x, y, z, expected) {
    Object.assign(actor, { x, y, z });
    packets.length = 0;
    check(session, actor);
    assert.equal(actor.stateWater, expected, `water at ${x}, ${y}, ${z}`);
    if (!expected) assert(!packets.some(p => p.duration > 0), 'dry land cannot start the breath gauge');
}
try {
    at(-44015, 80000, -3900, false);
    at(-44225, 79721, -3652, false);
    at(-44015, 80500, -4100, false);
    at(-60000, 70000, -4000, true); // Sea in the northwest of region 18_20.
    assert.deepEqual(packets, [{ duration: 86000, color: 2 }]);
    at(-60000, 70000, -4000, true);
    assert.equal(packets.length, 0, 'movement underwater must not reset the timer');
    at(-44015, 80000, -3900, false);
    assert.deepEqual(packets, [{ duration: 0, color: 2 }], 'returning to the altar clears the gauge');
    at(-60000, 70000, -3800, false); // Above the sea surface.
    at(-55000, 79100, -5000, true); // Necropolis horizontal passage.
    at(-55000, 79100, -4800, false);
    at(-55700, 79100, -3500, true); // Entrance shaft has a higher surface.
    at(-55700, 79100, -2900, false);
    at(-55700, 80000, -5000, false); // Outside the passage footprint.
    at(-55700, 79100, -5500, false); // Below its vertical bounds.
    at(10000, 15000, -4400, false); // Existing Dark Elven Village exemption.
    at(-110000, 110000, -4000, true); // Existing sea behavior outside this region.
    at(67500, 69500, -3900, false); // Leto Shaman ground, north of the river.
    assert.deepEqual(packets, [{ duration: 0, color: 2 }], 'entering Oren dry land clears an existing gauge');
    at(70000, 60000, -4000, false); // Low ground west of Oren, region 22_19.
    at(80000, 70000, -4000, false); // Hunting grounds east of the river.
    at(87000, 40000, -4000, true); // Northern water volume.
    at(87000, 40000, -3800, false);
    at(84000, 40000, -4000, false); // Beyond the northern water footprint.
    at(68000, 80000, -4000, true); // Western river.
    at(68000, 80000, -4000, true);
    assert.equal(packets.length, 0, 'Oren water movement must not reset the timer');
    at(71000, 80000, -4000, false);
    at(80000, 95000, -4000, true); // Southern river.
    at(80000, 95000, -3800, false);
    at(74200, 78300, -3500, true); // Apostate entrance shaft.
    at(74200, 78300, -3300, false);
    at(75000, 78300, -5500, true); // Apostate horizontal passage.
    at(75000, 78300, -5100, false);
    at(75000, 78300, -5900, false);
    at(75000, 79000, -5500, false);
    console.log('Altar and Oren: dry land, water volumes and breath gauge transitions passed');
} finally {
    Response.skillDurationBar = original;
}
