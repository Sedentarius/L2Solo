// Lifecycle certification for Q38 Dragon Fangs and Q39 Red-Eyed Invaders.
//
// Both were blocked on absent quest monsters, so the first thing asserted is
// that Langk Lizardman Sentinel, Langk Lizardman Shaman and Giant Araneid now
// resolve through the cache the server consults and stand at authored world
// positions - not as test-only doubles.
//
// Both quests are pair collections whose targets have different chances, so
// every chance is driven at its exact boundary and every cap is probed one kill
// past its total. Q39's real subtlety is that Bathis only moves on when BOTH
// stacks of a pair are full, never on their sum, and that is asserted directly.
const assert = require('node:assert/strict');
const { createWorld, Service, DataCache } = require('./helpers/c4QuestHarness');

const ADENA = 57;

const LUIS = 7386;
const IRIS = 7034;
const ROHMER = 7344;
const SENTINEL = 1100;
const LIEUTENANT = 357;
const SHAMAN = 1101;
const LEADER = 356;
const FEATHER = 7173;
const TOOTH_OF_TOTEM = 7174;
const TOOTH_OF_DRAGON = 7175;
const LETTER_OF_IRIS = 7176;
const LETTER_OF_ROHMER = 7177;
const REWARD_ITEMS = [45, 627, 1123, 605];
const REWARD_ADENA = { 45: 5200, 627: 1500, 1123: 3200, 605: 3200 };

const BABENCO = 7334;
const BATHIS = 7332;
const LIZARDMAN = 919;
const SCOUT = 920;
const GUARD = 921;
const ARANEID = 925;
const BLACK = 7178;
const RED = 7179;
const POUCH = 7180;
const GEM = 7181;
const LURE = 6521;
const ROD = 6529;
const SHOT = 6535;

const CHARACTERS = [
    { id: 380, level: 20 }, { id: 381, level: 18 },
    // One Q38 runner per reward row, so the draw is asserted four times over.
    ...REWARD_ITEMS.map((item, index) => ({ id: 3810 + index, level: 20 })),
    { id: 390, level: 20 }, { id: 391, level: 19 }, { id: 392, level: 20 }
];

const corpse = (selfId) => ({ fetchSelfId: () => selfId, fetchId: () => 900000 + selfId, isSpoil: () => false });

async function withRoll(value, body) {
    const original = Math.random;
    Math.random = () => value;
    try { return await body(); } finally { Math.random = original; }
}

async function main() {
    const world = await createWorld(CHARACTERS, 'c4-invaders');
    try {
        restoredMonsters();
        await dragonFangs(world);
        await dragonFangsRewards(world);
        await redEyedInvaders(world);
        console.log('C4 Q38/Q39: restored quest monsters with authored spawns and drops, exact '
            + 'drop chances and caps, the letter errand, all four Dragon Fangs reward rows and '
            + "Bathis's paired collections passed");
    } finally {
        await world.close();
    }
}

// The three monsters these quests were blocked on are real datapack content.
function restoredMonsters() {
    for (const [selfId, name, level] of [[SENTINEL, 'Langk Lizardman Sentinel', 19],
        [SHAMAN, 'Langk Lizardman Shaman', 24], [ARANEID, 'Giant Araneid', 24]]) {
        const npc = DataCache.npcs.find((entry) => entry.selfId === selfId);
        assert.ok(npc, `monster ${selfId} resolves`);
        assert.equal(npc.template.name, name, `monster ${selfId} is ${name}`);
        assert.equal(npc.template.level, level, `${name} is level ${level}`);
        assert.equal(npc.template.kind, 'Monster', `${name} is a monster`);

        const spawns = DataCache.npcSpawns.flatMap((group) => group.spawns)
            .filter((spawn) => Number(spawn.selfId) === selfId)
            .flatMap((spawn) => spawn.coords);
        assert.ok(spawns.length > 10, `${name} has a real authored population (${spawns.length})`);
        assert.ok(spawns.every((point) => [point.locX, point.locY, point.locZ].every(Number.isFinite)),
            `every ${name} spawn has a real position`);

        // A monster with no reward table drops nothing at all, adena included.
        const rewards = DataCache.npcRewards.find((entry) => entry.selfId === selfId);
        assert.ok(rewards?.rewards?.length, `${name} has an authored drop table`);
        assert.ok(rewards.rewards.some((group) => group.items.some((item) => item.selfId === ADENA)),
            `${name} drops adena`);
    }
}

