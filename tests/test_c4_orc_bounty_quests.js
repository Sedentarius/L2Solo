// Lifecycle certification for Q419, Q275 and Q276.
//
// Q419's hunting phase and the two Orc bounties all turn on probabilities and
// thresholds, so every boundary here is driven with a deterministic roll rather
// than sampled: a test that hunts until something happens proves nothing about
// where the boundary actually is.
//
// Q275 and Q276 spawn a transient quest monster at the corpse of the mob that
// provoked it, which is what the pinned C4 handlers' addSpawn does. The spawn is
// asserted to carry its owner and quest identity, and to stand where the mob died.
const assert = require('node:assert/strict');
const { createWorld, enableQuestSpawns, Service, Database, DataCache } = require('./helpers/c4QuestHarness');

const ADENA = 57;

const CHARACTERS = [
    // Q419 hunters, one per race, all eligible.
    { id: 4190, race: 0, level: 20 }, { id: 4191, race: 1, level: 20 },
    { id: 4192, race: 2, level: 20 }, { id: 4193, race: 3, level: 20 },
    { id: 4194, race: 4, level: 20 },
    // Q419 gate probe.
    { id: 4195, race: 0, level: 14 },
    // Q275 runners and gate probes.
    { id: 275, race: 3, level: 20 }, { id: 2751, race: 3, level: 20 },
    { id: 2752, race: 0, level: 20 }, { id: 2753, race: 3, level: 10 },
    // Q276 runners and gate probes.
    { id: 276, race: 3, level: 20 }, { id: 2761, race: 3, level: 20 },
    { id: 2762, race: 1, level: 20 }, { id: 2763, race: 3, level: 14 }
];

// A killed mob the quest handlers can read a position and heading from.
const corpse = (selfId, position) => ({
    fetchSelfId: () => selfId,
    fetchId: () => 900000 + selfId,
    fetchLocX: () => position.locX,
    fetchLocY: () => position.locY,
    fetchLocZ: () => position.locZ,
    fetchHead: () => position.head,
    isSpoil: () => false
});

// Forces Math.random to a chosen value for exactly one quest interaction.
async function withRoll(value, body) {
    const original = Math.random;
    Math.random = () => value;
    try { return await body(); } finally { Math.random = original; }
}

async function main() {
    const world = await createWorld(CHARACTERS, 'c4-orc-bounty');
    const runtimeWorld = enableQuestSpawns();
    try {
        await getAPetDropTable(world);
        await getAPetRoute(world);
        await darkWingedSpies(world, runtimeWorld);
        await totemOfTheHestui(world, runtimeWorld);
        console.log('C4 Q419/Q275/Q276: source-backed drop chances, list ownership, spawn '
            + 'thresholds and coordinates, ownership metadata, rewards and restart passed');
    } finally {
        await world.close();
    }
}

// Q419's proof must drop at each target's own chance, and only while the
// character carries its race's Animal Slayer List.
async function getAPetDropTable(world) {
    const TABLE = {
        0: { list: 3418, proof: 3423, targets: [[103, 0.6], [106, 0.75], [108, 1]] },
        1: { list: 3419, proof: 3424, targets: [[460, 0.6], [308, 0.75], [466, 1]] },
        2: { list: 3420, proof: 3425, targets: [[25, 0.6], [105, 0.75], [34, 1]] },
        3: { list: 3421, proof: 3426, targets: [[474, 0.6], [476, 0.75], [478, 1]] },
        4: { list: 3422, proof: 3427, targets: [[403, 0.75], [508, 1]] }
    };

    for (const [race, spec] of Object.entries(TABLE)) {
        const id = 4190 + Number(race);
        const session = await world.session(id);
        assert.ok(await world.event(session, 419, 'start', 7731), `race ${race} may start Q419`);
        assert.equal(await world.amount(id, spec.list), 1,
            `race ${race} receives Animal Slayer List ${spec.list}`);

        for (const [mob, chance] of spec.targets) {
            const before = await world.amount(id, spec.proof);
            // Just below the chance the proof drops; at the chance it does not.
            await withRoll(Math.max(0, chance - 0.01), () => world.kill(session, mob));
            assert.equal(await world.amount(id, spec.proof), before + 1,
                `mob ${mob} yields a proof just below its ${chance} chance`);
            if (chance < 1) {
                await withRoll(chance, () => world.kill(session, mob));
                assert.equal(await world.amount(id, spec.proof), before + 1,
                    `mob ${mob} yields nothing at exactly its ${chance} chance`);
                await withRoll(0.999, () => world.kill(session, mob));
                assert.equal(await world.amount(id, spec.proof), before + 1,
                    `mob ${mob} yields nothing on a high roll`);
            }
        }

        // Another race's target never counts.
        const foreign = TABLE[(Number(race) + 1) % 5].targets[0][0];
        const held = await world.amount(id, spec.proof);
        await withRoll(0, () => world.kill(session, foreign));
        assert.equal(await world.amount(id, spec.proof), held,
            `race ${race} gains nothing from another race's target`);

        // Without the list in hand nothing drops, however good the roll.
        await Database.execute(['DELETE FROM items WHERE characterId = ? AND selfId = ?', [id, spec.list]]);
        const listless = await world.session(id);
        await withRoll(0, () => world.kill(listless, spec.targets[0][0]));
        assert.equal(await world.amount(id, spec.proof), held,
            `race ${race} gains no proof without its Animal Slayer List`);
    }
}

