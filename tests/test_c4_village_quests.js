// Lifecycle certification for the C4 first-village quests
// (Q152, Q154, Q157, Q159, Q162, Q163, Q166, Q167, Q169).
//
// Each is driven through QuestService against a real database: eligibility,
// the authored drop chances and caps, every hand-in, restart persistence, the
// exact reward, and replay rejection.
const assert = require('node:assert/strict');
const { createWorld, withRandom } = require('./helpers/c4QuestHarness');

const Definitions = require('../src/GameServer/Quest/VillageQuestDefinitions');
const byId = id => Definitions.find(d => d.id === id);
const ADENA = 57;

const CHARACTERS = [
    { id: 152, race: 0, level: 20 }, { id: 154, race: 0, level: 20 },
    { id: 157, race: 0, level: 20 }, { id: 159, race: 1, level: 20 },
    { id: 162, race: 0, level: 20 }, { id: 163, race: 0, level: 20 },
    { id: 166, race: 2, level: 20 }, { id: 167, race: 0, level: 20 },
    { id: 169, race: 2, level: 20 },
    // Gate probes.
    { id: 900, race: 2, level: 20 }, { id: 901, race: 0, level: 1 },
    // A second Q167 runner, for the other branch.
    { id: 902, race: 0, level: 20 }
];

async function main() {
    const world = await createWorld(CHARACTERS, 'c4-village');
    try {
        await eligibilityGates(world);
        await shardsOfGolem(world);
        await sacrificeToTheSea(world);
        await recoverSmuggledGoods(world);
        await protectTheWaterSource(world);
        await curseOfTheUndergroundFortress(world);
        await legacyOfThePoet(world);
        await massOfDarkness(world);
        await dwarvenKinship(world);
        await offspringOfNightmares(world);
        console.log('C4 village quests: eligibility, authored drop rates and caps, ordered '
            + 'hand-ins, exact rewards, restart persistence and replay rejection passed');
    } finally {
        await world.close();
    }
}

async function eligibilityGates(world) {
    // Q162 and Q163 are the two the reference refuses to Dark Elves.
    const darkElf = await world.session(900);
    for (const id of [162, 163]) {
        assert.equal(await world.event(darkElf, id, 'start', byId(id).startNpc), false,
            `Q${id} must refuse a Dark Elf`);
        assert.equal(await world.questRow(900, id), null, `Q${id} left no state behind`);
    }
    // Q159 and Q166 are race-locked the other way.
    assert.equal(await world.event(darkElf, 159, 'start', byId(159).startNpc), false,
        'Q159 must refuse a non-Elf');

    const child = await world.session(901);
    assert.equal(await world.event(child, 152, 'start', byId(152).startNpc), false,
        'Q152 must refuse a level 1 applicant');
}

async function shardsOfGolem(world) {
    let session = await world.session(152);
    assert.ok(await world.event(session, 152, 'start', 7035), 'Harris accepts a level 10 applicant');
    assert.equal(await world.amount(152, 1008), 1, 'the first receipt is handed over');

    await world.talk(session, 7283);
    assert.equal(await world.amount(152, 1009), 1, 'Altran issues the second receipt');

    await withRandom([0.9], () => world.kill(session, 16));
    assert.equal(await world.amount(152, 1010), 0, 'a failed roll drops no shard');
    for (let i = 0; i < 6; i++) await withRandom([0.1], () => world.kill(session, 16));
    assert.equal(await world.amount(152, 1010), 5, 'the shard collection caps at five');
    assert.equal(world.state(session, 152).getInt('cond'), 3, 'five shards advance the cond');

    session = await world.reopen(152);
    await world.talk(session, 7283);
    assert.equal(await world.amount(152, 1011), 1, 'Altran forges the tool box');
    assert.equal(await world.amount(152, 1010), 0, 'the shards are consumed');

    await world.talk(session, 7035);
    assert.equal(await world.amount(152, 23), 1, 'the Wooden Breastplate is awarded');
    assert.equal(world.state(session, 152).state, 'completed', 'Q152 is one-time');
    assert.equal(await world.event(session, 152, 'start', 7035), false, 'Q152 cannot be replayed');
}

