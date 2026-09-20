// Lifecycle certification for the C4 first-village class quests (Q101-Q108).
//
// These eight share a reward shape: a class-appropriate weapon, 100 Lesser
// Healing Potions, an optional no-grade shot stack, ten of each Echo Crystal,
// and the beginner-shot grant for an eligible character. The bundle and the
// beginner receipt must commit with the final hand-in, and none of it may be
// paid twice.
const assert = require('node:assert/strict');
const { createWorld, withRandom } = require('./helpers/c4QuestHarness');

const ClassQuestReward = require('../src/GameServer/Quest/ClassQuestReward');

const POTION = 1060;
const ECHOES = ClassQuestReward.ECHO_CRYSTALS;
const SOULSHOT_BEGINNER = 5789;
const SPIRITSHOT_BEGINNER = 5790;
const SOULSHOT_NO_GRADE = 1835;
const SPIRITSHOT_NO_GRADE = 2509;

// Each quest's authored reward contract, taken from the pinned C4 handlers.
const CONTRACTS = {
    101: { race: 0, level: 9, weapon: 738, noGradeShots: false },
    102: { race: 1, level: 12, weapon: 743, mageWeapon: 744, noGradeShots: true },
    103: { race: 2, level: 11, weapon: 975, noGradeShots: true },
    104: { race: 0, level: 10, weapon: 747, noGradeShots: true },
    105: { race: 1, level: 10, weapon: 981, mageWeapon: 754, noGradeShots: false },
    106: { race: 2, level: 10, weapon: 989, noGradeShots: true },
    107: { race: 3, level: 12, weapon: 1510, noGradeShots: false, soulshotsOnly: true },
    108: { race: 4, level: 10, weapon: 1511, noGradeShots: false }
};

const CHARACTERS = [
    { id: 101, race: 0, classId: 0, level: 20, newbie: 1 },
    { id: 1010, race: 0, classId: 10, level: 20, newbie: 1 },
    { id: 1011, race: 4, classId: 0, level: 20, newbie: 1 },
    { id: 1012, race: 0, classId: 0, level: 5, newbie: 1 },
    { id: 1013, race: 0, classId: 0, level: 20, newbie: 0 },
    { id: 102, race: 1, classId: 18, level: 20, newbie: 1 },
    { id: 103, race: 2, classId: 31, level: 20, newbie: 1 },
    { id: 104, race: 0, classId: 0, level: 20, newbie: 1 },
    { id: 105, race: 1, classId: 25, level: 20, newbie: 1 },
    { id: 106, race: 2, classId: 31, level: 20, newbie: 1 },
    { id: 107, race: 3, classId: 44, level: 20, newbie: 1 },
    { id: 108, race: 4, classId: 53, level: 20, newbie: 1 }
];

// Every class quest ends with the same assertions about its bundle.
async function assertBundle(world, id, options) {
    const mage = Boolean(options && options.mage);
    const contract = CONTRACTS[id];
    const weapon = mage && contract.mageWeapon ? contract.mageWeapon : contract.weapon;
    assert.equal(await world.amount(id, weapon), 1, 'Q' + id + ' awards weapon ' + weapon);
    assert.equal(await world.amount(id, POTION), 100, 'Q' + id + ' awards 100 potions');
    for (const echo of ECHOES) {
        assert.equal(await world.amount(id, echo), 10, 'Q' + id + ' awards ten of echo ' + echo);
    }
    if (contract.noGradeShots) {
        assert.equal(await world.amount(id, mage ? SPIRITSHOT_NO_GRADE : SOULSHOT_NO_GRADE),
            mage ? 500 : 1000, 'Q' + id + ' awards the no-grade shots');
    } else {
        assert.equal(await world.amount(id, SOULSHOT_NO_GRADE)
            + await world.amount(id, SPIRITSHOT_NO_GRADE), 0, 'Q' + id + ' awards no no-grade shots');
    }
    const spiritshots = mage && !contract.soulshotsOnly;
    assert.equal(await world.amount(id, spiritshots ? SPIRITSHOT_BEGINNER : SOULSHOT_BEGINNER),
        spiritshots ? 3000 : 7000, 'Q' + id + ' awards the beginner shots');
    assert.equal(Number((await world.character(id)).newbieShotsReceived), 1,
        'Q' + id + ' committed the beginner receipt with the reward');
    assert.equal(world.state(world.sessions.get(id), id).state, 'completed', 'Q' + id + ' is one-time');
}

