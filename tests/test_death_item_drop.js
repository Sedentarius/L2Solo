const assert = require('assert');
const fs = require('fs');
const path = require('path');

require('../src/Global');

const Database = invoke('Database');
const DeathItemDrop = invoke('GameServer/Progression/DeathItemDrop');
const databasePath = path.join(process.cwd(), 'tmp', 'test-death-item-drop.sqlite');

fs.rmSync(databasePath, { force: true });
options.default.Database.path = path.relative(process.cwd(), databasePath);
Database.init();

function item({ id, selfId, name = `Item ${selfId}`, amount = 1, enchant = 0,
    equipped = false, slot = 0, kind = 'Other.Material', stackable = false }) {
    return {
        id, selfId, name, amount, enchant, equipped, slot, kind, stackable,
        fetchId: () => id,
        fetchSelfId: () => selfId,
        fetchName: () => name,
        fetchAmount: () => amount,
        fetchEnchantLevel: () => enchant,
        fetchEquipped: () => equipped,
        fetchSlot: () => slot,
        fetchKind: () => kind,
        fetchPetLocked: () => false,
        model: { stackable }
    };
}

function actor(items, { id = 1, level = 20, karma = 0, pk = 0 } = {}) {
    return {
        fetchId: () => id,
        fetchLevel: () => level,
        fetchKarma: () => karma,
        fetchPk: () => pk,
        backpack: { fetchItems: () => items }
    };
}

function sequence(...rolls) {
    let index = 0;
    return () => rolls[Math.min(index++, rolls.length - 1)];
}

async function createCharacter(username, name) {
    await Database.createAccount(username, 'secret');
    await Database.createCharacter(username, {
        name, race: 0, classId: 0, maxHp: 100, maxMp: 100,
        sex: 0, face: 0, hair: 0, hairColor: 0, locX: 10, locY: 20, locZ: 30
    });
    return Number((await Database.fetchCharacters(username))[0].id);
}

