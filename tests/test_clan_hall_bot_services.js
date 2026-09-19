const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('../src/Global');
const Data = invoke('GameServer/DataCache');
Data.init();
const Runtime = require('../src/GameServer/ClanHall/Runtime');
const Services = require('../src/GameServer/ClanHall/Services');
const Hot = require('../src/GameServer/ClanHall/BotVisit');
const Cold = require('../src/GameServer/ClanHall/ColdVisit');
const Effects = invoke('GameServer/Effects/EffectStore');
const Ticker = invoke('GameServer/Effects/EffectTicker');
const Life = invoke('GameServer/Bot/Population/BotLifeState');
const Database = invoke('Database');
const World = invoke('GameServer/World/World');
const Approach = invoke('GameServer/Bot/AI/TownNpcApproach');
const Navigation = invoke('GameServer/Bot/AI/CompanionNavigationRecovery');
const Spots = invoke('GameServer/Bot/AI/SpotService');
const Departure = require('../src/GameServer/ClanHall/Departure');
const originalBestSpot = Spots.findBestSpot;
const originalArrival = Spots.arrivalPointForState;
const originalInvoke = global.invoke;
const { lifecycleKind, ColdSimulationKernel } = invoke('GameServer/Bot/Population/ColdSimulationKernel');
const membership = invoke('GameServer/Clan/ClanSocialRuntime').view.memberships;
const def = Runtime.Policy.definition(36);
const at = Date.now();
const hallRow = {
    id: def.id,
    ownerId: 1,
    serviceDueAt: at + 86400000,
    functionsJson: '{"support":8}',
    auctionEndsAt: 0,
    rentDueAt: at + 604800000
};
const directory = fs.mkdtempSync(path.resolve('tmp/hall-services-'));
options.default.Database.path = path.join(directory, 'world.sqlite');
Database.init();
let mp = 10000,
    moved = 0;