// The rest of the route: the fifty-proof cap, the collar, the three tutors and
// the ten-question test, including the reset a wrong answer causes.
async function getAPetRoute(world) {
    const MARTIN = 7731;
    const TUTORS = [7256, 7091, 7072];
    const LIST = 3418;
    const PROOF = 3423;
    const COLLAR = 3417;
    const id = 4190;

    const denied = await world.session(4195);
    assert.equal(await world.event(denied, 419, 'start', MARTIN), false, 'Q419 refuses level 14');

    let session = await world.session(id);
    // Restore the list this character's drop-table probe removed, then fill up.
    await Service.giveItem(session, LIST, 1);
    session = await world.session(id);
    // Top the collection up to exactly fifty; the drop-table phase already
    // earned this character some proofs.
    const earned = await world.amount(id, PROOF);
    if (earned < 50) await Service.giveItem(session, PROOF, 50 - earned);
    session = await world.session(id);

    // The cap holds: a further kill adds nothing beyond fifty.
    await withRoll(0, () => world.kill(session, 108));
    assert.equal(await world.amount(id, PROOF), 50, 'the proof collection caps at fifty');

    assert.ok(await world.event(session, 419, 'proof', MARTIN), 'Martin accepts fifty proofs');
    assert.equal(await world.amount(id, PROOF), 0, 'the proofs are consumed');
    assert.equal(await world.amount(id, LIST), 0, 'the Animal Slayer List is consumed');
    assert.equal(await world.amount(id, COLLAR), 1, 'the training collar is issued');
    assert.equal(world.state(session, 419).getInt('cond'), 2, 'the quest advances to the tutors');

    // The test is refused until all three animal lovers have been visited.
    assert.equal(await world.event(session, 419, 'quiz', MARTIN), false,
        'the test is refused before visiting every tutor');
    for (const tutor of TUTORS) {
        assert.ok(await world.event(session, 419, `learn_${tutor}`, tutor), `tutor ${tutor} teaches`);
    }

    session = await world.reopen(id);
    assert.equal(world.state(session, 419).getInt('visits'), 7, 'the tutor visits survive a restart');
    assert.ok(await world.event(session, 419, 'quiz', MARTIN), 'the test begins once all three are visited');

    const questions = require('../data/Pets/c4-wolf-quiz.json').questions;
    const answerIndex = (questionId, correct) => {
        const question = questions.find(entry => entry.id === questionId);
        return question.answers.findIndex(answer => Boolean(answer.correct) === correct);
    };

    // A wrong answer sends the character back to the tutors without a collar.
    let quiz = JSON.parse(world.state(session, 419).get('quiz', '[]'));
    assert.equal(quiz.length, 10, 'the test asks ten questions');
    assert.ok(await world.event(session, 419, `answer_0_${quiz[0]}_${answerIndex(quiz[0], false)}`, MARTIN),
        'a wrong answer is accepted as an answer');
    assert.equal(world.state(session, 419).getInt('cond'), 2, 'a wrong answer resets to the tutors');
    assert.equal(world.state(session, 419).getInt('visits'), 0, 'and clears the tutor visits');

    for (const tutor of TUTORS) await world.event(session, 419, `learn_${tutor}`, tutor);
    await world.event(session, 419, 'quiz', MARTIN);
    quiz = JSON.parse(world.state(session, 419).get('quiz', '[]'));

    for (let position = 0; position < 10; position++) {
        const questionId = quiz[position];
        // An answer out of order is rejected outright.
        if (position === 0) {
            assert.equal(await world.event(session, 419,
                `answer_5_${quiz[5]}_${answerIndex(quiz[5], true)}`, MARTIN), false,
            'answers must be given in order');
        }
        assert.ok(await world.event(session, 419,
            `answer_${position}_${questionId}_${answerIndex(questionId, true)}`, MARTIN),
        `question ${position} accepts its correct answer`);
    }

    // The reward is the Wolf Collar itself. The quest row resets to created and
    // its variables are cleared, so a second wolf costs the whole route again.
    assert.equal(await world.amount(id, 2375), 1, 'a perfect test awards the Wolf Collar');
    assert.equal(await world.amount(id, COLLAR), 0, 'the Animal Lovers List is consumed');
    assert.equal(world.state(session, 419).state, 'created', 'the quest resets after the reward');
    assert.deepEqual(world.state(session, 419).variables, {}, 'its progress is cleared');

    const restarted = await world.reopen(id);
    assert.equal(await world.amount(id, 2375), 1, 'the collar survives a restart');
    assert.ok(await world.event(restarted, 419, 'start', MARTIN), 'the route can be walked again');
    assert.equal(restarted.questStates.get(419).getInt('cond'), 1, 'a second wolf starts from the hunt');
    assert.equal(await world.amount(id, LIST), 1, 'and needs a fresh Animal Slayer List');
    assert.equal(await world.event(restarted, 419, 'proof', MARTIN), false,
        'the collar cannot be claimed again without fifty fresh proofs');
}