async function dragonFangs(world) {
    const young = await world.session(381);
    assert.equal(await world.event(young, 38, 'start', LUIS), false, 'Q38 refuses level 18');

    let session = await world.session(380);
    assert.deepEqual(await world.links(session, LUIS, 38), ['start'], 'Luis offers the errand');
    assert.ok(await world.event(session, 38, 'start', LUIS), 'a level 19 adventurer may start');

    // Feathers always drop, from either target, and stop dead at a hundred.
    for (const mob of [SENTINEL, LIEUTENANT]) {
        const before = await world.amount(380, FEATHER);
        await withRoll(0.999, () => Service.onKill(session, corpse(mob)));
        assert.equal(await world.amount(380, FEATHER), before + 1,
            `mob ${mob} always drops a feather, even on the worst roll`);
    }
    // A dragon-tooth target yields nothing during the feather hunt.
    const carried = await world.amount(380, FEATHER);
    await withRoll(0, () => Service.onKill(session, corpse(SHAMAN)));
    assert.equal(await world.amount(380, TOOTH_OF_DRAGON), 0, 'no tooth drops during the feather hunt');
    assert.equal(await world.amount(380, FEATHER), carried, 'a shaman yields no feather');

    await Service.giveItem(session, FEATHER, 99 - carried);
    session = await world.session(380);
    await withRoll(0, () => Service.onKill(session, corpse(SENTINEL)));
    assert.equal(await world.amount(380, FEATHER), 100, 'the hundredth feather lands');
    assert.equal(world.state(session, 38).getInt('cond'), 2, 'a hundred feathers advance the errand');
    await withRoll(0, () => Service.onKill(session, corpse(SENTINEL)));
    assert.equal(await world.amount(380, FEATHER), 100, 'the feather count stops at a hundred');

    assert.deepEqual(await world.links(session, LUIS, 38), ['feathers'], 'Luis takes the feathers');
    assert.ok(await world.event(session, 38, 'feathers', LUIS), 'Luis accepts the hundred');
    assert.equal(await world.amount(380, FEATHER), 0, 'every feather is handed over');
    assert.equal(await world.amount(380, TOOTH_OF_TOTEM), 1, 'Luis hands over the totem tooth');

    // The letter errand: Iris, Rohmer, Iris again, with a restart in between.
    await world.event(session, 38, 'iris', IRIS);
    assert.equal(await world.amount(380, TOOTH_OF_TOTEM), 0, 'Iris takes the tooth');
    assert.equal(await world.amount(380, LETTER_OF_IRIS), 1, "Iris writes to Rohmer");
    assert.equal(world.state(session, 38).getInt('cond'), 4, 'the letter is cond 4');

    // Rohmer will not answer a letter that is not in hand.
    assert.equal(await world.event(session, 38, 'back', IRIS), false, 'the reply cannot be skipped');

    session = await world.reopen(380);
    await world.event(session, 38, 'rohmer', ROHMER);
    assert.equal(await world.amount(380, LETTER_OF_IRIS), 0, 'Rohmer takes the letter');
    assert.equal(await world.amount(380, LETTER_OF_ROHMER), 1, 'Rohmer writes back');

    await world.event(session, 38, 'back', IRIS);
    assert.equal(await world.amount(380, LETTER_OF_ROHMER), 0, 'Iris takes the reply');
    assert.equal(world.state(session, 38).getInt('cond'), 6, 'the tooth hunt is cond 6');

    // Teeth drop at exactly half chance and stop at fifty.
    await withRoll(0.5, () => Service.onKill(session, corpse(SHAMAN)));
    assert.equal(await world.amount(380, TOOTH_OF_DRAGON), 0, 'a roll of exactly 0.5 drops nothing');
    await withRoll(0.49, () => Service.onKill(session, corpse(SHAMAN)));
    assert.equal(await world.amount(380, TOOTH_OF_DRAGON), 1, 'a roll below 0.5 drops a tooth');
    await withRoll(0.49, () => Service.onKill(session, corpse(LEADER)));
    assert.equal(await world.amount(380, TOOTH_OF_DRAGON), 2, 'the leader drops teeth too');

    await Service.giveItem(session, TOOTH_OF_DRAGON, 47);
    session = await world.session(380);
    await withRoll(0, () => Service.onKill(session, corpse(SHAMAN)));
    assert.equal(await world.amount(380, TOOTH_OF_DRAGON), 50, 'the fiftieth tooth lands');
    assert.equal(world.state(session, 38).getInt('cond'), 7, 'fifty teeth advance the errand');
    await withRoll(0, () => Service.onKill(session, corpse(SHAMAN)));
    assert.equal(await world.amount(380, TOOTH_OF_DRAGON), 50, 'the tooth count stops at fifty');
}

