const BotLifeState = invoke('GameServer/Bot/Population/BotLifeState');
const QuestService = invoke('GameServer/Quest/QuestService');
const BotSpotTravel = invoke('GameServer/Bot/AI/BotSpotTravel');
const CompanionNavigationRecovery = invoke('GameServer/Bot/AI/CompanionNavigationRecovery');

const QUEST_TRAVEL_MS = 25 * 1000;
const HOT_INTERACTION_RADIUS = 180;
const HOT_WALK_THRESHOLD = 1500;
const SCHEMA_VERSION = 1;

function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function pointOf(target) {
    if (!target) return null;
    const loc = {
        locX: numberOrNull(target.fetchLocX?.() ?? target.locX),
        locY: numberOrNull(target.fetchLocY?.() ?? target.locY),
        locZ: numberOrNull(target.fetchLocZ?.() ?? target.locZ)
    };
    return Object.values(loc).every(Number.isFinite) ? loc : null;
}

function npcIdOf(target) {
    return numberOrNull(target?.fetchSelfId?.() ?? target?.npcSelfId ?? target?.selfId);
}

function actorIdOf(target) {
    return numberOrNull(target?.fetchId?.() ?? target?.actorId ?? target?.objectId);
}

function characterIdOf(session) {
    return numberOrNull(session?.actor?.fetchId?.() ?? session?.characterId);
}

function normalizeIntent(input = {}, timestamp = Date.now()) {
    const questId = Number(input.questId);
    if (!Number.isSafeInteger(questId) || questId <= 0) throw new Error('quest bridge requires a positive questId');
    const attempt = Math.max(1, Math.floor(Number(input.attempt) || 1));
    const targetLoc = pointOf(input.targetLoc || input.target);
    return {
        version: SCHEMA_VERSION,
        questId,
        step: String(input.step || 'start'),
        attempt,
        status: String(input.status || 'active'),
        targetNpcId: numberOrNull(input.targetNpcId ?? npcIdOf(input.target)),
        targetLoc,
        eventName: input.eventName === null || input.eventName === undefined ? null : String(input.eventName),
        reservation: input.reservation || null,
        lastCompletedActionKey: input.lastCompletedActionKey || null,
        createdAt: Number(input.createdAt) || timestamp,
        updatedAt: timestamp
    };
}

function intentFrom(value) {
    if (!value) return null;
    return value.questBridge
        || value.stats?.questBridge
        || value.session?.questBridge
        || null;
}

function actionKey(intent, action = 'step') {
    if (!intent?.questId) return null;
    return `${Number(intent.questId)}:${String(intent.step || 'start')}:${Math.max(1, Number(intent.attempt) || 1)}:${String(action)}`;
}

function withIntent(state, intent, timestamp = Date.now()) {
    if (!state) return null;
    const normalized = intent ? normalizeIntent({ ...intent, createdAt: intent.createdAt }, timestamp) : null;
    return {
        ...state,
        stats: {
            ...(state.stats || {}),
            questBridge: normalized
        },
        updatedAt: timestamp
    };
}

function persistState(state, reason = 'quest_bridge_state') {
    if (!state?.characterId) return Promise.resolve(null);
    return BotLifeState.upsertState(state, reason);
}

function hydrateSessionIntent(session) {
    if (!session) return null;
    // Once a hot session has an explicit value, including null after a
    // completed quest, it is the current in-memory handoff value. Do not let a
    // concurrent read of an older lifecycle snapshot resurrect an old step.
    if (Object.prototype.hasOwnProperty.call(session, 'questBridge')) return session.questBridge;

    const characterId = characterIdOf(session);
    const lifecycle = characterId ? BotLifeState.snapshot(characterId) : null;
    const source = lifecycle || session.coldLifeState || null;
    const intent = intentFrom(source);
    session.questBridge = intent || null;
    if (lifecycle && session.coldLifeState) session.coldLifeState = lifecycle;
    return session.questBridge;
}

async function persistSessionIntent(session, intent, reason = 'quest_bridge_state') {
    const timestamp = Date.now();
    const normalized = intent ? normalizeIntent({ ...intent, createdAt: intent.createdAt }, timestamp) : null;
    session.questBridge = normalized;
    const characterId = characterIdOf(session);
    if (!characterId) return normalized;
    const lifecycle = BotLifeState.snapshot(characterId);
    if (!lifecycle) return normalized;
    const saved = await persistState(withIntent(lifecycle, normalized, timestamp), reason);
    // HotActivation keeps the pre-activation cold state on the session so
    // Cooldown can merge live actor data back into it. Keep that handoff copy
    // synchronized whenever the quest intent changes, otherwise cooling could
    // restore an older quest step/target after a successful hot interaction.
    if (saved && session.coldLifeState) session.coldLifeState = saved;
    return normalized;
}

function begin(state, specification, timestamp = Date.now()) {
    return withIntent(state, normalizeIntent(specification, timestamp), timestamp);
}