async function darkWingedSpies(world, runtimeWorld) {
    const TANTUS = 7567;
    const BAT = 316;
    const TRACKER = 5043;
    const FANG = 1478;
    const PARASITE = 1479;
    const PLACE = { locX: 12345, locY: -54321, locZ: -2500, head: 4321 };

    // Race and level gates leave no state behind.
    const human = await world.session(2752);
    assert.equal(await world.event(human, 275, 'start', TANTUS), false, 'Q275 refuses a non-Orc');
    assert.equal(await world.questRow(2752, 275), null, 'the race refusal left no state');
    const child = await world.session(2753);
    assert.equal(await world.event(child, 275, 'start', TANTUS), false, 'Q275 refuses level 10');

    let session = await world.session(275);
    assert.ok(await world.event(session, 275, 'start', TANTUS), 'Tantus accepts a level 11 Orc');

    // Ordinary collection: one fang per bat, no tracker below the lower bound.
    for (let i = 0; i < 10; i++) {
        await withRoll(0, () => Service.onKill(session, corpse(BAT, PLACE)));
    }
    assert.equal(await world.amount(275, FANG), 10, 'each bat yields exactly one fang');
    assert.equal(await world.amount(275, PARASITE), 0,
        'the tracker cannot appear at ten fangs even on the best roll');

    // The lower bound is exclusive: eleven fangs is the first eligible count.
    await withRoll(0.05, () => Service.onKill(session, corpse(BAT, PLACE)));
    assert.equal(await world.amount(275, FANG), 11, 'the eleventh fang landed');
    assert.equal(await world.amount(275, PARASITE), 1, 'the tracker appears from eleven fangs');

    const spawned = runtimeWorld.npc.spawns.filter(npc => Number(npc.fetchSelfId()) === TRACKER);
    assert.equal(spawned.length, 1, "exactly one Varangka's Tracker was spawned");
    const tracker = spawned[0];
    assert.equal(tracker.fetchLocX(), PLACE.locX, 'the tracker stands where the bat died (X)');
    assert.equal(tracker.fetchLocY(), PLACE.locY, 'the tracker stands where the bat died (Y)');
    assert.equal(tracker.fetchLocZ(), PLACE.locZ, 'the tracker stands where the bat died (Z)');
    assert.equal(tracker.questSpawn.ownerId, 275, 'the tracker belongs to the character who provoked it');
    assert.equal(tracker.questSpawn.questId, 275, 'the tracker carries its quest identity');

    // The 10% boundary is exclusive.
    await withRoll(0.1, () => Service.onKill(session, corpse(BAT, PLACE)));
    assert.equal(await world.amount(275, PARASITE), 1, 'a roll of exactly 0.1 spawns nothing');
    await withRoll(0.099, () => Service.onKill(session, corpse(BAT, PLACE)));
    assert.equal(await world.amount(275, PARASITE), 2, 'a roll just below 0.1 spawns the tracker');

    // The tracker pays nothing without a parasite in hand.
    const bare = await world.session(2751);
    assert.ok(await world.event(bare, 275, 'start', TANTUS));
    await withRoll(0, () => Service.onKill(bare, corpse(TRACKER, PLACE)));
    assert.equal(await world.amount(2751, FANG), 0, 'the tracker pays nothing without a parasite');

    // The tracker pays five fangs and consumes every parasite.
    const before = await world.amount(275, FANG);
    await withRoll(0.5, () => Service.onKill(session, corpse(TRACKER, PLACE)));
    assert.equal(await world.amount(275, FANG), before + 5, 'the tracker pays five fangs');
    assert.equal(await world.amount(275, PARASITE), 0, 'every parasite is consumed');

    // Ordinary collection survives a restart.
    session = await world.reopen(275);
    assert.equal(world.state(session, 275).getInt('cond'), 1, 'the hunt survives a restart');
    const carried = await world.amount(275, FANG);
    await withRoll(0.5, () => Service.onKill(session, corpse(BAT, PLACE)));
    assert.equal(await world.amount(275, FANG), carried + 1, 'collection continues after a restart');

    // Reaching seventy advances, and Tantus pays exactly 4200 adena.
    await Service.giveItem(session, FANG, 70 - (await world.amount(275, FANG)));
    session = await world.session(275);
    await withRoll(0.5, () => Service.onKill(session, corpse(BAT, PLACE)));
    assert.equal(world.state(session, 275).getInt('cond'), 2, 'seventy fangs advance the cond');

    assert.ok(await world.event(session, 275, 'reward', TANTUS), 'Tantus accepts the fangs');
    assert.equal(await world.amount(275, ADENA), 4200, 'Q275 pays exactly 4200 adena');
    assert.equal(await world.amount(275, FANG), 0, 'every fang is consumed');
    assert.equal(await world.amount(275, PARASITE), 0, 'every parasite is consumed');
    assert.equal(world.state(session, 275).state, 'created', 'Q275 is repeatable');
    assert.ok(await world.event(session, 275, 'start', TANTUS), 'the bounty can be taken again');
}

