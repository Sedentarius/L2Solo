const Database = invoke('Database');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const GoalService = invoke('GameServer/Bot/Goals/GoalService');
const SpotService = invoke('GameServer/Bot/AI/SpotService');
const Bridge = require('./BotQuestBridge');
const ColdQuestRuntime = require('./ColdQuestRuntime');
const Catalog = require('./AutonomousQuestCatalog');

const ARRIVAL_RADIUS = 500;

function distance2d(left, right) {
    if (!left || !right) return Infinity;
    const dx = Number(left.locX) - Number(right.locX);
    const dy = Number(left.locY) - Number(right.locY);
    if (![dx, dy].every(Number.isFinite)) return Infinity;
    return Math.hypot(dx, dy);
}

function atTarget(state, target, radius = ARRIVAL_RADIUS) {
    return distance2d(state?.loc, target) <= Math.max(32, Number(radius) || ARRIVAL_RADIUS);
}

function questGoal(state) {
    const goal = GoalService.snapshot(state?.characterId)?.current;
    return goal?.status === 'active' && goal.type === 'complete_quest' ? goal : null;
}

async function questRow(characterId, questId) {
    const rows = await Database.fetchCharacterQuests(Number(characterId));
    return rows.find((row) => Number(row.questId) === Number(questId)) || null;
}

function isStartedRow(row) {
    return String(row?.state || '') === 'started';
}

function isCompletedRow(row) {
    return String(row?.state || '') === 'completed';
}

function intentFor(spec, step, targetNpcId, targetLoc, timestamp, extras = {}) {
    return Bridge.normalizeIntent({
        questId: spec.questId,
        step,
        attempt: Math.max(1, Number(extras.attempt) || 1),
        status: 'active',
        targetNpcId,
        targetLoc,
        eventName: extras.eventName ?? null,
        reservation: extras.reservation || null,
        createdAt: extras.createdAt || timestamp
    }, timestamp);
}

function questTravel(state, intent, targetLoc, timestamp, options = {}) {
    const target = {
        ...targetLoc,
        npcSelfId: Number(options.targetNpcId || intent.targetNpcId || 0) || undefined
    };
    const base = Bridge.withIntent(state, intent, timestamp);
    const travelling = Bridge.coldTravel(base, target, timestamp, { travelMs: options.travelMs });
    if (!travelling) return base;
    return {
        ...travelling,
        stats: {
            ...(travelling.stats || {}),
            questBridge: Bridge.normalizeIntent({
                ...intent,
                status: 'traveling',
                targetLoc,
                createdAt: intent.createdAt
            }, timestamp),
            travel: {
                ...(travelling.stats?.travel || {}),
                reason: 'quest_bridge',
                questId: Number(intent.questId),
                questStep: String(intent.step),
                regionName: options.regionName || travelling.stats?.travel?.regionName || state.currentRegion || 'Quest',
                spotId: options.spotId || travelling.stats?.travel?.spotId || null,
                arrivalActivity: 'hunting',
                arrivalEvent: 'arrived_quest_target'
            }
        }
    };
}

async function save(state, reason) {
    return LifeState.upsertState(state, reason).then((saved) => saved || state);
}

async function markComplete(state, spec, timestamp) {
    const next = {
        ...state,
        activity: state.activity === 'traveling' ? 'hunting' : state.activity,
        stats: {
            ...(state.stats || {}),
            questBridge: null,
            travel: state.stats?.travel?.reason === 'quest_bridge' ? null : state.stats?.travel,
            questAutomation: {
                ...(state.stats?.questAutomation || {}),
                completed: {
                    ...(state.stats?.questAutomation?.completed || {}),
                    [String(spec.questId)]: timestamp
                }
            }
        },
        timing: {
            ...(state.timing || {}),
            nextResolveAt: Math.min(Number(state.timing?.nextResolveAt || timestamp + 1000), timestamp + 1000)
        },
        updatedAt: timestamp
    };
    const saved = await save(next, 'quest_bridge_autonomous_complete');
    await GoalService.complete(state.characterId).catch(() => null);
    return saved;
}

function collectDestination(state, spec) {
    const spot = Catalog.killSpot(spec, state);
    if (!spot) return null;
    const loc = SpotService.arrivalPointForState(state, spot) || spot.center || null;
    const targetNpcId = Catalog.killTargetForSpot(spec, spot);
    return loc && targetNpcId ? { spot, loc, targetNpcId } : null;
}

async function beginFromGoal(state, goal, timestamp) {
    const spec = Catalog.specFor(goal?.target?.questId || goal?.plan?.questId);
    if (!spec) return state;
    const row = await questRow(state.characterId, spec.questId);
    if (isCompletedRow(row)) return markComplete(state, spec, timestamp);
    if (isStartedRow(row)) {
        const collect = collectDestination(state, spec);
        if (!collect) return state;
        const intent = intentFor(spec, 'collect', collect.targetNpcId, collect.loc, timestamp);
        if (String(state.spotId || '') === String(collect.spot.id) && atTarget(state, collect.loc, 2500)) {
            return save({ ...Bridge.withIntent(state, intent, timestamp), activity: 'hunting' }, 'quest_bridge_resume_collect');
        }
        return save(questTravel(state, intent, collect.loc, timestamp, {
            targetNpcId: collect.targetNpcId,
            spotId: collect.spot.id,
            regionName: collect.spot.name
        }), 'quest_bridge_begin_collect_travel');
    }
    const loc = Catalog.npcLocation(spec.startNpcId);
    if (!loc) return state;
    const intent = intentFor(spec, 'start', spec.startNpcId, loc, timestamp, { eventName: spec.startEvent });
    if (atTarget(state, loc)) return save(Bridge.withIntent(state, intent, timestamp), 'quest_bridge_begin_start');
    return save(questTravel(state, intent, loc, timestamp, { targetNpcId: spec.startNpcId }), 'quest_bridge_begin_start_travel');
}