async function main() {
    const world = await createWorld(CHARACTERS, 'c4-class');
    try {
        await rewardContractsAreAuthored();
        await swordOfSolidarity(world);
        await seaOfSporesFever(world);
        await spiritOfCraftsman(world);
        await spiritOfMirrors(world);
        await skirmishWithTheOrcs(world);
        await forgottenTruth(world);
        await mercilessPunishment(world);
        await jumbleTumbleDiamondFuss(world);
        console.log('C4 class quests: authored reward contracts, all eight full routes, '
            + 'atomic bundles, beginner receipts and replay rejection passed');
    } finally {
        await world.close();
    }
}

// The shared bundle helper must produce exactly what each quest's C4 handler pays.
async function rewardContractsAreAuthored() {
    for (const [id, contract] of Object.entries(CONTRACTS)) {
        for (const mage of [false, true]) {
            const actor = {
                newbie: 1, newbieShotsReceived: 0,
                fetchRace: () => contract.race,
                // 10 is Human Mystic; 0 is Human Fighter.
                fetchClassId: () => (mage ? 10 : 0)
            };
            const { gives, beginner } = ClassQuestReward.bundle(actor, contract);
            const byItem = new Map(gives);

            const expectedWeapon = mage && contract.mageWeapon ? contract.mageWeapon : contract.weapon;
            assert.equal(byItem.get(expectedWeapon), 1, `Q${id} awards weapon ${expectedWeapon}`);
            assert.equal(byItem.get(POTION), 100, `Q${id} awards 100 lesser healing potions`);
            for (const echo of ECHOES) {
                assert.equal(byItem.get(echo), 10, `Q${id} awards ten of echo crystal ${echo}`);
            }

            if (contract.noGradeShots) {
                assert.equal(byItem.get(mage ? SPIRITSHOT_NO_GRADE : SOULSHOT_NO_GRADE),
                    mage ? 500 : 1000, `Q${id} awards the no-grade shot stack`);
            } else {
                assert.equal(byItem.has(SPIRITSHOT_NO_GRADE) || byItem.has(SOULSHOT_NO_GRADE), false,
                    `Q${id} awards no no-grade shots`);
            }

            // The class-quest group allows a second beginner grant, at 7000/3000.
            const wantsSpiritshots = mage && !contract.soulshotsOnly;
            assert.equal(byItem.get(wantsSpiritshots ? SPIRITSHOT_BEGINNER : SOULSHOT_BEGINNER),
                wantsSpiritshots ? 3000 : 7000, `Q${id} awards the beginner shots`);
            assert.equal(beginner.received, 1, `Q${id} records the beginner receipt`);
        }

        // A character who already holds two grants receives no more shots.
        const spent = {
            newbie: 1, newbieShotsReceived: 2,
            fetchRace: () => contract.race, fetchClassId: () => 0
        };
        const exhausted = ClassQuestReward.bundle(spent, contract);
        assert.equal(exhausted.beginner, null, `Q${id} stops at two beginner grants`);
        assert.equal(new Map(exhausted.gives).has(SOULSHOT_BEGINNER), false,
            `Q${id} pays no beginner shots once the counter is spent`);
    }
}