// The reward is one of four sets, drawn evenly; every row is asserted.
async function dragonFangsRewards(world) {
    for (let index = 0; index < REWARD_ITEMS.length; index++) {
        const id = 3810 + index;
        const item = REWARD_ITEMS[index];
        let session = await world.session(id);
        await world.event(session, 38, 'start', LUIS);
        await Service.giveItem(session, FEATHER, 100);
        session = await world.session(id);
        await world.talk(session, LUIS);
        await world.event(session, 38, 'feathers', LUIS);
        await world.event(session, 38, 'iris', IRIS);
        await world.event(session, 38, 'rohmer', ROHMER);
        await world.event(session, 38, 'back', IRIS);
        await Service.giveItem(session, TOOTH_OF_DRAGON, 50);
        session = await world.session(id);
        await world.talk(session, IRIS);
        assert.equal(world.state(session, 38).getInt('cond'), 7, `row ${index}: fifty teeth are enough`);

        // A roll inside this row's quarter selects it.
        const roll = (index + 0.5) / REWARD_ITEMS.length;
        await withRoll(roll, () => world.event(session, 38, 'reward', IRIS));
        assert.equal(await world.amount(id, item), 1, `row ${index}: pays item ${item}`);
        assert.equal(await world.amount(id, ADENA), REWARD_ADENA[item],
            `row ${index}: pays ${REWARD_ADENA[item]} adena`);
        assert.equal(await world.amount(id, TOOTH_OF_DRAGON), 0, `row ${index}: the teeth are consumed`);
        assert.equal(world.state(session, 38).state, 'completed', `row ${index}: Q38 is one-shot`);

        // A completed Dragon Fangs cannot be restarted or paid twice.
        assert.equal(await world.event(session, 38, 'start', LUIS), false, `row ${index}: no restart`);
        await world.talk(session, IRIS);
        assert.equal(await world.amount(id, ADENA), REWARD_ADENA[item], `row ${index}: paid once`);
    }
}