async function sacrificeToTheSea(world) {
    let session = await world.session(154);
    assert.ok(await world.event(session, 154, 'start', 7312), 'Rockswell accepts a level 2 applicant');

    for (let i = 0; i < 11; i++) await withRandom([0.1], () => world.kill(session, 481));
    assert.equal(await world.amount(154, 1032), 10, 'the fur collection caps at ten');

    await world.talk(session, 7051);
    assert.equal(await world.amount(154, 1033), 1, 'Cristel spins the yarn');
    session = await world.reopen(154);
    await world.talk(session, 7055);
    assert.equal(await world.amount(154, 1034), 1, 'Rolfe makes the doll');
    await world.talk(session, 7312);
    assert.equal(await world.amount(154, 113), 1, "the Mystic's Earring is awarded");
    assert.equal(world.state(session, 154).state, 'completed');
}

async function recoverSmuggledGoods(world) {
    let session = await world.session(157);
    assert.ok(await world.event(session, 157, 'start', 7005), 'Wilford accepts a level 5 applicant');
    for (let i = 0; i < 21; i++) await withRandom([0.1], () => world.kill(session, 121));
    assert.equal(await world.amount(157, 1024), 20, 'the ore collection caps at twenty');

    session = await world.reopen(157);
    await world.talk(session, 7005);
    assert.equal(await world.amount(157, 20), 1, 'the Buckler is awarded');
    assert.equal(await world.amount(157, 1024), 0, 'the ore is consumed');
    assert.equal(world.state(session, 157).state, 'completed');
}

async function protectTheWaterSource(world) {
    let session = await world.session(159);
    assert.ok(await world.event(session, 159, 'start', 7154), 'Asterios accepts an Elf');
    assert.equal(await world.amount(159, 1071), 1, 'the first charm is handed over');

    await withRandom([0.1], () => world.kill(session, 5017));
    assert.equal(await world.amount(159, 1035), 1, 'one dose of dust is taken');
    await world.talk(session, 7154);
    assert.equal(await world.amount(159, 1072), 1, 'the second charm is issued');
    assert.equal(await world.amount(159, 1071), 0, 'the first charm is consumed');

    for (let i = 0; i < 6; i++) await withRandom([0.1], () => world.kill(session, 5017));
    assert.equal(await world.amount(159, 1035), 5, 'the second sampling caps at five');

    session = await world.reopen(159);
    await world.talk(session, 7154);
    assert.equal(await world.amount(159, ADENA), 18250, 'Q159 pays exactly 18250 adena');
    assert.equal(world.state(session, 159).state, 'completed');
}

async function curseOfTheUndergroundFortress(world) {
    let session = await world.session(162);
    assert.ok(await world.event(session, 162, 'start', 7147), 'Unoren accepts a non Dark Elf');

    for (let i = 0; i < 4; i++) await withRandom([0.1], () => world.kill(session, 33));
    assert.equal(await world.amount(162, 1159), 3, 'the elf skulls cap at three');
    assert.equal(world.state(session, 162).getInt('cond'), 1, 'skulls alone do not advance');

    for (let i = 0; i < 11; i++) await withRandom([0.1], () => world.kill(session, 463));
    assert.equal(await world.amount(162, 1158), 10, 'the bone fragments cap at ten');
    assert.equal(world.state(session, 162).getInt('cond'), 2, 'both objectives advance the cond');

    session = await world.reopen(162);
    await world.talk(session, 7147);
    assert.equal(await world.amount(162, 625), 1, 'the Bone Shield is awarded');
    assert.equal(await world.amount(162, ADENA), 24000, 'Q162 pays exactly 24000 adena');
    assert.equal(world.state(session, 162).state, 'completed');
}

async function legacyOfThePoet(world) {
    let session = await world.session(163);
    assert.ok(await world.event(session, 163, 'start', 7220), 'Starden accepts a non Dark Elf');

    // One kill can yield several poems: each is an independent roll.
    await withRandom([0.05, 0.05, 0.05, 0.05], () => world.kill(session, 372));
    for (const poem of [1038, 1039, 1040, 1041]) {
        assert.equal(await world.amount(163, poem), 1, `poem ${poem} dropped on a low roll`);
    }
    assert.equal(world.state(session, 163).getInt('cond'), 2, 'all four poems advance the cond');
    await withRandom([0.05, 0.05, 0.05, 0.05], () => world.kill(session, 373));
    assert.equal(await world.amount(163, 1038), 1, 'a held poem never drops twice');

    session = await world.reopen(163);
    await world.talk(session, 7220);
    assert.equal(await world.amount(163, ADENA), 13890, 'Q163 pays exactly 13890 adena');
    assert.equal(world.state(session, 163).state, 'completed');
}