async function totemOfTheHestui(world, runtimeWorld) {
    const TANAPI = 7571;
    const BEAR = 479;
    const SPIRIT = 5044;
    const PARASITE = 1480;
    const CRYSTAL = 1481;
    const TOTEM = 1500;
    const PANTS = 29;
    const PLACE = { locX: -22222, locY: 33333, locZ: -3100, head: 1234 };

    const elf = await world.session(2762);
    assert.equal(await world.event(elf, 276, 'start', TANAPI), false, 'Q276 refuses a non-Orc');
    const child = await world.session(2763);
    assert.equal(await world.event(child, 276, 'start', TANAPI), false, 'Q276 refuses level 14');

    // Every authored threshold, driven at its exact boundary. `roll` is the
    // reference's getRandom(100), so a roll of r/100 reproduces integer r.
    const BOUNDARIES = [
        { parasites: 39, spawns: 0, holds: 2 },
        { parasites: 49, spawns: 10, holds: 11 },
        { parasites: 59, spawns: 15, holds: 16 },
        { parasites: 69, spawns: 20, holds: 21 },
        { parasites: 79, spawns: 99, holds: null }
    ];
    for (const boundary of BOUNDARIES) {
        for (const [roll, shouldSpawn] of [[boundary.spawns, true], [boundary.holds, false]]) {
            if (roll === null) continue;
            const probe = await world.session(2761);
            await Database.execute(['DELETE FROM items WHERE characterId = 2761']);
            await Database.execute(["DELETE FROM character_quests WHERE characterId = 2761 AND questId = 276"]);
            const fresh = await world.session(2761);
            assert.ok(await world.event(fresh, 276, 'start', TANAPI));
            await Service.giveItem(fresh, PARASITE, boundary.parasites);
            const armed = await world.session(2761);
            const before = runtimeWorld.npc.spawns
                .filter(npc => Number(npc.fetchSelfId()) === SPIRIT).length;
            await withRoll(roll / 100, () => Service.onKill(armed, corpse(BEAR, PLACE)));
            const after = runtimeWorld.npc.spawns
                .filter(npc => Number(npc.fetchSelfId()) === SPIRIT).length;
            assert.equal(after > before, shouldSpawn,
                `${boundary.parasites} parasites with roll ${roll} must ${shouldSpawn ? '' : 'not '}spawn the spirit`);
            if (shouldSpawn) {
                assert.equal(await world.amount(2761, PARASITE), 0,
                    'provoking the spirit consumes the parasites');
            } else {
                assert.equal(await world.amount(2761, PARASITE), boundary.parasites + 1,
                    'a held roll adds another parasite instead');
            }
            assert.ok(probe, 'probe session created');
        }
    }

    // The ordinary route, its spawn metadata and the reward.
    let session = await world.session(276);
    assert.ok(await world.event(session, 276, 'start', TANAPI), 'Tanapi accepts a level 15 Orc');
    await withRoll(0.99, () => Service.onKill(session, corpse(BEAR, PLACE)));
    assert.equal(await world.amount(276, PARASITE), 1, 'an ordinary bear yields one parasite');

    session = await world.reopen(276);
    assert.equal(world.state(session, 276).getInt('cond'), 1, 'collection survives a restart');
    await withRoll(0.99, () => Service.onKill(session, corpse(BEAR, PLACE)));
    assert.equal(await world.amount(276, PARASITE), 2, 'collection continues after a restart');

    await Service.giveItem(session, PARASITE, 79 - (await world.amount(276, PARASITE)));
    session = await world.session(276);
    const before = runtimeWorld.npc.spawns
        .filter(npc => Number(npc.fetchSelfId()) === SPIRIT).length;
    await withRoll(0.99, () => Service.onKill(session, corpse(BEAR, PLACE)));
    const spawned = runtimeWorld.npc.spawns
        .filter(npc => Number(npc.fetchSelfId()) === SPIRIT);
    assert.equal(spawned.length, before + 1, 'seventy-nine parasites always provoke the spirit');
    const spirit = spawned.at(-1);
    assert.equal(spirit.fetchLocX(), PLACE.locX, 'the spirit stands where the bear died (X)');
    assert.equal(spirit.fetchLocY(), PLACE.locY, 'the spirit stands where the bear died (Y)');
    assert.equal(spirit.fetchLocZ(), PLACE.locZ, 'the spirit stands where the bear died (Z)');
    assert.equal(spirit.questSpawn.ownerId, 276, 'the spirit belongs to the character who provoked it');
    assert.equal(spirit.questSpawn.questId, 276, 'the spirit carries its quest identity');
    assert.equal(await world.amount(276, PARASITE), 0, 'the parasites are consumed');

    await withRoll(0.5, () => Service.onKill(session, corpse(SPIRIT, PLACE)));
    assert.equal(await world.amount(276, CRYSTAL), 1, 'the spirit yields the Kasha Crystal');
    assert.equal(world.state(session, 276).getInt('cond'), 2, 'the crystal advances the cond');

    // With the crystal in hand ordinary bears stop producing parasites.
    await withRoll(0.99, () => Service.onKill(session, corpse(BEAR, PLACE)));
    assert.equal(await world.amount(276, PARASITE), 0, 'bears are ignored once the crystal is held');
    await withRoll(0.5, () => Service.onKill(session, corpse(SPIRIT, PLACE)));
    assert.equal(await world.amount(276, CRYSTAL), 1, 'a second spirit yields no duplicate crystal');

    assert.ok(await world.event(session, 276, 'reward', TANAPI), 'Tanapi accepts the crystal');
    assert.equal(await world.amount(276, TOTEM), 1, 'the Totem of Hestui is awarded');
    assert.equal(await world.amount(276, PANTS), 1, 'the Leather Pants are awarded');
    assert.equal(await world.amount(276, CRYSTAL), 0, 'the crystal is consumed');
    assert.equal(world.state(session, 276).state, 'created', 'Q276 is repeatable');
    assert.ok(await world.event(session, 276, 'start', TANAPI), 'the bounty can be taken again');
    assert.ok(DataCache.npcs.find(npc => npc.selfId === SPIRIT), 'the spirit template exists locally');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
