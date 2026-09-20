// Full lifecycle certification for the C4 starter quests (Q1-Q10, Q45-Q49).
//
// Each quest is driven end to end through QuestService against a real database:
// eligibility gates, every hand-in in order, the reward the pinned C4 handler
// awards, restart persistence, and the guarantee that a completed one-time quest
// cannot be replayed for a second reward.
const assert = require('node:assert/strict');
const { createWorld } = require('./helpers/c4QuestHarness');

const Definitions = require('../src/GameServer/Quest/StarterQuestDefinitions');
const byId = id => Definitions.find(d => d.id === id);

const MARK = 7570;
const CHARACTERS = [
    { id: 1, race: 0, level: 20 }, { id: 2, race: 0, level: 20 }, { id: 3, race: 2, level: 20 },
    { id: 4, race: 3, level: 20 }, { id: 5, race: 4, level: 20 }, { id: 6, race: 0, level: 20 },
    { id: 7, race: 1, level: 20 }, { id: 8, race: 2, level: 20 }, { id: 9, race: 3, level: 20 },
    { id: 10, race: 4, level: 20 },
    { id: 45, race: 0, level: 20 }, { id: 46, race: 1, level: 20 }, { id: 47, race: 2, level: 20 },
    { id: 48, race: 3, level: 20 }, { id: 49, race: 4, level: 20 },
    // Gate probes: wrong race and under-level applicants for representative quests.
    { id: 101, race: 4, level: 20 }, { id: 102, race: 0, level: 1 }, { id: 103, race: 0, level: 20 }
];

async function main() {
    const world = await createWorld(CHARACTERS, 'c4-starter');
    try {
        await eligibilityGates(world);
        await lettersOfLove(world);
        await whatWomenWant(world);
        await willTheSealBeBroken(world);
        await paagrioOfferings(world);
        await minersFavor(world);
        await travelerRoutes(world);
        await galladucciErrands(world);
        console.log('C4 starter quests: eligibility, ordered hand-ins, exact rewards, '
            + 'restart persistence and replay rejection passed');
    } finally {
        await world.close();
    }
}

// Every definition must refuse an ineligible applicant before any state exists.
async function eligibilityGates(world) {
    const wrongRace = await world.session(101);
    for (const d of Definitions.filter(q => q.race !== undefined || q.races)) {
        const permitted = d.races || [d.race];
        if (permitted.includes(4)) continue;
        assert.equal(await world.event(wrongRace, d.id, 'start', d.startNpc), false,
            `Q${d.id} must reject a Dwarf applicant`);
        assert.equal(await world.questRow(101, d.id), null, `Q${d.id} left state behind on a race refusal`);
    }

    const underLevel = await world.session(102);
    assert.equal(await world.event(underLevel, 1, 'start', byId(1).startNpc), false,
        'Q1 must reject a level 1 applicant');
    assert.equal(await world.questRow(102, 1), null, 'Q1 left state behind on a level refusal');

    // Q45-Q49 additionally require the Mark of Traveler earned by Q6-Q10.
    const noMark = await world.session(103);
    assert.equal(await world.event(noMark, 45, 'start', byId(45).startNpc), false,
        'Q45 must reject an applicant without a Mark of Traveler');
    assert.equal(await world.questRow(103, 45), null, 'Q45 left state behind without the Mark');
}

