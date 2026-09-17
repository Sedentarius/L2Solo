const assert = require('assert');

require('../src/Global');

const Config = invoke('GameServer/Bot/Population/PopulationConfig');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const SpotProfiles = invoke('GameServer/Bot/Population/SpotProfiles');
const PartyState = invoke('GameServer/Bot/Population/BackgroundPartyState');
const GoalService = invoke('GameServer/Bot/Goals/GoalService');
const GoalExecutor = invoke('GameServer/Bot/Goals/GoalExecutor');
const ItemDisposition = invoke('GameServer/Bot/Economy/ItemDisposition');
const PopulationService = invoke('GameServer/Bot/Population/PopulationService');

const originals = {
    cachedState: LifeState.cachedState,
    leaveParty: LifeState.leaveParty,
    findById: SpotProfiles.findById,
    createOrUpdate: PartyState.createOrUpdate,
    snapshotGoal: GoalService.snapshot,
    reviewGoal: GoalService.review,
    beginMarketTravel: GoalExecutor.beginMarketTravel,
    inventoryCleanupNeed: ItemDisposition.inventoryCleanupNeed
};

(async () => {
    const now = Date.now();
    const members = [1, 2, 3].map((characterId) => ({
        characterId,
        name: `WorkerPartyGoal${characterId}`,
        phase: 'cold',
        level: 40,
        activity: 'hunting',
        adena: 100000,
        loc: { locX: 100, locY: 200, locZ: -100 },
        spotId: 'worker-party-goal-spot',
        currentRegion: 'Dion',
        party: { partyId: 'worker-party-goals', leaderId: 1 },
        stats: { role: 'dps' },
        timing: { nextResolveAt: now + 60000 },
        inventory: {}
    }));
    const party = {
        partyId: 'worker-party-goals',
        leaderId: 1,
        memberIds: members.map((member) => member.characterId),
        spotId: 'worker-party-goal-spot',
        startedAt: now - Config.partyMarketBreakMinSessionMs - 1000,
        status: 'active',
        stats: {
            formedAt: now - Config.partyMarketBreakMinSessionMs - 1000,
            fightsResolved: Config.partyMarketBreakMinFights,
            lastMarketBreakAt: 0
        }
    };

    LifeState.cachedState = (characterId) => members.find((member) => member.characterId === Number(characterId)) || null;
    SpotProfiles.findById = () => ({ id: party.spotId, name: 'Worker Party Goal Spot' });
    GoalService.snapshot = (characterId) => ({
        characterId,
        current: {
            type: 'recover',
            status: 'active',
            nextReviewAt: characterId === 1 ? now + 60000 : now - 1
        }
    });
    const reviewed = [];
    GoalService.review = (member) => {
        reviewed.push(member.characterId);
        return Promise.resolve({
            characterId: member.characterId,
            current: member.characterId === 2 ? {
                type: 'sell_inventory',
                status: 'active',
                target: { cleanupReason: 'inventory_capacity' },
                plan: { expectedBenefit: 'market_sale_inventory', cleanupReason: 'inventory_capacity' }
            } : {
                type: 'recover',
                status: 'active',
                nextReviewAt: now + 60000
            }
        });
    };
    ItemDisposition.inventoryCleanupNeed = () => null;
    GoalExecutor.beginMarketTravel = (member, goal) => goal?.type === 'sell_inventory'
        ? { ...member, activity: 'traveling', stats: { ...member.stats, travel: { reason: 'market_sale_inventory' } } }
        : null;
    const departed = [];
    LifeState.leaveParty = (travel, reason) => {
        departed.push({ characterId: travel.characterId, reason });
        return Promise.resolve({ ...travel, party: { partyId: null, leaderId: null } });
    };
    let savedParty = null;
    PartyState.createOrUpdate = (nextParty) => {
        savedParty = nextParty;
        return Promise.resolve(nextParty);
    };

    const result = await PopulationService.reconcileWorkerPartyGoals(party, now);
    assert.deepStrictEqual(reviewed, [2, 3], 'fresh cached goals must not be recalculated on every party resolve');
    assert.deepStrictEqual(departed, [{ characterId: 2, reason: 'market_break' }],
        'a worker party resolve may detach at most one member for a real market goal');
    assert.strictEqual(result.departed.characterId, 2);
    assert.deepStrictEqual(savedParty.memberIds, [1, 3], 'the durable party roster must drop the market-break member');
    assert.strictEqual(savedParty.leaderId, 1);
    assert.strictEqual(savedParty.stats.lastMarketBreakAt, now);
    party.stats.objective = { status: 'open', priority: 'required', clanGoalKey: 'clan:1:gear',
        clanId: 1, minPartySize: 3 };
    departed.length = 0;
    savedParty = null;
    await PopulationService.reconcileWorkerPartyGoals(party, now);
    assert.strictEqual(departed.length, 0, 'stale sell goal cannot interrupt clan duty without current capacity pressure');
    ItemDisposition.inventoryCleanupNeed = member => member.characterId === 2
        ? { reason: 'npc_only_inventory', slots: 10, limit: 80 } : null;
    await PopulationService.reconcileWorkerPartyGoals(party, now);
    assert.strictEqual(departed.length, 0, 'NPC junk is optional while farming for the clan');
    ItemDisposition.inventoryCleanupNeed = member => member.characterId === 2
        ? { reason: 'inventory_capacity', slots: 81, limit: 80 } : null;
    const emergency = await PopulationService.reconcileWorkerPartyGoals(party, now);
    assert.strictEqual(emergency.departed.stats.partyMarketReturn.partyId, party.partyId);
    assert.strictEqual(emergency.departed.stats.lastPartyMarketBreak.slots, 81);
    assert.strictEqual(savedParty.stats.marketAbsences[2].objective.clanGoalKey, 'clan:1:gear');
    assert.deepStrictEqual(savedParty.memberIds, [1, 3]);
    assert.strictEqual(PopulationService.partySessionExpired(savedParty, now), false,
        'a short essential errand must not expire the shared hunt');
    assert.strictEqual(require('../src/GameServer/Bot/Population/PartyMarketBreak').pending(savedParty, now + 16 * 60000).length, 0,
        'a missing bot cannot reserve a slot forever');
    console.log('Cold worker party goal reconciliation checks passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => {
    LifeState.cachedState = originals.cachedState;
    LifeState.leaveParty = originals.leaveParty;
    SpotProfiles.findById = originals.findById;
    PartyState.createOrUpdate = originals.createOrUpdate;
    GoalService.snapshot = originals.snapshotGoal;
    GoalService.review = originals.reviewGoal;
    GoalExecutor.beginMarketTravel = originals.beginMarketTravel;
    ItemDisposition.inventoryCleanupNeed = originals.inventoryCleanupNeed;
});
