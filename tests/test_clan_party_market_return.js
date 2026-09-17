const assert = require('assert');
require('../src/Global');
const Life = invoke('GameServer/Bot/Population/BotLifeState');
const Parties = invoke('GameServer/Bot/Population/BackgroundPartyState');
const Service = invoke('GameServer/Bot/Population/PopulationService');
const Executor = invoke('GameServer/Bot/Goals/GoalExecutor');
const Spots = invoke('GameServer/Bot/AI/SpotService');
const Risk = invoke('GameServer/Bot/Population/SpotRiskPolicy');
const { lifecycleKind } = require('../src/GameServer/Bot/Population/ColdSimulationKernel');
const now = Date.now();
const objective = { status: 'open', priority: 'required', clanGoalKey: 'clan:1:gear', clanId: 1,
    clanOperation: 'equipment', minPartySize: 3, maxPartySize: 9 };
const token = { partyId: 'clan-party', characterId: 3, objective, until: now + 900000 };
let party = { partyId: token.partyId, status: 'active', leaderId: 1, memberIds: [1, 2], spotId: 'test',
    stats: { objective, marketAbsences: { 3: token } } };
const leader = { characterId: 1, name: 'Leader', level: 40, loc: { locX: 100, locY: 200, locZ: -100 },
    party: { partyId: party.partyId }, stats: {} };
const returning = { characterId: 3, name: 'Returning', phase: 'cold', level: 40, activity: 'shopping',
    loc: { locX: 1000, locY: 2000, locZ: -100 }, party: { partyId: null },
    stats: { partyMarketReturn: token, marketReturn: { loc: leader.loc, spotId: 'test' } } };
Parties.find = () => party;
Life.cachedState = id => id === 1 ? leader : null;
Spots.findById = () => ({ id: 'test', name: 'Test' });
Risk.backoffForStates = () => { throw new Error('must not apply solo bans to a clan rendezvous'); };
(async () => {
    const travel = Executor.finishMarketVisit(returning, now);
    assert.deepStrictEqual(travel.stats.travel.to, leader.loc);
    assert.strictEqual(travel.stats.travel.arrivalActivity, 'party_wait');
    assert.strictEqual(lifecycleKind(returning), 'command', 'shopping must execute economy, not clan waiting');
    const arrived = { ...returning, activity: 'party_wait', stats: { partyMarketReturn: token } };
    assert.strictEqual(lifecycleKind(arrived), 'command', 'arrival must attempt membership before any solo resolver');
    Life.statesForParty = async () => [leader, { ...leader, characterId: 2 }];
    Parties.createOrUpdate = async value => (party = value);
    const assigned = [];
    Life.assignParty = async (state, partyId) => { assigned.push({ state, partyId }); return state; };
    const result = await Service.resolveColdState(arrived);
    assert.strictEqual(result.reason, 'returned_to_clan_party');
    assert.deepStrictEqual(party.memberIds, [1, 2, 3]);
    assert.deepStrictEqual(party.stats.marketAbsences, {});
    assert.strictEqual(assigned.find(x => x.state.characterId === 3).state.stats.partyMarketReturn, null);
    party.status = 'dissolved';
    let saved;
    Life.upsertState = async state => (saved = state);
    await Service.resolveColdState(arrived);
    assert.strictEqual(saved.activity, 'party_wait');
    assert.strictEqual(saved.stats.partyRequest.clanGoalKey, objective.clanGoalKey);
    assert.strictEqual(saved.stats.partyMarketReturn, null);
    console.log('Clan market return: live rendezvous, solo risk isolation, same-party return and dissolved-party waiting passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