async function lettersOfLove(world) {
    let session = await world.session(1);
    assert.ok(await world.event(session, 1, 'start', 7048), 'Darin must accept a level 2 human');
    assert.equal(await world.amount(1, 687), 1, "Darin's letter is handed over at start");

    await world.talk(session, 7006);
    assert.equal(await world.amount(1, 687), 0, "Roxxy consumes Darin's letter");
    assert.equal(await world.amount(1, 688), 1, "Roxxy hands over her kerchief");

    // Restart mid-errand: the kerchief and the cond must both survive.
    session = await world.reopen(1);
    assert.equal(world.state(session, 1).getInt('cond'), 2, 'cond survives a restart');

    await world.talk(session, 7048);
    assert.equal(await world.amount(1, 688), 0, 'Darin consumes the kerchief');
    assert.equal(await world.amount(1, 1079), 1, 'Darin hands over his receipt');

    // Talking to Baulro out of order earlier must not have skipped a step.
    await world.talk(session, 7033);
    assert.equal(await world.amount(1, 1079), 0, 'Baulro consumes the receipt');
    assert.equal(await world.amount(1, 1080), 1, "Baulro hands over his potion");

    await world.talk(session, 7048);
    assert.equal(await world.amount(1, 1080), 0, 'the potion is consumed at completion');
    assert.equal(await world.amount(1, 906), 1, 'Necklace of Knowledge is the C4 reward');
    assert.equal(world.state(session, 1).state, 'completed', 'Q1 is one-time');

    // A completed one-time quest cannot be restarted for a second necklace.
    assert.equal(await world.event(session, 1, 'start', 7048), false, 'Q1 cannot be replayed');
    assert.equal(await world.amount(1, 906), 1, 'no second necklace was granted');
}

async function whatWomenWant(world) {
    // Branch A: the poetry errand, which ends with Mystic's Earring 113.
    let session = await world.session(2);
    assert.ok(await world.event(session, 2, 'start', 7223), 'Arujien accepts a human');
    await world.talk(session, 7146);
    await world.talk(session, 7150);
    assert.equal(await world.amount(2, 1094), 1, "Herbiel's reply is in hand at the branch point");

    assert.ok(await world.event(session, 2, 'poetry', 7223), 'the poetry branch is offered');
    assert.equal(await world.amount(2, 1094), 0, 'the reply is consumed by the poetry branch');
    assert.equal(await world.amount(2, 689), 1, 'the poetry book is handed over');

    await world.talk(session, 7157);
    assert.equal(await world.amount(2, 693), 1, "Greenis's letter is handed over");
    session = await world.reopen(2);
    await world.talk(session, 7223);
    assert.equal(await world.amount(2, 113), 1, "Mystic's Earring is the C4 poetry-branch reward");
    assert.equal(await world.amount(2, 57), 0, 'the poetry branch pays no adena');
    assert.equal(world.state(session, 2).state, 'completed');

    // Branch B: the early payout, 450 adena and no earring.
    const quick = await world.session(103);
    assert.ok(await world.event(quick, 2, 'start', 7223));
    await world.talk(quick, 7146);
    await world.talk(quick, 7150);
    assert.ok(await world.event(quick, 2, 'reward', 7223), 'the early payout branch is offered');
    assert.equal(await world.amount(103, 57), 450, 'the early branch pays exactly 450 adena');
    assert.equal(await world.amount(103, 113), 0, 'the early branch awards no earring');
    assert.equal(await world.amount(103, 1094), 0, 'the early branch consumes the reply');
    assert.equal(world.state(quick, 2).state, 'completed');
}

async function willTheSealBeBroken(world) {
    let session = await world.session(3);
    assert.ok(await world.event(session, 3, 'start', 7141), 'Talloth accepts a level 16 dark elf');

    // Each species yields its own token, and only ever one of it.
    await world.kill(session, 31);
    await world.kill(session, 31);
    assert.equal(await world.amount(3, 1081), 1, "a second Omen Beast adds no duplicate eye");

    await world.kill(session, 41);
    assert.equal(await world.amount(3, 1082), 1, 'the tainted zombie yields the taint stone');
    await world.kill(session, 46);
    assert.equal(await world.amount(3, 1082), 1, 'the stink zombie adds no duplicate taint stone');

    assert.equal(world.state(session, 3).getInt('cond'), 1, 'cond holds until every token is held');
    await world.kill(session, 57);
    assert.equal(await world.amount(3, 1083), 1, 'the lesser succubus yields succubus blood');
    assert.equal(world.state(session, 3).getInt('cond'), 2, 'cond advances once all three are held');

    session = await world.reopen(3);
    await world.talk(session, 7141);
    assert.equal(await world.amount(3, 956), 1, 'Enchant Armor D is the C4 reward');
    assert.equal(await world.amount(3, 1081) + await world.amount(3, 1082) + await world.amount(3, 1083), 0,
        'the quest tokens are consumed at completion');
    assert.equal(world.state(session, 3).state, 'completed');
}