async function redEyedInvaders(world) {
    const young = await world.session(391);
    assert.equal(await world.event(young, 39, 'start', BABENCO), false, 'Q39 refuses level 19');

    let session = await world.session(390);
    assert.ok(await world.event(session, 39, 'start', BABENCO), 'Babenco sends you to Bathis');
    assert.equal(await world.event(session, 39, 'necklaces', BATHIS), false,
        'the necklaces cannot be handed in before Bathis asks for them');

    await world.event(session, 39, 'bathis', BATHIS);
    assert.equal(world.state(session, 39).getInt('cond'), 2, 'Bathis opens the first collection');

    // Both necklaces always drop, from their own targets only.
    await withRoll(0.999, () => Service.onKill(session, corpse(GUARD)));
    assert.equal(await world.amount(390, RED), 1, 'the guard always drops a red necklace');
    for (const mob of [LIZARDMAN, SCOUT]) {
        const before = await world.amount(390, BLACK);
        await withRoll(0.999, () => Service.onKill(session, corpse(mob)));
        assert.equal(await world.amount(390, BLACK), before + 1, `mob ${mob} always drops a black necklace`);
    }
    await withRoll(0, () => Service.onKill(session, corpse(ARANEID)));
    assert.equal(await world.amount(390, BLACK) + await world.amount(390, RED), 3,
        'the araneid yields nothing during the first collection');

    // One stack full is not enough: Bathis wants both hundreds.
    await Service.giveItem(session, BLACK, 98);
    session = await world.session(390);
    assert.equal(await world.amount(390, BLACK), 100, 'the black necklaces are full');
    assert.equal(world.state(session, 39).getInt('cond'), 2, 'one full stack does not advance');
    await withRoll(0, () => Service.onKill(session, corpse(SCOUT)));
    assert.equal(await world.amount(390, BLACK), 100, 'the black count stops at a hundred');
    assert.equal(world.state(session, 39).getInt('cond'), 2, 'and still does not advance');

    await Service.giveItem(session, RED, 98);
    session = await world.session(390);
    await withRoll(0, () => Service.onKill(session, corpse(GUARD)));
    assert.equal(await world.amount(390, RED), 100, 'the hundredth red necklace lands');
    assert.equal(world.state(session, 39).getInt('cond'), 3, 'both hundreds advance together');

    session = await world.reopen(390);
    await world.event(session, 39, 'necklaces', BATHIS);
    assert.equal(await world.amount(390, BLACK), 0, 'the black necklaces are surrendered');
    assert.equal(await world.amount(390, RED), 0, 'the red necklaces are surrendered');
    assert.equal(world.state(session, 39).getInt('cond'), 4, 'the second collection opens');

    // The second collection has three different chances.
    await withRoll(0.5, () => Service.onKill(session, corpse(ARANEID)));
    assert.equal(await world.amount(390, GEM), 0, 'the araneid drops nothing at exactly 0.5');
    await withRoll(0.49, () => Service.onKill(session, corpse(ARANEID)));
    assert.equal(await world.amount(390, GEM), 1, 'the araneid drops a gem below 0.5');

    await withRoll(0.3, () => Service.onKill(session, corpse(GUARD)));
    assert.equal(await world.amount(390, POUCH), 0, 'the guard drops nothing at exactly 0.3');
    await withRoll(0.29, () => Service.onKill(session, corpse(GUARD)));
    assert.equal(await world.amount(390, POUCH), 1, 'the guard drops a pouch below 0.3');

    await withRoll(0.25, () => Service.onKill(session, corpse(SCOUT)));
    assert.equal(await world.amount(390, POUCH), 1, 'the scout drops nothing at exactly 0.25');
    await withRoll(0.24, () => Service.onKill(session, corpse(SCOUT)));
    assert.equal(await world.amount(390, POUCH), 2, 'the scout drops a pouch below 0.25');

    // The lizardman has no place in the second collection at all.
    await withRoll(0, () => Service.onKill(session, corpse(LIZARDMAN)));
    assert.equal(await world.amount(390, POUCH), 2, 'the plain lizardman drops nothing here');

    await Service.giveItem(session, GEM, 29);
    await Service.giveItem(session, POUCH, 27);
    session = await world.session(390);
    assert.equal(await world.amount(390, GEM), 30, 'the gems are full');
    assert.equal(world.state(session, 39).getInt('cond'), 4, 'one full stack does not advance');
    await withRoll(0, () => Service.onKill(session, corpse(GUARD)));
    assert.equal(await world.amount(390, POUCH), 30, 'the thirtieth pouch lands');
    assert.equal(world.state(session, 39).getInt('cond'), 5, 'both thirties advance together');
    await withRoll(0, () => Service.onKill(session, corpse(GUARD)));
    assert.equal(await world.amount(390, POUCH), 30, 'the pouch count stops at thirty');

    await world.event(session, 39, 'finish', BATHIS);
    assert.equal(await world.amount(390, LURE), 60, 'Bathis pays sixty lures');
    assert.equal(await world.amount(390, ROD), 1, 'Bathis pays the Baby Duck Rod');
    assert.equal(await world.amount(390, SHOT), 500, 'Bathis pays five hundred fishing shots');
    assert.equal(await world.amount(390, POUCH), 0, 'the pouches are surrendered');
    assert.equal(await world.amount(390, GEM), 0, 'the gems are surrendered');
    assert.equal(world.state(session, 39).state, 'completed', 'Q39 is one-shot');

    session = await world.reopen(390);
    assert.equal(world.state(session, 39).state, 'completed', 'completion survived a restart');
    assert.equal(await world.event(session, 39, 'start', BABENCO), false, 'a completed Q39 cannot restart');
    assert.equal(await world.amount(390, LURE), 60, 'the reward is not paid twice');

    // A second character cannot collect for the first.
    const other = await world.session(392);
    await withRoll(0, () => Service.onKill(other, corpse(GUARD)));
    assert.equal(await world.amount(392, RED), 0, 'a character with no quest collects nothing');
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