async function massOfDarkness(world) {
    let session = await world.session(166);
    assert.ok(await world.event(session, 166, 'start', 7130), 'Undrias accepts a Dark Elf');
    assert.equal(await world.amount(166, 1088), 1, "Undrias's letter is handed over");

    for (const [npc, item] of [[7143, 1091], [7135, 1089], [7139, 1090]]) {
        await world.talk(session, npc);
        assert.equal(await world.amount(166, item), 1, `NPC ${npc} contributed offering ${item}`);
        await world.talk(session, npc);
        assert.equal(await world.amount(166, item), 1, `NPC ${npc} contributes only once`);
    }
    assert.equal(world.state(session, 166).getInt('cond'), 2, 'all three offerings advance the cond');

    session = await world.reopen(166);
    await world.talk(session, 7130);
    assert.equal(await world.amount(166, ADENA), 500, 'Q166 pays exactly 500 adena');
    for (const item of [1088, 1089, 1090, 1091]) {
        assert.equal(await world.amount(166, item), 0, `offering ${item} is consumed`);
    }
    assert.equal(world.state(session, 166).state, 'completed');
}

async function dwarvenKinship(world) {
    // Branch A: Haprock forwards the letter and Norman pays the larger fee.
    let session = await world.session(167);
    assert.ok(await world.event(session, 167, 'start', 7350), 'Carlon accepts a level 15 applicant');
    assert.equal(await world.amount(167, 1076), 1, "Carlon's letter is handed over");

    assert.ok(await world.event(session, 167, 'haprock', 7255), 'Haprock forwards the letter');
    assert.equal(await world.amount(167, 1076), 0, "Carlon's letter is consumed");
    assert.equal(await world.amount(167, 1106), 1, "Norman's letter is issued");
    assert.equal(await world.amount(167, ADENA), 2000, 'Haprock pays 2000 for forwarding');

    session = await world.reopen(167);
    assert.ok(await world.event(session, 167, 'norman_finish', 7210), 'Norman settles the delivery');
    assert.equal(await world.amount(167, ADENA), 2000 + 20000, 'Norman pays a further 20000');
    assert.equal(world.state(session, 167).state, 'completed');

    // Branch B: Haprock buys the letter outright and the quest ends there.
    const quick = await world.session(902);
    assert.ok(await world.event(quick, 167, 'start', 7350));
    assert.ok(await world.event(quick, 167, 'haprock_sell', 7255), 'Haprock buys the letter');
    assert.equal(await world.amount(902, ADENA), 3000, 'the outright sale pays exactly 3000');
    assert.equal(await world.amount(902, 1106), 0, "no Norman letter is issued on this branch");
    assert.equal(world.state(quick, 167).state, 'completed', 'the sale ends the quest');
}

async function offspringOfNightmares(world) {
    let session = await world.session(169);
    assert.ok(await world.event(session, 169, 'start', 7145), 'Vlasty accepts a Dark Elf');

    // The cascade rolls the perfect skull first, then falls through to cracked.
    await withRandom([0.5, 0.1], () => world.kill(session, 105));
    assert.equal(await world.amount(169, 1031), 0, 'a high first roll yields no perfect skull');
    assert.equal(await world.amount(169, 1030), 1, 'the cascade falls through to a cracked skull');

    await withRandom([0.1], () => world.kill(session, 105));
    assert.equal(await world.amount(169, 1031), 1, 'a low first roll yields the perfect skull');
    assert.equal(world.state(session, 169).getInt('cond'), 2, 'the perfect skull advances the cond');

    // Once the perfect skull is held its tier is capped, so cracked skulls keep coming.
    await withRandom([0.1, 0.1], () => world.kill(session, 25));
    assert.equal(await world.amount(169, 1031), 1, 'no duplicate perfect skull');
    assert.equal(await world.amount(169, 1030), 2, 'the capped tier falls through to cracked');

    session = await world.reopen(169);
    await world.talk(session, 7145);
    assert.equal(await world.amount(169, ADENA), 17000 + 2 * 20,
        'Q169 pays 17000 plus 20 for each cracked skull');
    assert.equal(await world.amount(169, 31), 1, 'the Bone Gaiters are awarded');
    assert.equal(await world.amount(169, 1030) + await world.amount(169, 1031), 0,
        'every skull is consumed');
    assert.equal(world.state(session, 169).state, 'completed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