const npc = {
    fetchId: () => 80000,
    fetchSelfId: () => def.managerIds[0],
    fetchName: () => 'Manager',
    fetchLocX: () => def.spawn.locX,
    fetchLocY: () => def.spawn.locY,
    fetchLocZ: () => def.spawn.locZ,
    fetchMp: () => mp,
    setMp: (v) => {
        mp = v;
    },
    fetchHead: () => 0,
    isDead: () => false
};
const originalNpc = World.npc;
const originalLos = Approach.hasLineOfSight;
const originalMove = Navigation.move;
World.npc = { spawns: [npc] };
Approach.hasLineOfSight = () => true;
Navigation.move = () => {
    moved++;
    return { status: 'moving' };
};
Runtime.applyRows([hallRow]);
function stateFor(id, classId = 88) {
    return {
        characterId: id,
        accountName: 'bot_hall_services',
        name: 'HallVisitor',
        phase: 'cold',
        activity: 'hunting',
        level: 60,
        exp: 1000000,
        sp: 10000,
        adena: 100000,
        loc: { ...def.spawn },
        currentRegion: def.town,
        spotId: null,
        vitals: { hp: 10000, maxHp: 10000, mp: 10000, maxMp: 10000 },
        timing: { lastResolvedAt: at, nextResolveAt: at, activityStartedAt: at },
        party: { partyId: null },
        inventory: {},
        stats: {
            classId,
            classProgressionLevel: 60,
            classProgressionClassId: classId,
            coldCombat: { effects: [], skills: [], skillSource: 'hot' }
        },
        simulation: { ownerId: 'legacy_main', revision: 0, leaseUntil: 0 }
    };
}
function hotActor(state) {
    const a = Cold.actorFor(state, Runtime.owned(1));
    let seated = false;
    a.state = {
        fetchDead: () => false,
        fetchCombats: () => false,
        fetchSeated: () => seated,
        setSeated: (v) => {
            seated = v;
        }
    };
    a.automation = { abortAll() {}, replenishVitals() {} };
    a.unselect = () => {};
    a.fetchKarma = () => 0;
    return a;
}
async function main() {
    const actors = [];
    try {
        await Database.createAccount('bot_hall_services', 'test');
        await Database.createCharacter('bot_hall_services', {
            name: 'HallVisitor',
            race: 0,
            classId: 88,
            maxHp: 10000,
            maxMp: 10000,
            sex: 0,
            face: 0,
            hair: 0,
            hairColor: 0,
            ...def.spawn
        });
        const character = (await Database.fetchCharacters('bot_hall_services'))[0];
        const id = Number(character.id);
        membership.set(id, 1);
        let state = stateFor(id);
        const physical = hotActor(state);
        actors.push(physical);
        const magic = hotActor(stateFor(id + 1, 94));
        actors.push(magic);
        assert(Services.missing(physical, Runtime.owned(1), at).some((s) => s.fetchSelfId() === 1086));
        assert(!Services.missing(magic, Runtime.owned(1), at).some((s) => s.fetchSelfId() === 1086));
        assert(Services.missing(magic, Runtime.owned(1), at).some((s) => s.fetchSelfId() === 1059));
        const haste2 = Services.skillFor({ id: 1086, level: 2 });
        Effects.apply(physical, { ...Services.effectFor(haste2, at), expiresAt: at + 30000 });
        assert(
            !Services.missing(physical, Runtime.owned(1), at).some((s) => s.fetchSelfId() === 1086),
            'never replace stronger haste'
        );
        const shield3 = Services.skillFor({ id: 1040, level: 3 });
        Effects.apply(physical, Services.effectFor(shield3, at));
        assert(!Services.missing(physical, Runtime.owned(1), at).some((s) => s.fetchSelfId() === 1040));
        const focus = Services.skillFor({ id: 1077, level: 1 });
        Effects.apply(physical, Services.effectFor(focus, at));
        assert(
            !Services.missing(physical, Runtime.owned(1), at).some((s) => s.fetchSelfId() === 1077),
            'unstacked buffs must not loop'
        );
        const full = hotActor(state);
        actors.push(full);
        for (let i = 0; i < Effects.BUFF_LIMIT; i++)
            Effects.apply(full, {
                key: `protected${i}`,
                id: 9000 + i,
                type: 'buff',
                expiresAt: at + 1200000,
                dispellable: false
            });
        assert.equal(
            Services.missing(full, Runtime.owned(1), at).length,
            0,
            'do not evict unrelated buffs for a hall visit'
        );
        const broadcasts = [];
        const session = {
            actor: physical,
            plan: 'hunting',
            dataSendToMe() {},
            dataSendToOthers() {},
            dataSendToMeAndOthers(packet, caster) { broadcasts.push({ packet, caster }); }
        };
        physical.session = session;
        const beforeMp = mp;
        assert(Hot.tick(session, physical, at));
        assert(mp < beforeMp, 'real hot casting consumes manager MP');
        assert(Effects.list(physical).length > 3, 'native hot effect pipeline applies a hall buff');
        assert.deepEqual(broadcasts.map(b => b.packet[0]), [0x48, 0x76], 'each NPC cast has a start and launch');
        for (const { packet, caster } of broadcasts) {
            assert.strictEqual(caster, npc, 'both packets reach observers of the same manager');
            assert.equal(packet.readInt32LE(1), npc.fetchId());
        }
        assert.equal(broadcasts[0].packet.readInt32LE(5), physical.fetchId());
        assert.equal(broadcasts[1].packet.readInt32LE(17), physical.fetchId());
        const afterFirstMp = mp;
        const magicEffects = Effects.list(magic).length;
        const contention = Services.cast(session, magic, npc, 1059, at + 1);
        assert.equal(contention.code, 'manager_busy', 'all recipients share one manager cast window');
        assert.equal(mp, afterFirstMp, 'a busy manager does not consume MP');
        assert.equal(Effects.list(magic).length, magicEffects, 'a busy manager grants no effect');
        assert.equal(broadcasts.length, 2, 'no overlapping animation for another recipient');
        assert.equal(Services.cast(null, magic, npc, 1059, at + 1, true).code, 'manager_busy',
            'cold recipients use the same manager budget');
        const waiting = { ...session, actor: magic, clanHallVisit: null };
        assert(Hot.tick(waiting, magic, at + 1));
        assert(waiting.clanHallVisit, 'a busy manager does not cancel the bot visit');
        assert.equal(waiting.clanHallVisit.nextCastAt, contention.retryAt);
        const hotExpiry = Effects.list(physical).find((e) => e.id === 1204).expiresAt;
        const blocked = { ...session, clanHallVisit: null, currentTargetId: 55 };
        assert.equal(Hot.tick(blocked, physical, at + 2000), false, 'combat target takes priority');
        assert.equal(Hot.tick({ ...session, clanHallVisit: null, clanAllianceQuest: {} }, physical, at), false);
        const remote = hotActor({ ...state, loc: { locX: 0, locY: 0, locZ: 0 } });
        actors.push(remote);
        assert.equal(
            Hot.tick({ ...session, actor: remote, clanHallVisit: null }, remote, at),
            false,
            'no cross-map detours'
        );
        assert.equal(
            Hot.tick({ ...session, actor: remote, clanHallVisit: null, followPlayerSession: {} }, remote, at),
            false,
            'do not abandon a party'
        );
        const nearby = hotActor({ ...state, loc: { ...def.spawn, locX: def.spawn.locX + 900 } });
        actors.push(nearby);
        assert(Hot.tick({ ...session, actor: nearby, clanHallVisit: null }, nearby, at));
        assert(moved > 0, 'visible bot approaches the manager instead of receiving remote buffs');
        mp = 0;
        const unbuffed = hotActor(state);
        actors.push(unbuffed);
        assert.equal(Services.cast(null, unbuffed, npc, 1086, at, true).code, 'manager_needs_mp');
        assert.equal(Effects.list(unbuffed).length, 0);
        mp = 10000;
        assert(Cold.needed(state, at));
        assert.equal(Cold.needed({ ...state, stats: { ...state.stats, pveEncounter: { hp: 10 } } }, at), false);
        assert.equal(
            Cold.needed({ ...state, stats: { ...state.stats, equipmentPlan: { clanGoal: { goalKey: 'level' } } } }, at),
            false
        );
        assert.equal(Cold.needed({ ...state, party: { partyId: 'party' } }, at), false);
        await Life.init();
        state = await Life.upsertState(state, 'hall_test_seed');
        assert(state);
        assert.equal(lifecycleKind(state, { clanHallServices: true }), 'command');
        let requests;
        const kernel = new ColdSimulationKernel({
            now: () => at,
            emit: (type, payload) => {
                if (type === 'command_request') requests = payload.requests;
            },
            resolveSolo: () => {
                throw Error('hall service must not simulate a fight');
            }
        });
        kernel.upsert({ state, context: { clanHallServices: true } });
        await kernel.resolveCommand(id);
        assert(requests?.[0].precomputedResult, 'worker requests a main-thread service operation');
        const returnSpot = { id: 'hall-return-test', name: 'Hunting field',
            center: { locX: 10000, locY: 15000, locZ: -3000 }, npcNames: [] };
        let selection;
        Spots.findBestSpot = (status, options) => { selection = { status, options }; return { spot: returnSpot }; };
        Spots.arrivalPointForState = () => ({ ...returnSpot.center });
        const safeDeparture = Departure.plan({ ...state, stats: { ...state.stats,
            spotBackoffs: [{ spotId: 'dangerous', until: at + 100000 }] } }, Runtime.owned(1), at);
        assert(safeDeparture);
        assert.equal(selection.options.spotRetryAfter.dangerous, Infinity, 'do not return to a dangerous spot');
        assert.equal(selection.options.mode, 'solo');
        assert.equal(Departure.plan({ ...state, loc: { locX: 0, locY: 0, locZ: 0 } }, Runtime.owned(1), at), null,
            'hall departure is not a free teleport from anywhere');
        Spots.arrivalPointForState = () => null;
        assert.equal(Departure.plan(state, Runtime.owned(1), at), null, 'no teleport without a valid arrival point');
        Spots.arrivalPointForState = () => ({ ...returnSpot.center });
        let hotDestination;
        global.invoke = (name) => name === 'GameServer/Actor/Generics/TeleportTo'
            ? (_session, _actor, destination) => { hotDestination = destination; return true; }
            : originalInvoke(name);
        const departing = { ...session, actor: full, clanHallVisit: { hallId: def.id, expiresAt: at + 180000 } };
        assert(Hot.tick(departing, full, at + 1000));
        assert.deepEqual(hotDestination, returnSpot.center, 'a serviced hot bot teleports directly to hunting');
        assert.equal(departing.currentSpot.id, returnSpot.id);
        assert.equal(departing.spotRelocation.method, 'clan_hall');
        assert(departing.spotRelocation.arrivalPending, 'normal teleport settling prevents an immediate movement command');
        hotDestination = null;
        const grouped = { ...session, actor: full, followPlayerSession: {},
            clanHallVisit: { hallId: def.id, expiresAt: at + 180000 } };
        assert.equal(Hot.tick(grouped, full, at + 1000), false);
        assert.equal(hotDestination, null, 'party members stay with their party after support');
        global.invoke = originalInvoke;
        for (let i = 0; i < 30; i++) {
            const outcome = await Cold.resolve(state, at + i * 2000);
            assert(outcome?.ok, 'cold service snapshot persists');
            state = outcome.state;
            if (!state.stats.clanHallVisit) break;
        }
        assert.equal(state.activity, 'hunting');
        assert.equal(state.stats.clanHallVisit, null, 'completed visit resumes hunting');
        assert.deepEqual(state.loc, returnSpot.center, 'cold departure persists an immediate teleport');
        assert.equal(state.spotId, returnSpot.id);
        assert.equal(state.stats.travel, null, 'no gatekeeper or walking leg after hall support');
        const haste = state.stats.coldCombat.effects.find((e) => e.id === 1086);
        assert.equal(haste.level, 1, 'cold service preserves the C4 hall skill rank');
        assert(haste.expiresAt > at && haste.expiresAt < at + 1300000);
        const row = (await Database.execute(['SELECT statsJson FROM bot_life_state WHERE characterId=?', [id]]))[0];
        assert(JSON.parse(row.statsJson).coldCombat.effects.some((e) => e.id === 1086));
        assert.equal(Cold.needed(state, at + 60000), false, 'no repeat visit while buffs are fresh');
        const activated = hotActor({ ...state, stats: { ...state.stats, coldCombat: { effects: [] } } });
        actors.push(activated);
        invoke('GameServer/Actor/CharacterStatus').restoreEffects(null, activated, state.stats.coldCombat.effects);
        assert.equal(
            Effects.list(activated).find((e) => e.id === 1086).expiresAt,
            haste.expiresAt,
            'cold-to-hot activation keeps the original expiry, without a fresh 20 minutes'
        );
        const travelStart = {
            ...state,
            activity: 'hunting',
            loc: { ...def.spawn, locX: def.spawn.locX + 900 },
            stats: { ...state.stats, clanHallRetryAt: 0, coldCombat: { ...state.stats.coldCombat, effects: [] } }
        };
        let walking = await Cold.resolve(travelStart, at + 60000);
        assert(walking.ok && walking.state.activity === 'traveling');
        assert.equal(walking.state.stats.coldCombat.effects.length, 0, 'walking grants no remote buffs');
        walking = await Cold.resolve(walking.state, walking.state.stats.travel.arrivalAt + 1);
        assert(walking.ok && walking.state.activity === 'clan_hall');
        assert.equal(walking.state.stats.coldCombat.effects.length, 0, 'arrival is separate from service use');
        const arrived = await Cold.resolve(walking.state, walking.state.timing.nextResolveAt);
        assert(arrived.ok && arrived.state.stats.coldCombat.effects.length > 0);
        const death = {
            ...state,
            activity: 'dead',
            vitals: { ...state.vitals, hp: 0 },
            stats: { ...state.stats, clanHallRetryAt: 0 }
        };
        const respawned = await Cold.resolve(death, at + 80000);
        assert(respawned.ok);
        assert.deepEqual(respawned.state.loc, def.spawn, 'cold death returns to the actual owned hall');
        assert.equal(respawned.state.stats.coldCombat.effects.length, 0, 'death does not preserve old buffs');
        assert.equal(Runtime.Policy.desired(def, [{ level: 60, classId: 94 }]).support, 8);
        assert(hotExpiry > at); // The native effect keeps an absolute deadline for persistence.
        const lost = {
            ...state,
            activity: 'clan_hall',
            stats: { ...state.stats, clanHallVisit: { hallId: def.id, startedAt: at, expiresAt: at + 180000 } }
        };
        membership.delete(id);
        const cancelled = await Cold.resolve(lost, at + 70000);
        assert(cancelled.ok && !cancelled.state.stats.clanHallVisit, 'membership loss cancels an in-progress visit');
        membership.set(id, 1);
        const later = Services.cast(session, magic, npc, 1059, at + 200000);
        assert(later.ok, 'the next recipient can use the manager after the shared interval');
        const lastPackets = broadcasts.slice(-2).map(b => b.packet);
        assert.deepEqual(lastPackets.map(p => p[0]), [0x48, 0x76]);
        assert.equal(lastPackets[0].readInt32LE(5), magic.fetchId());
        assert.equal(lastPackets[1].readInt32LE(17), magic.fetchId(), 'launch never retains the previous recipient');
        Runtime.applyRows([{ ...hallRow, serviceDueAt: at - 1 }]);
        assert.equal(Services.missing(magic, Runtime.owned(1), at).length, 0);
        assert.equal(Services.cast(null, magic, npc, 1059, at, true).code, 'not_authorized');
        const Resolver = invoke('GameServer/Bot/Population/BackgroundResolver');
        const weak = {
            ...state,
            vitals: { hp: 10, maxHp: 10000, mp: 10, maxMp: 10000 },
            stats: { ...state.stats, restUntil: 0 }
        };
        const regular = Resolver.resolveRest(weak, 3000, at);
        const boosted = Resolver.resolveRest(weak, 3000, at, { hpMultiplier: 2, mpMultiplier: 1.4 });
        assert(Math.abs(boosted.patch.vitals.hp - 10 - 2 * (regular.patch.vitals.hp - 10)) < 0.01);
        assert(Math.abs(boosted.patch.vitals.mp - 10 - 1.4 * (regular.patch.vitals.mp - 10)) < 0.01);
        console.log(
            'Clan hall bot service selection, hot casting, cold persistence, worker routing, safety and recovery checks passed'
        );
    } finally {
        actors.forEach((a) => Ticker.clearAll(a));
        global.invoke = originalInvoke;
        Spots.findBestSpot = originalBestSpot;
        Spots.arrivalPointForState = originalArrival;
        World.npc = originalNpc;
        Approach.hasLineOfSight = originalLos;
        Navigation.move = originalMove;
        Runtime.applyRows([]);
        await Database.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