function coldTravel(state, target, timestamp = Date.now(), options = {}) {
    const intent = intentFrom(state);
    const destination = pointOf(target) || pointOf(intent?.targetLoc);
    if (!state?.characterId || !intent || !destination) return null;
    if (state.activity === 'traveling') return state;
    const from = pointOf(state.loc) || { locX: 0, locY: 0, locZ: 0 };
    const npcId = npcIdOf(target) ?? intent.targetNpcId;
    const arrivalAt = timestamp + Math.max(1000, Number(options.travelMs) || QUEST_TRAVEL_MS);
    const questBridge = normalizeIntent({
        ...intent,
        targetNpcId: npcId,
        targetLoc: destination,
        status: 'traveling',
        createdAt: intent.createdAt
    }, timestamp);
    return {
        ...state,
        activity: 'traveling',
        stats: {
            ...(state.stats || {}),
            questBridge,
            travel: {
                reason: 'quest_bridge',
                questId: questBridge.questId,
                questStep: questBridge.step,
                from,
                to: destination,
                method: 'soe_gatekeeper',
                arrivalActivity: 'questing',
                arrivalEvent: 'arrived_quest_target',
                startedAt: timestamp,
                arrivalAt
            }
        },
        timing: {
            ...(state.timing || {}),
            activityStartedAt: timestamp,
            nextResolveAt: arrivalAt
        }
    };
}

function distance2d(actor, target) {
    const from = pointOf(actor);
    const to = pointOf(target);
    if (!from || !to) return Infinity;
    return Math.hypot(from.locX - to.locX, from.locY - to.locY);
}

function hotTravel(session, target, options = {}) {
    const actor = session?.actor;
    const destination = pointOf(target);
    if (!actor || !destination) return { status: 'blocked', reason: 'missing_target' };
    const interactionRadius = Math.max(32, Number(options.interactionRadius) || HOT_INTERACTION_RADIUS);
    const distance = distance2d(actor, target);
    if (distance <= interactionRadius) return { status: 'arrived', distance };

    if (session.spotRelocation) {
        BotSpotTravel.tick(session, actor);
        return { status: 'traveling', method: 'existing_relocation', distance };
    }

    if (distance <= Math.max(interactionRadius, Number(options.walkThreshold) || HOT_WALK_THRESHOLD)) {
        const navigation = CompanionNavigationRecovery.move(
            session,
            actor,
            destination,
            options.reason || 'quest_bridge_target',
            { targetActor: target?.fetchId ? target : null, arrivalRadius: interactionRadius }
        );
        return { status: navigation?.status === 'exhausted' ? 'blocked' : 'traveling', method: 'walk', distance, navigation };
    }

    const pseudoSpot = {
        id: `quest-${intentFrom(session)?.questId || 'target'}-${npcIdOf(target) || 'npc'}`,
        name: options.name || 'quest destination',
        center: destination
    };
    const started = BotSpotTravel.startViaEscape(session, actor, pseudoSpot, destination);
    return { status: started ? 'traveling' : 'blocked', method: 'soe_gatekeeper', distance };
}

function activeIntent(session) {
    return hydrateSessionIntent(session);
}

async function talkHot(session, npc, options = {}) {
    if (!session?.actor || !npc) return { ok: false, reason: 'missing_session_or_npc' };
    let intent = activeIntent(session);
    if (!intent && options.questId) {
        intent = normalizeIntent({
            questId: options.questId,
            step: options.step,
            attempt: options.attempt,
            target: npc,
            eventName: options.eventName
        });
        await persistSessionIntent(session, intent, 'quest_bridge_begin_hot');
    }
    if (!intent) return { ok: false, reason: 'missing_intent' };

    const npcId = npcIdOf(npc);
    if (intent.targetNpcId && npcId && Number(intent.targetNpcId) !== Number(npcId)) {
        return { ok: false, reason: 'wrong_npc' };
    }
    const eventName = options.eventName === undefined ? intent.eventName : options.eventName;
    const key = actionKey(intent, eventName ? `event:${eventName}` : 'talk');
    if (intent.lastCompletedActionKey === key) return { ok: true, replayed: true, actionKey: key };

    session.activeNpcTalk = {
        objectId: actorIdOf(npc),
        selfId: npcId
    };

    let handled = true;
    if (options.skipTalk !== true) handled = await QuestService.onTalk(session, npc);
    let eventHandled = null;
    if (eventName) {
        eventHandled = await QuestService.onEvent(session, {
            questId: intent.questId,
            name: String(eventName)
        });
    }
    const success = eventName ? eventHandled !== false : handled !== false;
    if (!success) return { ok: false, reason: eventName ? 'event_rejected' : 'talk_rejected', actionKey: key };

    const completed = normalizeIntent({
        ...intent,
        status: 'active',
        lastCompletedActionKey: key,
        createdAt: intent.createdAt
    });
    await persistSessionIntent(session, completed, 'quest_bridge_action_complete');
    return { ok: true, replayed: false, actionKey: key, handled, eventHandled };
}

async function clear(sessionOrState, reason = 'quest_bridge_complete') {
    if (sessionOrState?.actor) {
        await persistSessionIntent(sessionOrState, null, reason);
        return true;
    }
    if (!sessionOrState?.characterId) return false;
    await persistState(withIntent(sessionOrState, null), reason);
    return true;
}

module.exports = {
    HOT_INTERACTION_RADIUS,
    HOT_WALK_THRESHOLD,
    QUEST_TRAVEL_MS,
    SCHEMA_VERSION,
    actionKey,
    activeIntent,
    begin,
    clear,
    coldTravel,
    hotTravel,
    hydrateSessionIntent,
    intentFrom,
    normalizeIntent,
    persistSessionIntent,
    persistState,
    pointOf,
    talkHot,
    withIntent
};