async function paagrioOfferings(world) {
    const GIFTS = [[7566, 1541], [7585, 1542], [7562, 1543], [7560, 1544], [7559, 1545], [7587, 1546]];
    let session = await world.session(4);
    assert.ok(await world.event(session, 4, 'start', 7578), 'Nakusin accepts a level 2 orc');

    // Collected in a deliberately shuffled order; each elder gives exactly once.
    for (const [npc, item] of [...GIFTS].reverse()) {
        await world.talk(session, npc);
        assert.equal(await world.amount(4, item), 1, `NPC ${npc} hands over offering ${item}`);
        await world.talk(session, npc);
        assert.equal(await world.amount(4, item), 1, `NPC ${npc} must not hand over a duplicate`);
    }
    assert.equal(world.state(session, 4).getInt('cond'), 2, 'cond advances once all six are held');

    session = await world.reopen(4);
    await world.talk(session, 7578);
    assert.equal(await world.amount(4, 4), 1, "Pa'agrio's club is the C4 reward");
    for (const [, item] of GIFTS) {
        assert.equal(await world.amount(4, item), 0, `offering ${item} is consumed at completion`);
    }
    assert.equal(world.state(session, 4).state, 'completed');
}

async function minersFavor(world) {
    let session = await world.session(5);
    assert.ok(await world.event(session, 5, 'start', 7554), 'Bolter accepts a level 2 applicant');
    assert.equal(await world.amount(5, 1547), 1, "Bolter's list is handed over at start");
    assert.equal(await world.amount(5, 1552), 1, 'the smelly socks are handed over at start');

    for (const [npc, item] of [[7517, 1550], [7518, 1548], [7520, 1551]]) {
        await world.talk(session, npc);
        assert.equal(await world.amount(5, item), 1, `NPC ${npc} supplies item ${item}`);
        await world.talk(session, npc);
        assert.equal(await world.amount(5, item), 1, `NPC ${npc} must not supply a duplicate`);
    }

    // Brunon only trades once the socks are actually in hand, and consumes them.
    assert.equal(world.state(session, 5).getInt('cond'), 1, 'the pick is still missing');
    assert.ok(await world.event(session, 5, 'pick', 7526), 'Brunon trades the pick for the socks');
    assert.equal(await world.amount(5, 1552), 0, 'the socks are consumed by the trade');
    assert.equal(await world.amount(5, 1549), 1, 'the pick is handed over');
    assert.equal(world.state(session, 5).getInt('cond'), 2, 'cond advances once all four are held');

    // The trade cannot be repeated for a second pick without socks.
    assert.equal(await world.event(session, 5, 'pick', 7526), false, 'Brunon cannot be traded with twice');
    assert.equal(await world.amount(5, 1549), 1, 'no duplicate pick was granted');

    session = await world.reopen(5);
    await world.talk(session, 7554);
    assert.equal(await world.amount(5, 906), 1, 'Necklace of Knowledge is the C4 reward');
    for (const item of [1547, 1548, 1549, 1550, 1551]) {
        assert.equal(await world.amount(5, item), 0, `supply ${item} is consumed at completion`);
    }
    assert.equal(world.state(session, 5).state, 'completed');
}