// Q101 is driven end to end: the full route, the exact bundle, and replay rejection.
async function swordOfSolidarity(world) {
    const ROIEN = 7008;
    const ALTRAN = 7283;
    const [LETTER, DIRECTIONS, TOP, BOTTOM, NOTE, HANDLE, SWORD] = [796, 937, 741, 740, 742, 739, 738];

    // Gates first: wrong race and under-level applicants leave no state behind.
    const dwarf = await world.session(1011);
    assert.equal(await world.event(dwarf, 101, 'start', ROIEN), false, 'Q101 refuses a Dwarf');
    assert.equal(await world.questRow(1011, 101), null, 'the refusal left no quest state');
    const child = await world.session(1012);
    assert.equal(await world.event(child, 101, 'start', ROIEN), false, 'Q101 refuses a level 5 human');

    let session = await world.session(101);
    assert.ok(await world.event(session, 101, 'start', ROIEN), 'Roien accepts a level 9 human');
    assert.equal(await world.amount(101, LETTER), 1, "Roien's letter is handed over");

    assert.ok(await world.event(session, 101, 'dir', ALTRAN), 'Altran trades the letter for directions');
    assert.equal(await world.amount(101, LETTER), 0, 'the letter is consumed');
    assert.equal(await world.amount(101, DIRECTIONS), 1, 'the directions are handed over');

    // The blade halves only drop at cond 2, one of each, at the authored rate.
    await withRandom([0.9], () => world.kill(session, 361));
    assert.equal(await world.amount(101, TOP) + await world.amount(101, BOTTOM), 0,
        'a failed roll drops no blade fragment');
    await withRandom([0.1], () => world.kill(session, 361));
    await withRandom([0.1], () => world.kill(session, 362));
    assert.equal(await world.amount(101, TOP), 1, 'the blade top dropped once');
    assert.equal(await world.amount(101, BOTTOM), 1, 'the blade bottom dropped once');
    assert.equal(world.state(session, 101).getInt('cond'), 3, 'both halves advance the cond');
    await withRandom([0.1], () => world.kill(session, 361));
    assert.equal(await world.amount(101, TOP), 1, 'no duplicate fragment is granted');

    session = await world.reopen(101);
    assert.equal(world.state(session, 101).getInt('cond'), 3, 'the cond survives a restart');

    assert.ok(await world.event(session, 101, 'note', ALTRAN), 'Altran takes the halves and directions');
    assert.equal(await world.amount(101, DIRECTIONS) + await world.amount(101, TOP)
        + await world.amount(101, BOTTOM), 0, 'all three are consumed together');
    assert.equal(await world.amount(101, NOTE), 1, "Altran's note is handed over");

    assert.ok(await world.event(session, 101, 'handle', ROIEN), 'Roien trades the note for the handle');
    assert.equal(await world.amount(101, HANDLE), 1, 'the broken handle is handed over');

    // The reward cannot be claimed while the handle is missing.
    const spoiled = await world.session(1013);
    assert.equal(await world.event(spoiled, 101, 'reward', ALTRAN), false,
        'Q101 pays nothing to a character who never started it');

    assert.ok(await world.event(session, 101, 'reward', ALTRAN), 'Altran completes the quest');
    assert.equal(await world.amount(101, HANDLE), 0, 'the handle is consumed');
    assert.equal(await world.amount(101, SWORD), 1, 'the Sword of Solidarity is awarded');
    assert.equal(await world.amount(101, POTION), 100, '100 lesser healing potions are awarded');
    for (const echo of ECHOES) {
        assert.equal(await world.amount(101, echo), 10, `ten of echo crystal ${echo} are awarded`);
    }
    assert.equal(await world.amount(101, SOULSHOT_BEGINNER), 7000,
        'an eligible fighter receives 7000 beginner soulshots');
    assert.equal(await world.amount(101, SOULSHOT_NO_GRADE), 0,
        'Q101 awards no no-grade soulshots');
    assert.equal(Number((await world.character(101)).newbieShotsReceived), 1,
        'the beginner receipt committed with the reward');
    assert.equal(world.state(session, 101).state, 'completed', 'Q101 is one-time');

    // Replay must pay nothing, before or after a restart.
    assert.equal(await world.event(session, 101, 'reward', ALTRAN), false, 'the reward cannot be reclaimed');
    assert.equal(await world.event(session, 101, 'start', ROIEN), false, 'the quest cannot be restarted');
    session = await world.reopen(101);
    assert.equal(await world.amount(101, SWORD), 1, 'no second sword survives a restart');
    assert.equal(await world.amount(101, SOULSHOT_BEGINNER), 7000, 'no second beginner grant');
    assert.equal(Number((await world.character(101)).newbieShotsReceived), 1,
        'the receipt is still exactly one');
}


