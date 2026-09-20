// Route certification for the C4 first-profession quests Q401-Q418.
//
// This route test also certifies the shared first-profession proof contract.
// What this file certifies is the route: that each trial can actually be walked
// from its start NPC to its proof by a player who only ever does what the client
// lets them do - talk to the quest's NPCs, click the bypass links those pages
// offer, and kill the quest's registered targets.
//
// The walker scrapes each NPC page for `bypass -h quest <id> <event>` links and
// clicks them, so a route that cannot be finished through its own HTML fails
// here. Nothing is hand-fed: no item is granted and no cond is set by the test.
const assert = require('node:assert/strict');
const { createWorld, withSeededRandom, Service, Database } = require('./helpers/c4QuestHarness');

const FirstProfessionProof = require('../src/GameServer/Quest/FirstProfessionProof');
const ClassTransfer = require('../src/GameServer/ClassTransfer');

// Each trial starts at level 19 in its parent class; the transfer needs level 20.
const CHARACTERS = FirstProfessionProof.paths.map(path => ({
    id: path.questId,
    classId: path.fromClassId,
    race: raceForClass(path.fromClassId),
    level: 19
}));

function raceForClass(classId) {
    if (classId < 10) return 0;      // Human fighter
    if (classId < 18) return 0;      // Human mystic
    if (classId < 25) return 1;      // Elven fighter
    if (classId < 31) return 1;      // Elven mystic
    if (classId < 38) return 2;      // Dark Elf fighter
    if (classId < 44) return 2;      // Dark Elf mystic
    if (classId < 49) return 3;      // Orc fighter
    if (classId < 53) return 3;      // Orc mystic
    return 4;                        // Dwarf
}

async function main() {
    const world = await createWorld(CHARACTERS, 'c4-profession');
    try {
        for (const path of FirstProfessionProof.paths) {
            await certifyRoute(world, path);
        }
        console.log(`C4 profession routes: all ${FirstProfessionProof.paths.length} trials walked to `
            + 'their proof through NPC pages and kills, then transferred at level 20');
    } finally {
        await world.close();
    }
}

async function certifyRoute(world, path) {
    const questId = path.questId;
    const quest = Service.quests().find(entry => entry.id === questId);
    assert.ok(quest, `Q${questId} is registered`);
    let session = await world.session(questId);

    // The trial must refuse a character of the wrong parent class.
    const wrongClass = (path.fromClassId + 1) % 57;
    session.actor.classId = wrongClass;
    assert.equal(await world.event(session, questId, 'start', quest.startNpcs[0]), false,
        `Q${questId} must refuse class ${wrongClass}`);
    session.actor.classId = path.fromClassId;

    // Under level 19 the trial is not offered either.
    session.actor.level = 18;
    assert.equal(await world.event(session, questId, 'start', quest.startNpcs[0]), false,
        `Q${questId} must refuse a level 18 applicant`);
    session.actor.level = 19;
    assert.equal(await world.questRow(questId, questId), null,
        `Q${questId} left no state behind after its refusals`);

    assert.ok(await world.event(session, questId, 'start', quest.startNpcs[0]),
        `Q${questId} accepts its own parent class at level 19`);

    // Walk the route under a deterministic generator, so every probabilistic
    // branch is really rolled but the walk reproduces exactly.
    await withSeededRandom(questId, async () => {
        for (let round = 0; round < 24 && !world.state(session, questId).isCompleted(); round++) {
            let acted = false;
            for (const npcId of quest.npcs) {
                for (const event of await world.links(session, npcId, questId)) {
                    if (event === 'start') continue;
                    if (await world.event(session, questId, event, npcId)) acted = true;
                }
                // Talking alone advances the routes that have no link on that page.
                if (await world.talk(session, npcId)) acted = true;
                if (world.state(session, questId).isCompleted()) break;
            }
            // Some trials only progress while their trial weapon is wielded, so
            // the walker wields whatever the trial just handed over, then reloads
            // the session the way relogging would.
            if (await world.equipCarriedWeapon(session)) {
                session = await world.session(questId);
                acted = true;
            }
            // Kill each target both plainly and spoiled: the Scavenger route only
            // yields its materials from spoiled corpses.
            for (const mobId of quest.killNpcs || []) {
                for (let kill = 0; kill < 30; kill++) {
                    await world.kill(session, mobId);
                    await world.kill(session, mobId, { spoil: true });
                }
            }
            assert.ok(acted || round === 0 || (quest.killNpcs || []).length,
                `Q${questId} stalled: no NPC page offered any way forward`);
        }
    });

    const state = world.state(session, questId);
    assert.equal(state.isCompleted(), true,
        `Q${questId} must be completable by talking and killing alone`);

    // The proof is the only thing the trial may leave behind.
    assert.equal(await world.amount(questId, path.itemId), 1,
        `Q${questId} awards exactly one proof item ${path.itemId}`);

    // A trial whose hand-outs are guarded by item possession instead of its cond
    // can be looped for extra materials. Nothing but adena may be left stacked.
    const leftovers = (await Database.fetchItems(questId))
        .filter(item => item.selfId !== 57 && item.amount > 1);
    assert.deepEqual(leftovers.map(item => `${item.selfId}x${item.amount}`), [],
        `Q${questId} left farmable stacks behind after completion`);
    assert.equal(Number((await world.character(questId)).classId), path.fromClassId,
        `Q${questId} must not mutate the class itself`);

    // The trial cannot be replayed for a second proof.
    assert.equal(await world.event(session, questId, 'start', quest.startNpcs[0]), false,
        `Q${questId} cannot be restarted`);
    assert.equal(await world.amount(questId, path.itemId), 1,
        `Q${questId} granted no second proof`);

    // The proof survives a restart, and only converts at level 20.
    session = await world.reopen(questId);
    const underLevel = await ClassTransfer.transfer(session, path.toClassId, { firstProfessionOnly: true });
    assert.equal(underLevel.ok, false, `Q${questId} must not transfer at level 19`);
    assert.equal(underLevel.reason, 'level', `Q${questId} refuses for the level reason`);

    await Database.execute(['UPDATE characters SET level = 20 WHERE id = ?', [questId]]);
    session = await world.reopen(questId);

    // A proof only converts into its own class.
    const otherPath = FirstProfessionProof.paths.find(entry => entry.toClassId !== path.toClassId
        && entry.fromClassId === path.fromClassId);
    if (otherPath) {
        const wrong = await ClassTransfer.transfer(session, otherPath.toClassId, { firstProfessionOnly: true });
        assert.equal(wrong.ok, false, `Q${questId}'s proof must not buy class ${otherPath.toClassId}`);
    }

    const transferred = await ClassTransfer.transfer(session, path.toClassId, { firstProfessionOnly: true });
    assert.equal(transferred.ok, true, `Q${questId} transfers at level 20`);
    assert.equal(Number((await world.character(questId)).classId), path.toClassId,
        `Q${questId} commits class ${path.toClassId}`);
    assert.equal(await world.amount(questId, path.itemId), 0,
        `Q${questId} consumes the proof at transfer`);

    // The spent proof cannot be reused, even after a restart.
    session = await world.reopen(questId);
    const replay = await ClassTransfer.transfer(session, path.toClassId, { firstProfessionOnly: true });
    assert.equal(replay.alreadyTransferred === true || replay.ok === false, true,
        `Q${questId}'s spent proof cannot buy a second transfer`);
    assert.equal(Number((await world.character(questId)).classId), path.toClassId,
        `Q${questId} keeps its committed class`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