// Q6-Q10 each end with the Mark of Traveler plus that village's escape scroll.
// Their steps are driven through the same bypass links the client sends.
async function travelerRoutes(world) {
    const ROUTES = [
        { id: 6, steps: [[7033, 'letter'], [7311, 'deliver'], [7006, 'reward']], carried: 7571, escape: 7559 },
        { id: 7, steps: [[7148, 'recommendation'], [7154, 'deliver'], [7146, 'reward']], carried: 7572, escape: 7559 },
        { id: 8, steps: [[7355, 'note'], [7144, 'deliver'], [7134, 'reward']], carried: 7573, escape: 7559 },
        { id: 9, steps: [[7571, 'council'], [7576, 'reward']], carried: null, escape: 7126 },
        { id: 10, steps: [[7520, 'necklace'], [7650, 'appraise'], [7520, 'report'], [7533, 'reward']],
            carried: 7574, escape: 7559 }
    ];
    for (const route of ROUTES) {
        const d = byId(route.id);
        let session = await world.session(route.id);
        assert.ok(await world.event(session, route.id, 'start', d.startNpc),
            `Q${route.id} accepts its own race at level 3`);

        // The final reward link must refuse to fire before the route is walked.
        const [finalNpc, finalEvent] = route.steps.at(-1);
        assert.equal(await world.event(session, route.id, finalEvent, finalNpc), false,
            `Q${route.id} cannot claim its reward before the route is complete`);

        for (let i = 0; i < route.steps.length; i++) {
            if (i === route.steps.length - 1) session = await world.reopen(route.id);
            const [npc, event] = route.steps[i];
            assert.ok(await world.event(session, route.id, event, npc),
                `Q${route.id} step ${event} runs at NPC ${npc}`);
        }

        assert.equal(await world.amount(route.id, MARK), 1, `Q${route.id} awards the Mark of Traveler`);
        assert.equal(await world.amount(route.id, route.escape), 1,
            `Q${route.id} awards escape scroll ${route.escape}`);
        if (route.carried) {
            assert.equal(await world.amount(route.id, route.carried), 0,
                `Q${route.id} consumes its carried item`);
        }
        assert.equal(world.state(session, route.id).state, 'completed', `Q${route.id} is one-time`);
        assert.equal(await world.event(session, route.id, 'start', d.startNpc), false,
            `Q${route.id} cannot be replayed`);
        assert.equal(await world.amount(route.id, MARK), 1, `Q${route.id} granted no second Mark`);
    }
}

// Q45-Q49 spend the Mark of Traveler on a race-specific special escape scroll.
async function galladucciErrands(world) {
    const SCROLLS = { 45: 7554, 46: 7555, 47: 7556, 48: 7557, 49: 7558 };
    for (const id of [45, 46, 47, 48, 49]) {
        let session = await world.session(id);
        // Grant the Mark the way Q6-Q10 would have, then prove it is required.
        assert.equal(await world.event(session, id, 'start', 7097), false,
            `Q${id} refuses an applicant with no Mark of Traveler`);
        const Service = require('../src/GameServer/Quest/QuestService');
        await Service.giveItem(session, MARK, 1);

        assert.ok(await world.event(session, id, 'start', 7097), `Q${id} accepts once the Mark is held`);
        assert.equal(await world.amount(id, 7563), 1, `Q${id} hands over the first order`);

        const steps = [[7094, 'hilt', 7563, 7568], [7097, 'order2', 7568, 7564],
            [7090, 'powder', 7564, 7567], [7097, 'order3', 7567, 7565],
            [7116, 'necklace', 7565, 7566]];
        for (const [npc, event, consumed, produced] of steps) {
            assert.ok(await world.event(session, id, event, npc), `Q${id} step ${event} runs at NPC ${npc}`);
            assert.equal(await world.amount(id, consumed), 0, `Q${id} step ${event} consumes ${consumed}`);
            assert.equal(await world.amount(id, produced), 1, `Q${id} step ${event} produces ${produced}`);
        }

        session = await world.reopen(id);
        assert.equal(world.state(session, id).getInt('cond'), 6, `Q${id} cond survives a restart`);
        assert.ok(await world.event(session, id, 'reward', 7097), `Q${id} completes at Galladucci`);
        assert.equal(await world.amount(id, SCROLLS[id]), 1, `Q${id} awards scroll ${SCROLLS[id]}`);
        assert.equal(await world.amount(id, MARK), 0, `Q${id} consumes the Mark of Traveler`);
        assert.equal(await world.amount(id, 7566), 0, `Q${id} consumes the purified necklace`);
        assert.equal(world.state(session, id).state, 'completed', `Q${id} is one-time`);

        // Without a fresh Mark the completed errand cannot start again.
        assert.equal(await world.event(session, id, 'start', 7097), false, `Q${id} cannot be replayed`);
        assert.equal(await world.amount(id, SCROLLS[id]), 1, `Q${id} granted no second scroll`);
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