// Q102: Alberius sends an Elf for dryad tears, then distributes five medicines.
async function seaOfSporesFever(world) {
    const ALBERIUS = 7284, COBENDELL = 7156;
    const HEALERS = [7217, 7219, 7221, 7285];
    const LETTER = 964, AMULET = 965, TEARS = 966, LIST = 746;
    const MEDICINES = [1130, 1131, 1132, 1133, 1134];

    let session = await world.session(102);
    assert.ok(await world.event(session, 102, 'start', ALBERIUS), 'Alberius accepts an Elf');
    assert.equal(await world.amount(102, LETTER), 1, 'his letter is handed over');

    await world.talk(session, COBENDELL);
    assert.equal(await world.amount(102, AMULET), 1, 'Cobendell trades the letter for the amulet');

    for (let i = 0; i < 10; i++) await withRandom([0.1], () => world.kill(session, 13));
    assert.equal(await world.amount(102, TEARS), 10, 'ten dryad tears were collected');
    await withRandom([0.1], () => world.kill(session, 19));
    assert.equal(await world.amount(102, TEARS), 10, 'the collection is capped at ten');

    await world.talk(session, COBENDELL);
    for (const medicine of MEDICINES) {
        assert.equal(await world.amount(102, medicine), 1, 'medicine ' + medicine + ' was prepared');
    }
    await world.talk(session, ALBERIUS);
    assert.equal(await world.amount(102, LIST), 1, 'the delivery list is handed over');

    session = await world.reopen(102);
    for (const healer of HEALERS) await world.talk(session, healer);
    assert.equal(world.state(session, 102).getInt('cond'), 6, 'all four healers were served');

    await world.talk(session, ALBERIUS);
    await assertBundle(world, 102);
    assert.equal(await world.amount(102, LIST), 0, 'the list is consumed at completion');
    assert.equal(await world.event(session, 102, 'start', ALBERIUS), false, 'Q102 cannot be replayed');
}

// Q103: a Dark Elf chain through Karrod, Cekton and Harne.
async function spiritOfCraftsman(world) {
    const KARROD = 7307, CEKTON = 7132, HARNE = 7144;
    const LETTER = 968, V1 = 969, V2 = 970, CATCHER = 971, OIL = 972, HEAD = 973, STEEL = 974, BONE = 1107;

    let session = await world.session(103);
    assert.ok(await world.event(session, 103, 'start', KARROD), 'Karrod accepts a Dark Elf');
    await world.talk(session, CEKTON);
    assert.equal(await world.amount(103, V1), 1, 'the first voucher is issued');
    await world.talk(session, HARNE);
    assert.equal(await world.amount(103, V2), 1, 'the second voucher is issued');

    for (let i = 0; i < 10; i++) await withRandom([0.1], () => world.kill(session, 455));
    assert.equal(await world.amount(103, BONE), 10, 'ten bone fragments were collected');

    await world.talk(session, HARNE);
    assert.equal(await world.amount(103, CATCHER), 1, 'the soul catcher is issued');
    assert.equal(await world.amount(103, BONE), 0, 'the fragments are consumed');
    await world.talk(session, CEKTON);
    assert.equal(await world.amount(103, OIL), 1, 'the preserving oil is issued');

    await withRandom([0.1], () => world.kill(session, 15));
    assert.equal(await world.amount(103, HEAD), 1, 'the zombie head is taken with the oil');
    assert.equal(await world.amount(103, OIL), 0, 'the oil is consumed');

    session = await world.reopen(103);
    await world.talk(session, CEKTON);
    assert.equal(await world.amount(103, STEEL), 1, 'the steelbender head is produced');
    await world.talk(session, KARROD);
    await assertBundle(world, 103);
    assert.equal(await world.amount(103, LETTER), 0, 'no quest documents remain');
}