async function run() {
    // C4 reference packs provide the 5/70 overall and 70/25/5 vs 50/40/10
    // probability bands. Historical C4-era behavior additionally protects the
    // equipped weapon until the character is chaotic with at least six PKs.
    const armor = item({ id: 101, selfId: 23, equipped: true, slot: 10, kind: 'Armor.Light' });
    const weapon = item({ id: 102, selfId: 1, enchant: 7, equipped: true, slot: 7, kind: 'Weapon.Sword' });
    const jewelry = item({ id: 103, selfId: 114, equipped: true, slot: 9, kind: 'Armor.Jewelry' });
    const inventoryGear = item({ id: 104, selfId: 2, kind: 'Weapon.Blunt' });
    const shots = item({ id: 105, selfId: 1835, amount: 800, kind: 'Other.Soulshot', stackable: true });
    const quest = item({ id: 106, selfId: 90000, kind: 'Other.Quest' });
    const adena = item({ id: 107, selfId: 57, amount: 9999, stackable: true });
    const inventory = [armor, weapon, jewelry, inventoryGear, shots, quest, adena];

    assert.strictEqual(DeathItemDrop.rulesFor(actor(inventory), { killerPlayable: true }).reason,
        'ordinary_world_pvp', 'white characters do not drop in direct player PvP');
    assert.strictEqual(DeathItemDrop.rulesFor(actor(inventory), { playerControlledKiller: true }).reason,
        'ordinary_world_pvp', 'white characters do not drop when killed by a player-owned pet/servitor');

    const lowPkPve = DeathItemDrop.rulesFor(actor(inventory, { karma: 100, pk: 5 }), {});
    assert.strictEqual(lowPkPve.eligible, true,
        'a low-PK chaotic character killed by an NPC remains exposed to ordinary PvE loss');
    assert.strictEqual(lowPkPve.reason, 'chaotic_low_pk_pve_risk');
    assert.strictEqual(lowPkPve.allowWeaponDrop, false);
    assert.strictEqual(lowPkPve.rates, DeathItemDrop.NORMAL_RATES);
    assert.strictEqual(DeathItemDrop.rulesFor(actor(inventory, { karma: 100, pk: 5 }),
        { killerPlayable: true }).reason, 'chaotic_low_pk_pvp_protected');
    assert.strictEqual(DeathItemDrop.rulesFor(actor(inventory, { karma: 100, pk: 5 }),
        { playerControlledKiller: true }).reason, 'chaotic_low_pk_pvp_protected');

    const highPk = DeathItemDrop.rulesFor(actor(inventory, { karma: 100, pk: 6 }), {});
    assert.strictEqual(highPk.eligible, true);
    assert.strictEqual(highPk.allowWeaponDrop, true);
    assert.strictEqual(highPk.rates, DeathItemDrop.CHAOTIC_RATES);
    assert.strictEqual(DeathItemDrop.rulesFor(actor(inventory, { karma: 0, pk: 99 }), {}).reason,
        'ordinary_pve_risk', 'cleared karma does not preserve chaotic rates or equipped-weapon risk');

    for (const context of [{ arena: true }, { festival: true }, { duel: true }, { olympiad: true },
        { event: true }, { lucky: true }, { pvpZone: true, killerPlayable: true },
        { pvpZone: true, playerControlledKiller: true },
        { siegeZone: true, siegeParticipant: true, killerPlayable: true }]) {
        assert.strictEqual(DeathItemDrop.rulesFor(actor(inventory), context).eligible, false);
    }
    assert.strictEqual(DeathItemDrop.rulesFor(actor(inventory, { level: 4 }), {}).eligible, false);

    const pool = DeathItemDrop.buildEligiblePool(actor(inventory));
    assert(pool.some((entry) => entry.selfId === armor.selfId && entry.category === 'equipment'));
    assert(pool.some((entry) => entry.selfId === jewelry.selfId && entry.category === 'equipment'));
    assert(pool.some((entry) => entry.selfId === inventoryGear.selfId && entry.category === 'inventory'));
    assert(pool.some((entry) => entry.selfId === shots.selfId && entry.amount === 800));
    assert(!pool.some((entry) => entry.selfId === 57), 'Adena is protected');
    assert(!pool.some((entry) => entry.selfId === quest.selfId), 'quest items are protected');

    const overallBoundary = DeathItemDrop.calculateDropPlan(actor([armor]), {}, () => 0.05);
    assert.strictEqual(overallBoundary.selected.length, 0, '5% is [0, 5), not inclusive at 5');
    const armorHit = DeathItemDrop.calculateDropPlan(actor([armor]), {}, sequence(0.049, 0.249));
    assert.strictEqual(armorHit.selected.length, 1);
    const armorMiss = DeathItemDrop.calculateDropPlan(actor([armor]), {}, sequence(0.049, 0.25));
    assert.strictEqual(armorMiss.selected.length, 0);

    const whiteWeapon = DeathItemDrop.calculateDropPlan(actor([weapon]), {}, () => 0);
    assert.strictEqual(whiteWeapon.selected.length, 0,
        'equipped weapons are protected on ordinary/white PvE deaths');
    assert.strictEqual(whiteWeapon.candidates.length, 0);
    const lowPkWeapon = DeathItemDrop.calculateDropPlan(
        actor([weapon], { karma: 100, pk: 5 }), {}, () => 0);
    assert.strictEqual(lowPkWeapon.selected.length, 0,
        'equipped weapons remain protected while chaotic PK count is below six');
    const highPkWeapon = DeathItemDrop.calculateDropPlan(
        actor([weapon], { karma: 100, pk: 6 }), {}, sequence(0, 0.099));
    assert.strictEqual(highPkWeapon.selected[0].selfId, weapon.selfId,
        'equipped weapons become eligible at chaotic PK count six or higher');

    const six = Array.from({ length: 6 }, (_, index) => item({
        id: 200 + index, selfId: 1000 + index, kind: 'Other.Material'
    }));
    const capped = DeathItemDrop.calculateDropPlan(actor(six, { karma: 10, pk: 6 }), {}, () => 0);
    assert.strictEqual(capped.selected.length, DeathItemDrop.MAX_DROPS);
    assert.strictEqual(DeathItemDrop.MAX_DROPS, 5, 'contemporary gameplay tip: at most five objects');

    const hot = actor([armor, weapon, shots]);
    const cold = {
        characterId: 1, level: 20, stats: { karma: 0, pkCount: 0, deaths: 1 },
        inventory: {
            '23': { selfId: 23, name: armor.name, amount: 1, kind: armor.kind, stackable: false,
                instances: [{ id: 101, amount: 1, enchant: 0, equipped: true, slot: 10 }] },
            '1': { selfId: 1, name: weapon.name, amount: 1, kind: weapon.kind, stackable: false,
                instances: [{ id: 102, amount: 1, enchant: 7, equipped: true, slot: 7 }] },
            '1835': { id: 105, selfId: 1835, name: shots.name, amount: 800, kind: shots.kind, stackable: true }
        }
    };
    const hotPlan = DeathItemDrop.calculateDropPlan(hot, {}, () => 0);
    const coldPlan = DeathItemDrop.calculateDropPlan(cold, {}, () => 0);
    assert.deepStrictEqual(coldPlan.selected.map((entry) => [entry.id, entry.selfId, entry.amount]),
        hotPlan.selected.map((entry) => [entry.id, entry.selfId, entry.amount]),
        'equivalent hot and cold states select the same economic objects');
    assert(!hotPlan.selected.some((entry) => entry.selfId === weapon.selfId),
        'white hot/cold plans both preserve the equipped weapon');
    const coldApplied = DeathItemDrop.applyColdDeath(cold,
        { cold: true, timestamp: 1, deathCount: 1, deathKey: 'cold:1:1' }, () => 0);
    assert.deepStrictEqual(Object.keys(coldApplied.state.inventory), ['1'],
        'ordinary PvE loss can remove armor/stackables while preserving the equipped weapon');
    assert.strictEqual(coldApplied.state.stats.equipment.length, 1);
    assert.strictEqual(coldApplied.state.stats.equipment[0].selfId, weapon.selfId);
    const coldDuplicate = DeathItemDrop.applyColdDeath(coldApplied.state,
        { cold: true, timestamp: 1, deathCount: 1, deathKey: 'cold:1:1' }, () => {
            throw new Error('duplicate cold death must not consume RNG');
        });
    assert.strictEqual(coldDuplicate.plan.duplicate, true);
    assert.deepStrictEqual(coldDuplicate.state.inventory, coldApplied.state.inventory);

    let transferredIds = null;
    DeathItemDrop.applyHotMemory(null, { backpack: {
        transferDeathDropItems(_session, ids) { transferredIds = ids; }
    } }, [{ sourceItemId: 101 }, { sourceItemId: 102 }]);
    assert.deepStrictEqual(transferredIds, [101, 102], 'hot mutation delegates to Backpack authority');

    const sourceId = await createCharacter('death_drop_source', 'DropSource');
    const recipientId = await createCharacter('death_drop_recipient', 'DropRecipient');
    const inserted = await Database.setItem(sourceId, {
        selfId: 23, name: 'Wooden Breastplate', amount: 1, enchant: 6, equipped: true, slot: 10
    });
    const sourceItemId = Number(inserted.insertId);
    const record = {
        characterId: sourceId,
        deathKey: `hot:${sourceId}:1`,
        mode: 'hot', reason: 'ordinary_pve_risk', karma: 0, pkCount: 0,
        candidateCount: 1, selected: [{ id: sourceItemId, selfId: 23, stackable: false }],
        context: { killerPlayable: false }, createdAt: 100,
        locX: 10, locY: 20, locZ: 30
    };
    const committed = await Database.applyCharacterDeathItemDrop(record);
    assert.strictEqual(committed.drops.length, 1);
    assert.strictEqual((await Database.fetchItems(sourceId)).length, 0, 'owner loses the exact item');
    assert.strictEqual(Number(committed.drops[0].sourceItemId), sourceItemId);
    assert.strictEqual(Number(committed.drops[0].enchant), 6);

    await Database.close();
    Database.init();
    const restarted = await Database.applyCharacterDeathItemDrop(record);
    assert.strictEqual(restarted.duplicate, true, 'the durable death key survives restart');
    assert.strictEqual((await Database.fetchPendingDeathWorldItems()).length, 1,
        'restart exposes one recoverable ground object, never a clone');

    const claim = await Database.claimDeathWorldItem(committed.drops[0].id, recipientId);
    assert.strictEqual(claim.claimed, true);
    const received = (await Database.fetchItems(recipientId)).find((entry) => Number(entry.id) === sourceItemId);
    assert(received, 'non-stackable pickup preserves the source object id');
    assert.strictEqual(Number(received.enchant), 6, 'enchant survives inventory -> world -> inventory transfer');
    assert.strictEqual((await Database.fetchPendingDeathWorldItems()).length, 0);
    assert.strictEqual((await Database.claimDeathWorldItem(committed.drops[0].id, sourceId)).claimed, false,
        'a ground object can be claimed only once');

    const replayAfterClaim = await Database.applyCharacterDeathItemDrop(record);
    assert.strictEqual(replayAfterClaim.duplicate, true);
    assert.strictEqual(replayAfterClaim.drops.length, 0,
        'a claimed row is never returned for memory removal or world rehydration');

    const redropped = await Database.applyCharacterDeathItemDrop({
        ...record,
        characterId: recipientId,
        deathKey: `hot:${recipientId}:1`,
        selected: [{ id: sourceItemId, selfId: 23, stackable: false }],
        createdAt: 175
    });
    assert.strictEqual(redropped.drops.length, 1,
        'a claimed item instance can become a new ground object after a later death');
    assert.strictEqual(Number(redropped.drops[0].sourceItemId), sourceItemId);
    assert.strictEqual((await Database.fetchItems(recipientId)).some((entry) => Number(entry.id) === sourceItemId), false);
    assert.strictEqual((await Database.claimDeathWorldItem(redropped.drops[0].id, sourceId)).claimed, true);

    const coldSource = await Database.setItem(sourceId, {
        selfId: 114, name: 'Elven Earring', amount: 1, enchant: 3, equipped: true, slot: 9
    });
    const coldFallback = await Database.applyCharacterDeathItemDrop({
        ...record,
        mode: 'cold',
        deathKey: `cold:${sourceId}:3`,
        selected: [{ id: null, selfId: 114, enchant: 3, equipped: true, slot: 9, stackable: false }],
        createdAt: 190
    });
    assert.strictEqual(coldFallback.drops.length, 1,
        'cold summaries without a materialized instance id resolve the matching physical item');
    assert.strictEqual(Number(coldFallback.drops[0].sourceItemId), Number(coldSource.insertId));
    assert.strictEqual((await Database.claimDeathWorldItem(coldFallback.drops[0].id, recipientId)).claimed, true);

    const recoverySource = await Database.setItem(sourceId, {
        selfId: 2, name: 'Long Sword', amount: 1, enchant: 4, equipped: true, slot: 7
    });
    const recoveryRecord = {
        characterId: sourceId,
        deathKey: `cold:${sourceId}:4`,
        mode: 'cold', reason: 'ordinary_pve_risk', karma: 0, pkCount: 0,
        candidateCount: 1,
        selected: [{ id: Number(recoverySource.insertId), selfId: 2, enchant: 4,
            equipped: true, slot: 7, stackable: false }],
        context: { cold: true, deathCount: 4 }, createdAt: 195,
        locX: 10, locY: 20, locZ: 30
    };
    await Database.execute([`INSERT INTO bot_life_state (characterId, statsJson)
        VALUES (?, ?) ON CONFLICT(characterId) DO UPDATE SET statsJson = excluded.statsJson`,
    [sourceId, JSON.stringify({ deathItemDrop: recoveryRecord })]]);
    const recovered = await Database.recoverPendingColdDeathItemDrops();
    assert.strictEqual(recovered.length, 1,
        'startup recovery completes a cold ownership transition saved before its ledger commit');
    assert.strictEqual((await Database.fetchItems(sourceId))
        .some((entry) => Number(entry.id) === Number(recoverySource.insertId)), false);
    assert.strictEqual((await Database.recoverPendingColdDeathItemDrops()).length, 0,
        'cold startup recovery is idempotent');
    const recoveredGround = (await Database.fetchPendingDeathWorldItems())
        .find((entry) => Number(entry.sourceItemId) === Number(recoverySource.insertId));
    assert(recoveredGround);
    assert.strictEqual((await Database.claimDeathWorldItem(recoveredGround.id, recipientId)).claimed, true);

    const recipientStack = await Database.setItem(recipientId, {
        selfId: 1864, name: 'Stem', amount: 5, equipped: false, slot: 0
    });
    const sourceStack = await Database.setItem(sourceId, {
        selfId: 1864, name: 'Stem', amount: 10, equipped: false, slot: 0
    });
    await Database.setItem(sourceId, {
        selfId: 1864, name: 'Stem', amount: 7, equipped: false, slot: 0
    });
    const stackResolution = await Database.applyCharacterDeathItemDrop({
        ...record,
        deathKey: `hot:${sourceId}:2`,
        selected: [{ id: Number(sourceStack.insertId), selfId: 1864, stackable: true }],
        createdAt: 200
    });
    const stackDrop = stackResolution.drops[0];
    assert.strictEqual(Number(stackDrop.amount), 17, 'all physical rows in a stack transfer as one object');
    assert.strictEqual((await Database.fetchItems(sourceId))
        .filter((entry) => Number(entry.selfId) === 1864).length, 0);
    const ground = {
        fetchId: () => 5000001,
        fetchDeathDropId: () => Number(stackDrop.id),
        fetchSelfId: () => 1864,
        fetchAmount: () => 17
    };
    let memoryAmount = 5;
    const memoryStack = {
        fetchId: () => Number(recipientStack.insertId),
        fetchAmount: () => memoryAmount,
        setAmount: (amount) => { memoryAmount = amount; }
    };
    const pickupActor = {
        fetchId: () => recipientId,
        fetchIsOnline: () => true,
        isDead: () => false,
        backpack: { fetchItems: () => [memoryStack] }
    };
    const pickupSession = {
        actor: pickupActor,
        dataSendToMe() {},
        dataSendToMeAndOthers() {}
    };
    const pickup = require('../src/GameServer/World/Generics/PickupItem');
    const pickupWorld = { items: { spawns: [ground] } };
    assert.strictEqual(await pickup.call(pickupWorld, pickupSession, pickupActor, ground), true);
    assert.strictEqual(pickupWorld.items.spawns.length, 0);
    assert.strictEqual(memoryAmount, 22, 'normal pickup path mirrors an atomic stack claim into hot memory');
    const storedStack = (await Database.fetchItems(recipientId))
        .find((entry) => Number(entry.id) === Number(recipientStack.insertId));
    assert.strictEqual(Number(storedStack.amount), 22);

    const noCandidateActor = actor([], { id: sourceId });
    const beforeRepeatedDeaths = (await Database.fetchCharacterDeathItemDrops(sourceId)).length;
    await DeathItemDrop.applyHotDeath(null, noCandidateActor,
        { timestamp: 300, deathKey: `hot:${sourceId}:4` }, () => 0).persistence;
    await DeathItemDrop.applyHotDeath(null, noCandidateActor,
        { timestamp: 301, deathKey: `hot:${sourceId}:5` }, () => 0).persistence;
    assert.strictEqual((await Database.fetchCharacterDeathItemDrops(sourceId)).length,
        beforeRepeatedDeaths + 2, 'the actor-local idempotency cache must not suppress a later death');

    console.log('C4 death item-drop rule, parity, persistence, and conservation checks passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => Database.close());
