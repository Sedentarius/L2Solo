const assert = require('node:assert/strict');

require('../src/Global');

const Bridge = invoke('GameServer/Bot/Quest/BotQuestBridge');
const Runtime = invoke('GameServer/Bot/Quest/ColdQuestRuntime');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');

async function main() {
    const originalSnapshot = LifeState.snapshot;
    const originalUpsert = LifeState.upsertState;

    const initialIntent = Bridge.normalizeIntent({
        questId: 165,
        step: 'collect',
        attempt: 2,
        targetNpcId: 456,
        targetLoc: { locX: 100, locY: 200, locZ: -40 },
        reservation: { spotId: 'dark-elf-hunt', until: 9000 }
    }, 1000);
    const initialReceiptKey = Bridge.actionKey(initialIntent, 'kill:cold:42:r7:i0:npc456');
    const receipts = {
        version: 1,
        completed: [initialReceiptKey],
        pending: []
    };

    let lifecycle = {
        characterId: 42,
        phase: 'cold',
        activity: 'questing',
        updatedAt: 1000,
        stats: {
            questBridge: initialIntent,
            questBridgeReceipts: receipts
        }
    };

    try {
        LifeState.snapshot = (characterId) => Number(characterId) === 42 ? lifecycle : null;
        LifeState.upsertState = async (state) => {
            lifecycle = {
                ...state,
                updatedAt: Math.max(Number(state.updatedAt || 0), Number(lifecycle.updatedAt || 0) + 1)
            };
            return lifecycle;
        };

        // Cold -> hot: a freshly materialized BotSession does not carry an
        // in-memory quest field yet. The bridge must hydrate from the durable
        // lifecycle rather than trusting the older handoff object on session.
        const staleColdCopy = {
            ...lifecycle,
            updatedAt: 500,
            stats: {
                ...lifecycle.stats,
                questBridge: Bridge.normalizeIntent({
                    ...initialIntent,
                    step: 'start',
                    targetNpcId: 7348,
                    createdAt: initialIntent.createdAt
                }, 500)
            }
        };
        const hotSession = {
            accountId: 'bot_handoff',
            actor: { fetchId: () => 42 },
            coldLifeState: staleColdCopy
        };
        const hydrated = Bridge.activeIntent(hotSession);
        assert.equal(hydrated.step, 'collect');
        assert.equal(hydrated.targetNpcId, 456);
        assert.deepEqual(hydrated.reservation, initialIntent.reservation);
        assert.equal(hotSession.coldLifeState, lifecycle,
            'hydrating a hot session should refresh its handoff snapshot from authoritative lifecycle state');

        // Hot -> cold: changing a quest step while visible must update both the
        // durable lifecycle and the preserved cold handoff copy. Otherwise the
        // next cooldown could resurrect the old collect target.
        const deliverIntent = {
            ...hydrated,
            step: 'deliver',
            status: 'active',
            targetNpcId: 7348,
            targetLoc: { locX: 120, locY: 220, locZ: -40 },
            reservation: { npcId: 7348, reason: 'quest_handin' }
        };
        await Bridge.persistSessionIntent(hotSession, deliverIntent, 'quest_bridge_handoff_test');
        assert.equal(lifecycle.stats.questBridge.step, 'deliver');
        assert.equal(lifecycle.stats.questBridge.targetNpcId, 7348);
        assert.deepEqual(lifecycle.stats.questBridge.reservation, deliverIntent.reservation);
        assert.deepEqual(lifecycle.stats.questBridgeReceipts, receipts,
            'changing hot intent must not discard cold kill receipts');
        assert.equal(hotSession.coldLifeState, lifecycle,
            'successful hot intent persistence must refresh the state Cooldown will merge');

        // A second hot materialization with no in-memory bridge must recover
        // the latest step from lifecycle even if it is handed a stale object.
        const rematerialized = {
            accountId: 'bot_handoff',
            actor: { fetchId: () => 42 },
            coldLifeState: staleColdCopy
        };
        assert.equal(Bridge.activeIntent(rematerialized).step, 'deliver');
        assert.equal(rematerialized.coldLifeState, lifecycle);

        // Receipts survive the handoff and remain authoritative. Replaying the
        // same committed cold kill after a hot/cold cycle must not invoke the
        // quest callback or duplicate a quest item.
        const replayKillKey = 'handoff-replay';
        const replayActionKey = Bridge.actionKey(lifecycle.stats.questBridge, `kill:${replayKillKey}`);
        lifecycle = {
            ...lifecycle,
            stats: {
                ...lifecycle.stats,
                questBridgeReceipts: {
                    version: 1,
                    completed: [...lifecycle.stats.questBridgeReceipts.completed, replayActionKey],
                    pending: []
                }
            }
        };
        const replay = await Runtime.resolveColdKill(lifecycle, 456, replayKillKey);
        assert.equal(replay.ok, true);
        assert.equal(replay.replayed, true);
        assert.equal(replay.actionKey, replayActionKey);

        // Completion/clear is also an explicit handoff value. A later hot
        // session must see null from lifecycle instead of resurrecting a stale
        // pre-completion quest intent.
        const completingSession = {
            accountId: 'bot_handoff',
            actor: { fetchId: () => 42 },
            coldLifeState: lifecycle
        };
        assert.equal(Bridge.activeIntent(completingSession).step, 'deliver');
        await Bridge.persistSessionIntent(completingSession, null, 'quest_bridge_handoff_complete');
        assert.equal(lifecycle.stats.questBridge, null);
        assert(lifecycle.stats.questBridgeReceipts.completed.includes(replayActionKey));
        assert.equal(completingSession.questBridge, null);
        assert.equal(completingSession.coldLifeState, lifecycle);

        const afterRestart = {
            accountId: 'bot_handoff',
            actor: { fetchId: () => 42 },
            coldLifeState: staleColdCopy
        };
        assert.equal(Bridge.activeIntent(afterRestart), null,
            'authoritative cleared lifecycle state must beat a stale pre-completion handoff copy');
        assert.equal(afterRestart.coldLifeState, lifecycle);

        console.log('Bot Quest Bridge B4 hot/cold handoff checks passed');
    } finally {
        LifeState.snapshot = originalSnapshot;
        LifeState.upsertState = originalUpsert;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