// Q104: three oak wands bound on three named spirits, each only while wielded.
async function spiritOfMirrors(world) {
    const GALLINT = 7017;
    const OAK_WAND = 748;
    const BOUND = [1135, 1136, 1137];
    const SPIRITS = [5003, 5004, 5005];

    let session = await world.session(104);
    assert.ok(await world.event(session, 104, 'start', GALLINT), 'Gallint accepts a Human');
    assert.equal(await world.amount(104, OAK_WAND), 3, 'three oak wands are handed over');

    // Without the wand wielded the spirits yield nothing.
    await world.kill(session, SPIRITS[0]);
    assert.equal(await world.amount(104, BOUND[0]), 0, 'an unwielded wand binds no spirit');

    for (let i = 0; i < SPIRITS.length; i++) {
        await world.equip(session, OAK_WAND);
        await world.kill(session, SPIRITS[i]);
        assert.equal(await world.amount(104, BOUND[i]), 1, 'spirit ' + SPIRITS[i] + ' bound its wand');
        await world.kill(session, SPIRITS[i]);
        assert.equal(await world.amount(104, BOUND[i]), 1, 'a bound spirit yields no duplicate');
    }
    assert.equal(world.state(session, 104).getInt('cond'), 3, 'all three wands are bound');

    session = await world.reopen(104);
    await world.talk(session, GALLINT);
    await assertBundle(world, 104);
    for (const bound of BOUND) {
        assert.equal(await world.amount(104, bound), 0, 'bound wand ' + bound + ' is consumed');
    }
}

// Q105: two tiers of Kaboo chiefs, each unlocked by a randomly issued order.
async function skirmishWithTheOrcs(world) {
    const KENDELL = 7218;
    const ORDERS_1 = [1836, 1837, 1838, 1839];
    const ORDERS_2 = [1840, 1841, 1842, 1843];
    const CHIEFS_1 = [5059, 5060, 5061, 5062];
    const CHIEFS_2 = [5064, 5065, 5067, 5068];

    let session = await world.session(105);
    // A fixed roll makes the issued order deterministic: the first of each tier.
    await withRandom([0], () => world.event(session, 105, 'start', KENDELL));
    assert.equal(await world.amount(105, ORDERS_1[0]), 1, 'the first-tier order is issued');

    // Only the chief named by the held order counts.
    await world.kill(session, CHIEFS_1[1]);
    assert.equal(world.state(session, 105).getInt('cond'), 1, 'the wrong chief does not advance');
    await world.kill(session, CHIEFS_1[0]);
    assert.equal(await world.amount(105, 1844), 1, 'the named chief yields the first torc');
    assert.equal(world.state(session, 105).getInt('cond'), 2, 'the first tier is complete');

    await withRandom([0], () => world.talk(session, KENDELL));
    assert.equal(await world.amount(105, ORDERS_2[0]), 1, 'the second-tier order is issued');
    assert.equal(await world.amount(105, 1844), 0, 'the first torc is consumed');

    await world.kill(session, CHIEFS_2[0]);
    assert.equal(await world.amount(105, 1845), 1, 'the second chief yields the second torc');

    session = await world.reopen(105);
    await world.talk(session, KENDELL);
    // Character 105 is an Elven Mystic, so the mage weapon applies.
    await assertBundle(world, 105, { mage: true });
    assert.equal(await world.amount(105, 1845), 0, 'the torc is consumed at completion');
}

// Q106: a Dark Elf recovers two relics for Thifiell.
async function forgottenTruth(world) {
    const THIFIELL = 7358, KARTIA = 7133;
    const ORDER = 984, PERMISSION = 985, SCROLL = 986, CLAY = 987, TRANSLATION = 988;

    let session = await world.session(106);
    assert.ok(await world.event(session, 106, 'start', THIFIELL), 'Thifiell accepts a Dark Elf');
    await world.talk(session, KARTIA);
    assert.equal(await world.amount(106, PERMISSION), 1, 'Kartia issues the permission');
    assert.equal(await world.amount(106, ORDER), 0, 'the order is consumed');

    await withRandom([0.1], () => world.kill(session, 5070));
    await withRandom([0.1], () => world.kill(session, 5070));
    assert.equal(await world.amount(106, SCROLL) + await world.amount(106, CLAY), 2,
        'both relics were recovered');
    assert.equal(world.state(session, 106).getInt('cond'), 3, 'the relics advance the cond');

    session = await world.reopen(106);
    await world.talk(session, KARTIA);
    assert.equal(await world.amount(106, TRANSLATION), 1, 'Kartia produces the translation');
    await world.talk(session, THIFIELL);
    await assertBundle(world, 106);
    assert.equal(await world.amount(106, TRANSLATION), 0, 'the translation is consumed');
}