async function advanceStart(state, spec, intent, timestamp) {
    const row = await questRow(state.characterId, spec.questId);
    if (isCompletedRow(row)) return markComplete(state, spec, timestamp);
    if (isStartedRow(row)) return advanceCollect(state, spec, intent, timestamp);
    const loc = intent.targetLoc || Catalog.npcLocation(spec.startNpcId);
    if (!loc) return state;
    if (state.activity === 'traveling') return state;
    if (!atTarget(state, loc)) {
        return save(questTravel(state, intent, loc, timestamp, { targetNpcId: spec.startNpcId }), 'quest_bridge_start_travel');
    }
    const talk = await ColdQuestRuntime.resolveColdTalk(state, spec.startNpcId, `auto-start:${intent.attempt}`, {
        eventName: spec.startEvent,
        timestamp
    });
    const after = talk.state || state;
    const persisted = await questRow(state.characterId, spec.questId);
    if (!isStartedRow(persisted)) return after;
    return advanceCollect(after, spec, Bridge.intentFrom(after) || intent, timestamp);
}

async function advanceCollect(state, spec, intent, timestamp) {
    if (Catalog.collectComplete(state, spec)) {
        const loc = Catalog.npcLocation(spec.returnNpcId);
        if (!loc) return state;
        const returning = intentFor(spec, 'return', spec.returnNpcId, loc, timestamp, {
            attempt: intent?.attempt,
            createdAt: intent?.createdAt
        });
        if (atTarget(state, loc)) return save(Bridge.withIntent(state, returning, timestamp), 'quest_bridge_return_ready');
        return save(questTravel(state, returning, loc, timestamp, { targetNpcId: spec.returnNpcId }), 'quest_bridge_return_travel');
    }
    const collect = collectDestination(state, spec);
    if (!collect) return state;
    const collecting = intentFor(spec, 'collect', collect.targetNpcId, collect.loc, timestamp, {
        attempt: intent?.attempt,
        createdAt: intent?.createdAt,
        reservation: { spotId: collect.spot.id, npcSelfId: collect.targetNpcId }
    });
    if (state.activity === 'traveling') return state;
    if (String(state.spotId || '') !== String(collect.spot.id) || !atTarget(state, collect.loc, 2500)) {
        return save(questTravel(state, collecting, collect.loc, timestamp, {
            targetNpcId: collect.targetNpcId,
            spotId: collect.spot.id,
            regionName: collect.spot.name
        }), 'quest_bridge_collect_travel');
    }
    const current = Bridge.intentFrom(state);
    if (current?.step === 'collect'
        && Number(current.targetNpcId) === Number(collect.targetNpcId)
        && current.reservation?.spotId === collect.spot.id
        && state.activity === 'hunting') return state;
    return save({ ...Bridge.withIntent(state, collecting, timestamp), activity: 'hunting' }, 'quest_bridge_collect_ready');
}

async function advanceReturn(state, spec, intent, timestamp) {
    const row = await questRow(state.characterId, spec.questId);
    if (isCompletedRow(row)) return markComplete(state, spec, timestamp);
    const loc = intent.targetLoc || Catalog.npcLocation(spec.returnNpcId);
    if (!loc) return state;
    if (state.activity === 'traveling') return state;
    if (!atTarget(state, loc)) {
        return save(questTravel(state, intent, loc, timestamp, { targetNpcId: spec.returnNpcId }), 'quest_bridge_return_travel');
    }
    const talk = await ColdQuestRuntime.resolveColdTalk(state, spec.returnNpcId, `auto-return:${intent.attempt}`, { timestamp });
    const after = talk.state || state;
    const persisted = await questRow(state.characterId, spec.questId);
    // Repeatable quests return to CREATED. A successful server hand-in still
    // completes this autonomous goal; admission deliberately runs it once.
    return isCompletedRow(persisted) || talk.finished ? markComplete(after, spec, timestamp) : after;
}

async function advance(state, options = {}) {
    if (!state?.characterId || state.phase !== 'cold') return state;
    if (state.party?.partyId || state.partyId || Number(state.stats?.karma || 0) > 0) return state;
    const timestamp = Number(options.timestamp) || Date.now();
    let intent = Bridge.intentFrom(state);
    if (!intent) {
        const goal = questGoal(state);
        return goal ? beginFromGoal(state, goal, timestamp) : state;
    }
    const spec = Catalog.specFor(intent.questId);
    if (!spec) return state;
    if (intent.step === 'start') return advanceStart(state, spec, intent, timestamp);
    if (intent.step === 'collect') return advanceCollect(state, spec, intent, timestamp);
    if (intent.step === 'return' || intent.step === 'deliver' || intent.step === 'complete') {
        return advanceReturn(state, spec, intent, timestamp);
    }
    return state;
}

function targetNpcId(state, context = {}) {
    const intent = Bridge.intentFrom(state);
    if (!intent || intent.step !== 'collect') return Number(context.targetNpcId || 0);
    const spec = Catalog.specFor(intent.questId);
    const questTarget = Catalog.killTargetForSpot(spec, context.spot);
    return questTarget || Number(intent.targetNpcId || 0) || Number(context.targetNpcId || 0);
}

module.exports = {
    ARRIVAL_RADIUS,
    advance,
    atTarget,
    beginFromGoal,
    collectDestination,
    distance2d,
    markComplete,
    questGoal,
    questRow,
    questTravel,
    targetNpcId
};
