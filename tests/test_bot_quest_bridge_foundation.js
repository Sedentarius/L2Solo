const assert = require('assert');

require('../src/Global');

const Bridge = invoke('GameServer/Bot/Quest/BotQuestBridge');
const QuestService = invoke('GameServer/Quest/QuestService');
const BotLifeState = invoke('GameServer/Bot/Population/BotLifeState');
const BotSpotTravel = invoke('GameServer/Bot/AI/BotSpotTravel');
const Navigation = invoke('GameServer/Bot/AI/CompanionNavigationRecovery');

async function main() {
    const startedAt = 1000;
    const baseState = {
        characterId: 77,
        name: 'QuestBot',
        activity: 'hunting',
        loc: { locX: 100, locY: 200, locZ: -50 },
        stats: {},
        timing: {}
    };
    const intentState = Bridge.begin(baseState, {
        questId: 102,
        step: 'start',
        attempt: 1,
        targetNpcId: 7284,
        targetLoc: { locX: 5000, locY: 6000, locZ: -100 }
    }, startedAt);
    assert.strictEqual(intentState.stats.questBridge.questId, 102);
    assert.strictEqual(intentState.stats.questBridge.step, 'start');
    assert.strictEqual(intentState.stats.questBridge.attempt, 1);
    assert.strictEqual(Bridge.actionKey(intentState.stats.questBridge, 'talk'), '102:start:1:talk');

    const cold = Bridge.coldTravel(intentState, {
        npcSelfId: 7284,
        locX: 5000,
        locY: 6000,
        locZ: -100
    }, startedAt);
    assert.strictEqual(cold.activity, 'traveling');
    assert.strictEqual(cold.stats.travel.reason, 'quest_bridge');
    assert.strictEqual(cold.stats.travel.questId, 102);
    assert.strictEqual(cold.stats.travel.arrivalActivity, 'questing');
    assert.strictEqual(cold.stats.travel.arrivalEvent, 'arrived_quest_target');
    assert.strictEqual(cold.stats.travel.method, 'soe_gatekeeper');
    assert.strictEqual(cold.stats.travel.arrivalAt, startedAt + Bridge.QUEST_TRAVEL_MS);
    assert.strictEqual(cold.timing.nextResolveAt, cold.stats.travel.arrivalAt);
    assert.strictEqual(cold.stats.questBridge.status, 'traveling');

    const originalMove = Navigation.move;
    const originalStartViaEscape = BotSpotTravel.startViaEscape;
    const originalTick = BotSpotTravel.tick;
    let moved = 0;
    let escaped = 0;
    let ticked = 0;
    try {
        Navigation.move = () => { moved += 1; return { status: 'moving' }; };
        BotSpotTravel.startViaEscape = () => { escaped += 1; return true; };
        BotSpotTravel.tick = () => { ticked += 1; return true; };

        const actor = {
            fetchId: () => 77,
            fetchLocX: () => 100,
            fetchLocY: () => 100,
            fetchLocZ: () => 0
        };
        const nearby = { fetchId: () => 1, fetchSelfId: () => 7284, fetchLocX: () => 150, fetchLocY: () => 150, fetchLocZ: () => 0 };
        assert.strictEqual(Bridge.hotTravel({ actor }, nearby).status, 'arrived');
        assert.strictEqual(moved, 0);
        assert.strictEqual(escaped, 0);

        const walking = { fetchId: () => 2, fetchSelfId: () => 7284, fetchLocX: () => 900, fetchLocY: () => 100, fetchLocZ: () => 0 };
        const walk = Bridge.hotTravel({ actor }, walking);
        assert.strictEqual(walk.status, 'traveling');
        assert.strictEqual(walk.method, 'walk');
        assert.strictEqual(moved, 1);

        const distant = { fetchId: () => 3, fetchSelfId: () => 7284, fetchLocX: () => 5000, fetchLocY: () => 100, fetchLocZ: () => 0 };
        const far = Bridge.hotTravel({ actor, questBridge: intentState.stats.questBridge }, distant);
        assert.strictEqual(far.status, 'traveling');
        assert.strictEqual(far.method, 'soe_gatekeeper');
        assert.strictEqual(escaped, 1);

        Bridge.hotTravel({ actor, spotRelocation: { active: true } }, distant);
        assert.strictEqual(ticked, 1, 'an existing hot relocation must be advanced instead of replaced');
    } finally {
        Navigation.move = originalMove;
        BotSpotTravel.startViaEscape = originalStartViaEscape;
        BotSpotTravel.tick = originalTick;
    }

    const originalTalk = QuestService.onTalk;
    const originalEvent = QuestService.onEvent;
    const originalSnapshot = BotLifeState.snapshot;
    const originalUpsert = BotLifeState.upsertState;
    let talks = 0;
    let events = 0;
    const persisted = [];
    try {
        QuestService.onTalk = async () => { talks += 1; return true; };
        QuestService.onEvent = async (session, event) => {
            events += 1;
            assert.strictEqual(event.questId, 102);
            assert.strictEqual(event.name, 'start');
            assert.strictEqual(session.activeNpcTalk.selfId, 7284);
            return true;
        };
        BotLifeState.snapshot = () => ({
            ...baseState,
            phase: 'hot',
            stats: { questBridge: null }
        });
        BotLifeState.upsertState = async (state, reason) => {
            persisted.push({ state, reason });
            return state;
        };

        const actor = { fetchId: () => 77 };
        const npc = { fetchId: () => 99001, fetchSelfId: () => 7284 };
        const session = { actor };
        const first = await Bridge.talkHot(session, npc, {
            questId: 102,
            step: 'start',
            attempt: 1,
            eventName: 'start'
        });
        assert.strictEqual(first.ok, true);
        assert.strictEqual(first.replayed, false);
        assert.strictEqual(talks, 1);
        assert.strictEqual(events, 1);
        assert.strictEqual(session.questBridge.lastCompletedActionKey, '102:start:1:event:start');
        assert(persisted.length >= 2, 'bridge intent and completion should be lifecycle-persisted when a snapshot exists');

        const second = await Bridge.talkHot(session, npc, { eventName: 'start' });
        assert.strictEqual(second.ok, true);
        assert.strictEqual(second.replayed, true);
        assert.strictEqual(talks, 1, 'replayed bridge actions must not call QuestService.onTalk again');
        assert.strictEqual(events, 1, 'replayed bridge actions must not call QuestService.onEvent again');

        const wrongNpc = { fetchId: () => 99002, fetchSelfId: () => 7000 };
        session.questBridge = Bridge.normalizeIntent({ questId: 102, step: 'handoff', targetNpcId: 7284 });
        const rejected = await Bridge.talkHot(session, wrongNpc);
        assert.strictEqual(rejected.ok, false);
        assert.strictEqual(rejected.reason, 'wrong_npc');
    } finally {
        QuestService.onTalk = originalTalk;
        QuestService.onEvent = originalEvent;
        BotLifeState.snapshot = originalSnapshot;
        BotLifeState.upsertState = originalUpsert;
    }

    assert.throws(() => Bridge.normalizeIntent({ questId: 0 }), /positive questId/);
    assert.strictEqual(Bridge.coldTravel(baseState, { locX: 1, locY: 2, locZ: 3 }), null,
        'cold travel must fail closed without an active bridge intent');

    console.log('Bot Quest Bridge foundation checks passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
