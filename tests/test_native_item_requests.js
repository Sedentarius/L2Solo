const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../src/Global');
const Knowledge = invoke('GameServer/World/Generics/NativeKnowledgeBase');
const Items = invoke('GameServer/World/Generics/NpcBypasses/NativeItems');
const Requests = invoke('GameServer/World/Generics/NativeItemRequests');

async function main() {
    // Exercise real scheduling logic deterministically, without sleeping for pages.
    let now = 0, nextTimer = 0;
    const timers = new Map(), context = { module: { exports: {} },
        require: (name) => { assert.equal(name, 'node:perf_hooks'); return { performance: { now: () => now } }; },
        setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { at: now + ms, fn }); return id; },
        clearTimeout: (id) => timers.delete(id), utils: { infoWarn: () => {} }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../src/GameServer/World/Generics/NativeItemRequests'), 'utf8'), context);
    const gate = context.module.exports;
    const advance = (ms) => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } };
    const session = { actor: {} }, calls = [];
    for (let i = 0; i < 100; i++) gate.run(session, () => calls.push(i));
    assert.deepEqual(calls, [0, 1, 2, 3]); assert.equal(timers.size, 1);
    advance(199); assert.equal(calls.length, 4);
    advance(1); assert.deepEqual(calls, [0, 1, 2, 3, 99], 'latest click completes, intermediate flood is coalesced');
    gate.run(session, () => calls.push(100)); gate.cancel(session); advance(200);
    assert.equal(calls.length, 5, 'close cancels queued work');
    gate.run(session, () => calls.push(101)); gate.run(session, () => calls.push(102));
    session.actor = {}; advance(200); assert.equal(calls.at(-1), 101, 'old actor cannot execute queued action');
    for (let i = 0; i < 20; i++) { gate.cancel(session); gate.run(session, () => calls.push(i)); }
    assert.equal(timers.size, 1); assert.equal(calls.length, 7, 'cancel does not refill the connection budget');
    gate.cancel(session);

    // Bounded LRU caches and rate changes must change real displayed rewards.
    let rate = 1, reads = 0;
    const cache = Knowledge.cachedService({ itemDetail: (id) => ({ id, rate, read: ++reads }) }, { profile: () => ({ rate }) });
    const first = cache.itemDetail(57); assert.equal(cache.itemDetail(57), first);
    for (let id = 100; id < 164; id++) cache.itemDetail(id);
    assert.notEqual(cache.itemDetail(57), first, 'LRU capacity is finite');
    rate = 10; assert.equal(cache.itemDetail(57).rate, 10);
    const oldRate = process.env.L2NODE_PROGRESSION_RATE;
    try {
        process.env.L2NODE_PROGRESSION_RATE = 'x1'; Knowledge.warmup();
        const detail = Knowledge().itemDetail(57); assert.equal(Knowledge().itemDetail(57), detail);
        process.env.L2NODE_PROGRESSION_RATE = 'x10';
        assert.notEqual(Knowledge().itemDetail(57), detail);
        assert.equal(Knowledge().itemDetail(57).rateProfile.preset, 'x10');
    } finally { if (oldRate === undefined) delete process.env.L2NODE_PROGRESSION_RATE; else process.env.L2NODE_PROGRESSION_RATE = oldRate; }

    // Real endpoint burst, timer delivery and close cancellation (no live server).
    let packets = 0;
    const player = { actor: { fetchId: () => 42 }, dataSendToMe: () => packets++ };
    Items.open(player, '57');
    Items(player, ['native-items', 'open', '1']);
    Items(player, ['native-items', 'inspect', '57']);
    const before = packets;
    for (let i = 0; i < 100; i++) Items(player, ['native-items', 'refresh']);
    assert(packets - before <= 2, 'network-facing endpoint must use the limiter');
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert(packets > before, 'last queued refresh receives its normal response');
    Items(player, ['native-items', 'refresh']);
    Items(player, ['native-items', 'close']);
    const closed = packets;
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(packets, closed); Requests.cancel(player);
    const startup = fs.readFileSync(require.resolve('../src/NodeL2'), 'utf8');
    const warmup = startup.indexOf("NativeKnowledgeBase').warmup()");
    assert(warmup >= 0 && warmup < startup.indexOf("new Server('AuthServer'"), 'catalog warms before accepting players');
    console.log('Native catalog: bounded burst/coalescing, close/actor cancellation, LRU/rate invalidation, real endpoint and pre-listen warmup passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
