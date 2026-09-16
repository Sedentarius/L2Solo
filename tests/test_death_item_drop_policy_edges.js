const assert = require('assert');

require('../src/Global');

const DeathItemDrop = invoke('GameServer/Progression/DeathItemDrop');
const die = require('../src/GameServer/Actor/Generics/Die');

function item({
    id,
    selfId,
    name = `Item ${selfId}`,
    amount = 1,
    enchant = 0,
    equipped = false,
    slot = 0,
    kind = 'Other.Material',
    stackable = false,
    droppable = true,
    petLocked = false
}) {
    return {
        id,
        selfId,
        name,
        amount,
        enchant,
        equipped,
        slot,
        kind,
        stackable,
        droppable,
        petLocked,
        fetchId: () => id,
        fetchSelfId: () => selfId,
        fetchName: () => name,
        fetchAmount: () => amount,
        fetchEnchantLevel: () => enchant,
        fetchEquipped: () => equipped,
        fetchSlot: () => slot,
        fetchKind: () => kind,
        fetchPetLocked: () => petLocked,
        model: { stackable, droppable }
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

function forbiddenRng(message) {
    return () => {
        throw new Error(message || 'protected death must not consume RNG');
    };
}

function run() {
    const player = {};
    const summon = { fetchKind: () => 'Summon' };
    const mob = { fetchKind: () => 'Npc' };

    let cause = die.resolveDeathCause({ source: player }, null);
    assert.strictEqual(cause.killerPlayable, true);
    assert.strictEqual(cause.playerControlledKiller, true);

    cause = die.resolveDeathCause({ source: summon, killer: player }, null);
    assert.strictEqual(cause.killerPlayable, false,
        'summon remains non-playable for the existing EXP classification');
    assert.strictEqual(cause.playerControlledKiller, true,
        'summon owner must still make item-drop consequences PvP-caused');

    cause = die.resolveDeathCause({ source: mob }, null);
    assert.strictEqual(cause.killerPlayable, false);
    assert.strictEqual(cause.playerControlledKiller, false);

    cause = die.resolveDeathCause({}, player);
    assert.strictEqual(cause.killerPlayable, true,
        'legacy session actor fallback remains a direct playable cause');
    assert.strictEqual(cause.playerControlledKiller, true);

    const armor = item({ id: 101, selfId: 23, equipped: true, slot: 10, kind: 'Armor.Light' });
    const equippedWeapon = item({
        id: 102, selfId: 1, enchant: 7, equipped: true, slot: 7, kind: 'Weapon.Sword'
    });
    const inventoryWeapon = item({ id: 103, selfId: 2, kind: 'Weapon.Blunt' });

    const directPvp = DeathItemDrop.calculateDropPlan(
        actor([armor, equippedWeapon, inventoryWeapon]),
        { killerPlayable: true },
        forbiddenRng('white direct PvP must not roll drops')
    );
    assert.strictEqual(directPvp.eligible, false);
    assert.strictEqual(directPvp.reason, 'ordinary_world_pvp');
    assert.strictEqual(directPvp.selected.length, 0);

    const summonPvp = DeathItemDrop.calculateDropPlan(
        actor([armor, equippedWeapon, inventoryWeapon]),
        { playerControlledKiller: true },
        forbiddenRng('white summon PvP must not roll drops')
    );
    assert.strictEqual(summonPvp.eligible, false);
    assert.strictEqual(summonPvp.reason, 'ordinary_world_pvp');

    const whiteEquippedWeapon = DeathItemDrop.calculateDropPlan(
        actor([equippedWeapon]), {}, forbiddenRng('protected equipped weapon must not roll')
    );
    assert.strictEqual(whiteEquippedWeapon.eligible, false);
    assert.strictEqual(whiteEquippedWeapon.reason, 'no_candidates');
    assert.strictEqual(whiteEquippedWeapon.candidates.length, 0);

    const whiteInventoryWeapon = DeathItemDrop.calculateDropPlan(
        actor([inventoryWeapon]), {}, sequence(0, 0)
    );
    assert.strictEqual(whiteInventoryWeapon.selected.length, 1,
        'weapon protection applies to the equipped weapon, not an unequipped weapon in inventory');
    assert.strictEqual(whiteInventoryWeapon.selected[0].id, inventoryWeapon.id);
    assert.strictEqual(whiteInventoryWeapon.selected[0].category, 'inventory');

    const clearedHighPk = DeathItemDrop.rulesFor(
        actor([equippedWeapon], { karma: 0, pk: 99 }), {}
    );
    assert.strictEqual(clearedHighPk.reason, 'ordinary_pve_risk');
    assert.strictEqual(clearedHighPk.allowWeaponDrop, false,
        'historical PK count alone must not expose the equipped weapon after karma is cleared');
    assert.strictEqual(clearedHighPk.rates, DeathItemDrop.NORMAL_RATES);

    const lowPkMobDeath = DeathItemDrop.calculateDropPlan(
        actor([equippedWeapon, armor], { karma: 100, pk: 5 }), {}, sequence(0, 0)
    );
    assert.strictEqual(lowPkMobDeath.reason, 'chaotic_low_pk_pve_risk');
    assert.deepStrictEqual(lowPkMobDeath.candidates.map((entry) => entry.id), [armor.id],
        'low-PK chaotic PvE keeps the equipped weapon out of the pool');
    assert.strictEqual(lowPkMobDeath.selected[0].id, armor.id);

    const lowPkPlayerDeath = DeathItemDrop.calculateDropPlan(
        actor([equippedWeapon, armor], { karma: 100, pk: 5 }),
        { playerControlledKiller: true },
        forbiddenRng('low-PK chaotic PvP protection must not roll')
    );
    assert.strictEqual(lowPkPlayerDeath.eligible, false);
    assert.strictEqual(lowPkPlayerDeath.reason, 'chaotic_low_pk_pvp_protected');

    const highPkDirectPlayer = DeathItemDrop.calculateDropPlan(
        actor([equippedWeapon], { karma: 100, pk: 6 }),
        { killerPlayable: true },
        sequence(0, 0.099)
    );
    assert.strictEqual(highPkDirectPlayer.reason, 'chaotic_pk_risk');
    assert.strictEqual(highPkDirectPlayer.selected[0].id, equippedWeapon.id,
        'chaotic six-plus PK risk includes the equipped weapon even when a player kills the victim');

    const highPkSummon = DeathItemDrop.calculateDropPlan(
        actor([equippedWeapon], { karma: 100, pk: 6 }),
        { playerControlledKiller: true },
        sequence(0, 0.099)
    );
    assert.strictEqual(highPkSummon.reason, 'chaotic_pk_risk');
    assert.strictEqual(highPkSummon.selected[0].id, equippedWeapon.id,
        'player-owned summons use the same six-plus PK item-risk rule as direct player kills');

    const nonDroppable = item({ id: 110, selfId: 5000, droppable: false });
    const petLocked = item({ id: 111, selfId: 5001, petLocked: true });
    const protectedPool = DeathItemDrop.buildEligiblePool(actor([nonDroppable, petLocked]));
    assert.deepStrictEqual(protectedPool, [],
        'explicitly non-droppable and pet-locked objects never enter the death pool');

    const stemA = item({ id: 120, selfId: 1864, amount: 5, stackable: true });
    const stemB = item({ id: 121, selfId: 1864, amount: 7, stackable: true });
    const mergedStacks = DeathItemDrop.buildEligiblePool(actor([stemA, stemB]));
    assert.strictEqual(mergedStacks.length, 1);
    assert.strictEqual(mergedStacks[0].amount, 12,
        'multiple physical rows of the same stackable collapse into one economic drop candidate');

    const unordered = [305, 301, 306, 304, 303, 302].map((id) => item({
        id,
        selfId: 10000 + id,
        kind: 'Other.Material'
    }));
    const capped = DeathItemDrop.calculateDropPlan(
        actor(unordered, { karma: 100, pk: 6 }), {}, () => 0
    );
    assert.deepStrictEqual(capped.selected.map((entry) => entry.id), [301, 302, 303, 304, 305],
        'stable object-id ordering makes the five-object cap deterministic');

    const lucky = actor([armor], { level: 4 });
    lucky.skillset = { fetchSkills: () => [{ fetchSelfId: () => 194 }] };
    const luckyRule = DeathItemDrop.rulesFor(lucky, {});
    assert.strictEqual(luckyRule.eligible, false);
    assert.strictEqual(luckyRule.reason, 'lucky');

    console.log('C4 death item-drop policy edge cases passed');
}

run();