// Q107: three Orc orders, each answered by one letter from a named target.
async function mercilessPunishment(world) {
    const HATOS = 7568, PARUGON = 7580;
    const ORDERS = [1553, 1554, 1555];
    const LETTERS = [1557, 1556, 1558];

    let session = await world.session(107);
    assert.ok(await world.event(session, 107, 'start', HATOS), 'Hatos accepts an Orc');
    assert.equal(await world.amount(107, ORDERS[0]), 1, 'the first order is issued');
    await world.talk(session, PARUGON);
    assert.equal(world.state(session, 107).getInt('cond'), 2, 'Parugon points at the target');

    for (let i = 0; i < 3; i++) {
        await world.kill(session, 5041);
        assert.equal(await world.amount(107, LETTERS[i]), 1, 'letter ' + LETTERS[i] + ' was taken');
        if (i < 2) {
            await world.talk(session, HATOS);
            assert.equal(await world.amount(107, ORDERS[i + 1]), 1, 'the next order was issued');
        }
        if (i === 0) session = await world.reopen(107);
    }

    await world.talk(session, HATOS);
    await assertBundle(world, 107);
    for (const order of ORDERS) {
        assert.equal(await world.amount(107, order), 0, 'order ' + order + ' is consumed');
    }
    for (const letter of LETTERS) {
        assert.equal(await world.amount(107, letter), 0, 'letter ' + letter + ' is consumed');
    }
}

// Q108: a long Dwarven courier chain ending in the Star Diamond.
async function jumbleTumbleDiamondFuss(world) {
    const GOUPH = 7523, REED = 7516, MURDOC = 7521, AIRY = 7522;
    const BRUNON = 7526, MARON = 7529, TOROCCO = 7555;
    const I = [1559, 1560, 1561, 1562, 1563, 1564, 1565, 1566, 1567, 1568, 1569, 1570, 1571];

    let session = await world.session(108);
    assert.ok(await world.event(session, 108, 'start', GOUPH), 'Gouph accepts a Dwarf');
    assert.equal(await world.amount(108, I[0]), 1, 'the first parcel is issued');

    const CHAIN = [[REED, 1], [TOROCCO, 2], [MARON, 3], [BRUNON, 4]];
    for (const step of CHAIN) {
        await world.talk(session, step[0]);
        assert.equal(await world.amount(108, I[step[1]]), 1, 'parcel ' + I[step[1]] + ' was issued');
    }

    // The two gems arrive together on a successful roll from either mob.
    await withRandom([0.1], () => world.kill(session, 323));
    assert.equal(await world.amount(108, I[5]) + await world.amount(108, I[6]), 2,
        'both gems were recovered');
    assert.equal(world.state(session, 108).getInt('cond'), 6, 'the gems advance the cond');

    session = await world.reopen(108);
    await world.talk(session, BRUNON);
    assert.equal(await world.amount(108, I[7]), 1, 'the gem box was assembled');
    await world.talk(session, GOUPH);
    assert.equal(await world.amount(108, I[8]), 1, 'the coal piece was issued');
    await world.talk(session, BRUNON);
    await world.talk(session, MURDOC);
    await world.talk(session, AIRY);
    assert.equal(await world.amount(108, I[11]), 1, 'the last courier item was issued');

    await withRandom([0.9], () => world.kill(session, 480));
    assert.equal(await world.amount(108, I[12]), 0, 'a failed roll yields no diamond');
    await withRandom([0.1], () => world.kill(session, 480));
    assert.equal(await world.amount(108, I[12]), 1, 'the Star Diamond was recovered');

    await world.talk(session, GOUPH);
    await assertBundle(world, 108);
    assert.equal(await world.amount(108, I[12]), 0, 'the diamond is consumed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
