const Database = invoke('Database');
const Backpack = invoke('GameServer/Actor/Backpack');
const QuestService = invoke('GameServer/Quest/QuestService');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const InventorySummary = invoke('GameServer/Bot/Population/InventorySummary');
const Shared = invoke('GameServer/Network/Shared');
const BotSession = invoke('GameServer/Bot/BotSession');
const CharacterWriteQueue = invoke('GameServer/Persistence/CharacterWriteQueue');
const Bridge = require('./BotQuestBridge');
const KillPlanner = require('./BotQuestKillPlanner');
const TalkPlanner = require('./BotQuestTalkPlanner');

const RECEIPT_VERSION = 1;
const MAX_RECEIPTS = 96;

function normalizedReceipts(stats = {}) {
    const source = stats.questBridgeReceipts || {};
    const completed = [...new Set((source.completed || []).map(String).filter(Boolean))].slice(-MAX_RECEIPTS);
    const pending = (source.pending || [])
        .filter((entry) => entry?.key)
        .map((entry) => ({
            key: String(entry.key),
            questId: Number(entry.questId || 0),
            npcSelfId: Number(entry.npcSelfId || 0),
            claimedAt: Number(entry.claimedAt || 0)
        }))
        .filter((entry, index, rows) => rows.findIndex((candidate) => candidate.key === entry.key) === index)
        .slice(-MAX_RECEIPTS);
    return { version: RECEIPT_VERSION, completed, pending };
}

function hasReceipt(receipts, key) {
    return receipts.completed.includes(key) || receipts.pending.some((entry) => entry.key === key);
}

function withClaim(state, key, intent, npcSelfId, timestamp = Date.now()) {
    const receipts = normalizedReceipts(state?.stats || {});
    if (hasReceipt(receipts, key)) return { state, replayed: true };
    const pending = [...receipts.pending, {
        key,
        questId: Number(intent.questId),
        npcSelfId: Number(npcSelfId),
        claimedAt: timestamp
    }].slice(-MAX_RECEIPTS);
    return {
        replayed: false,
        state: {
            ...state,
            stats: {
                ...(state.stats || {}),
                questBridgeReceipts: { ...receipts, pending }
            },
            updatedAt: timestamp
        }
    };
}

function withCompletion(state, key, timestamp = Date.now()) {
    const receipts = normalizedReceipts(state?.stats || {});
    return {
        ...state,
        stats: {
            ...(state.stats || {}),
            questBridgeReceipts: {
                version: RECEIPT_VERSION,
                pending: receipts.pending.filter((entry) => entry.key !== key),
                completed: [...receipts.completed.filter((entry) => entry !== key), key].slice(-MAX_RECEIPTS)
            }
        },
        updatedAt: timestamp
    };
}

function adenaFromInventory(inventory = {}, fallback = 0) {
    return Number(inventory['57']?.amount ?? inventory[57]?.amount ?? fallback ?? 0) || 0;
}

async function characterRow(characterId) {
    const rows = await Database.execute([
        `SELECT id, username, name, race, classId, level, exp, sp, locX, locY, locZ
         FROM characters WHERE id = ? LIMIT 1`,
        [Number(characterId)]
    ]);
    return rows?.[0] || null;
}

// Kill callbacks are frequent in cold simulation. Keep this adapter deliberately
// light: QuestService receives the real Backpack and durable quest state without
// materializing a full hot Actor for every defeated NPC.
async function coldSessionFor(state) {
    const characterId = Number(state?.characterId || 0);
    if (!characterId) throw new Error('cold quest session requires characterId');
    const row = await characterRow(characterId);
    if (!row) throw new Error(`missing character ${characterId} for cold quest callback`);
    const items = await Database.fetchItems(characterId);
    // Equipment-dependent quest kills obey the same persisted paperdoll as
    // materialization. Prefer the newest equipped instance in each slot.
    const paperdoll = utils.tupleAlloc(16, {});
    for (const item of [...items].sort((a,b) => Number(a.id)-Number(b.id))) {
        if (Number(item.equipped) !== 1 || item.slot < 0 || item.slot > 15) continue;
        paperdoll[item.slot] = { id:item.id, selfId:item.selfId };
        if (item.slot === 15) paperdoll[10] = paperdoll[15];
    }
    if (paperdoll[14].id) paperdoll[8] = {};
    const actor = {
        exp: Number(row.exp || 0),
        sp: Number(row.sp || 0),
        fetchId: () => characterId,
        fetchName: () => row.name || state.name || `Bot ${characterId}`,
        fetchRace: () => Number(row.race || 0),
        fetchClassId: () => Number(row.classId || 0),
        fetchLevel: () => Number(row.level || state.level || 1),
        // Clan alliance quests have their own runtime. Ordinary Quest Bridge
        // callbacks must not accidentally advance that separate state machine.
        fetchClanId: () => 0,
        fetchLocX: () => Number(state.loc?.locX ?? row.locX ?? 0),
        fetchLocY: () => Number(state.loc?.locY ?? row.locY ?? 0),
        fetchLocZ: () => Number(state.loc?.locZ ?? row.locZ ?? 0),
        fetchExp() { return this.exp; },
        fetchSp() { return this.sp; },
        setExpSp(exp, sp) { this.exp = Number(exp || 0); this.sp = Number(sp || 0); },
        backpack: new Backpack({ items, paperdoll })
    };
    const session = {
        coldQuestBridge: true,
        actor,
        packets: [],
        dataSendToMe(packet) { this.packets.push(packet); },
        dataSendToOthers() {},
        dataSendToMeAndOthers() {}
    };
    await QuestService.ensureLoaded(session);
    return session;
}

// Talking/hand-in is rare but may award EXP, level-ups, items or eventually a
// profession transfer. Materialize the normal BotSession/Actor contract here so
// QuestService and the existing reward code remain the sole gameplay authority.
async function coldFullSessionFor(state) {
    const characterId = Number(state?.characterId || 0);
    if (!characterId) throw new Error('cold quest full session requires characterId');
    const row = await characterRow(characterId);
    if (!row?.username) throw new Error(`missing character ${characterId} for cold quest hand-in`);
    const characters = await Shared.fetchCharacters(row.username);
    const character = characters.find((candidate) => Number(candidate.id) === characterId);
    if (!character) throw new Error(`missing materialized character ${characterId} for cold quest hand-in`);
    const classInfo = await Shared.fetchClassInformation(Number(character.classId));
    const session = new BotSession(row.username);
    session.populationStaging = true;
    session.coldQuestBridge = true;
    session.setActor({ ...character, ...utils.crushOb(classInfo) });
    await QuestService.ensureLoaded(session);
    return session;
}

async function reconcileColdSession(state, session, timestamp = Date.now()) {
    const characterId = Number(state?.characterId || session?.actor?.fetchId?.() || 0);
    if (!characterId || !session?.actor) return state;
    await CharacterWriteQueue.flushCharacter(characterId);
    const row = await characterRow(characterId);
    const inventory = InventorySummary.fromItems(session.actor.backpack.fetchItems());
    const actor = session.actor;
    const next = {
        ...state,
        classId: Number(actor.fetchClassId?.() ?? row?.classId ?? state.classId ?? 0),
        level: Number(actor.fetchLevel?.() ?? row?.level ?? state.level ?? 1),
        exp: Number(actor.fetchExp?.() ?? row?.exp ?? state.exp ?? 0),
        sp: Number(actor.fetchSp?.() ?? row?.sp ?? state.sp ?? 0),
        inventory,
        adena: adenaFromInventory(inventory, state.adena),
        updatedAt: timestamp
    };
    const hp = Number(actor.fetchHp?.());
    const maxHp = Number(actor.fetchMaxHp?.());
    const mp = Number(actor.fetchMp?.());
    const maxMp = Number(actor.fetchMaxMp?.());
    if ([hp, maxHp, mp, maxMp].every(Number.isFinite)) {
        next.vitals = { ...(state.vitals || {}), hp, maxHp, mp, maxMp };
    }
    return next;
}

function disposeFullSession(session) {
    if (!session?.actor) return;
    try { session.actor.destructor?.(); } catch (_) {}
    session.actor = null;
}

async function equipQuestItem(state, itemId) {
    const session=await coldFullSessionFor(state);
    try {
        const item=session.actor.backpack.fetchItemFromSelfId(itemId);
        if(!item) return {ok:false,state};
        if(!item.fetchEquipped()) session.actor.backpack.useItem(session,item.fetchId());
        const next=await reconcileColdSession(state,session);
        return {ok:!!item.fetchEquipped(),state:next};
    } finally {disposeFullSession(session);}
}

function killActionKey(intent, killKey) {
    return Bridge.actionKey(intent, `kill:${String(killKey)}`);
}

function talkActionKey(intent, talkKey) {
    return Bridge.actionKey(intent, `talk:${String(talkKey)}`);
}

async function resolveColdKill(state, npcSelfId, killKey, options = {}) {
    const characterId = Number(state?.characterId || 0);
    const latest = LifeState.snapshot(characterId) || state;
    const intent = Bridge.intentFrom(latest);
    if (!intent) return { ok: false, reason: 'missing_intent', state: latest };
    if (!KillPlanner.isKillTarget(intent, npcSelfId)) {
        return { ok: false, reason: 'not_quest_target', state: latest };
    }
    if (!killKey) return { ok: false, reason: 'missing_kill_key', state: latest };

    const key = killActionKey(intent, killKey);
    const claim = withClaim(latest, key, intent, npcSelfId, options.timestamp || Date.now());
    if (claim.replayed) return { ok: true, replayed: true, actionKey: key, state: latest };

    // Claim before the callback. If the process dies in the tiny window after
    // this durable write, that one kill is forfeited instead of being replayed
    // and cloning a quest item. A later real kill will continue progression.
    const claimed = await LifeState.upsertState(claim.state, 'quest_bridge_kill_claim');
    const claimedState = claimed || claim.state;

    let session;
    try {
        session = await coldSessionFor(claimedState);
        const npc = {
            fetchSelfId: () => Number(npcSelfId),
            fetchId: () => 0,
            questSpawn: options.questSpawn || null
        };
        await QuestService.onKill(session, npc);
    } catch (error) {
        utils.infoWarn('BotQuest', 'cold quest kill failed closed character=%s quest=%s npc=%s key=%s: %s',
            characterId, intent.questId, npcSelfId, key, error?.message || error);
        return { ok: false, claimed: true, failClosed: true, reason: error?.message || 'quest_callback_failed', actionKey: key, state: claimedState };
    }

    const inventory = InventorySummary.fromItems(session.actor.backpack.fetchItems());
    const authoritative = LifeState.snapshot(characterId) || claimedState;
    const completed = withCompletion({
        ...authoritative,
        inventory,
        adena: adenaFromInventory(inventory, authoritative.adena)
    }, key, options.timestamp || Date.now());
    const saved = await LifeState.upsertState(completed, 'quest_bridge_kill_complete');
    return {
        ok: true,
        replayed: false,
        actionKey: key,
        state: saved || completed,
        questId: Number(intent.questId),
        npcSelfId: Number(npcSelfId)
    };
}

async function resolveColdTalk(state, npcSelfId, talkKey, options = {}) {
    const characterId = Number(state?.characterId || 0);
    const latest = LifeState.snapshot(characterId) || state;
    const intent = Bridge.intentFrom(latest);
    if (!intent) return { ok: false, reason: 'missing_intent', state: latest };
    if (!TalkPlanner.isTalkTarget(intent, npcSelfId)) {
        return { ok: false, reason: 'not_quest_talk_target', state: latest };
    }
    if (!talkKey) return { ok: false, reason: 'missing_talk_key', state: latest };

    const key = talkActionKey(intent, talkKey);
    const claim = withClaim(latest, key, intent, npcSelfId, options.timestamp || Date.now());
    if (claim.replayed) return { ok: true, replayed: true, actionKey: key, state: latest };
    const claimed = await LifeState.upsertState(claim.state, 'quest_bridge_talk_claim');
    const claimedState = claimed || claim.state;

    let session = null;
    try {
        session = await coldFullSessionFor(claimedState);
        const questStateBefore = session.questStates?.get(Number(intent.questId));
        const wasStarted = questStateBefore?.isStarted?.() === true;
        const npc = {
            fetchSelfId: () => Number(npcSelfId),
            fetchId: () => Number(options.objectId || 0)
        };
        session.activeNpcTalk = { objectId: npc.fetchId(), selfId: npc.fetchSelfId() };
        const handled = await QuestService.onTalk(session, npc);
        if (handled === false) throw new Error('quest_talk_rejected');
        if (options.eventName) {
            const eventHandled = await QuestService.onEvent(session, {
                questId: Number(intent.questId),
                name: String(options.eventName)
            });
            if (eventHandled === false) throw new Error('quest_event_rejected');
        }
        const questStateAfter = session.questStates?.get(Number(intent.questId));
        const finished = wasStarted && questStateAfter?.isStarted?.() !== true;
        const authoritative = LifeState.snapshot(characterId) || claimedState;
        let completed = await reconcileColdSession(authoritative, session, options.timestamp || Date.now());
        completed = withCompletion(completed, key, options.timestamp || Date.now());
        if (finished) {
            completed = {
                ...completed,
                stats: { ...(completed.stats || {}), questBridge: null }
            };
        }
        const saved = await LifeState.upsertState(completed,
            finished ? 'quest_bridge_complete' : 'quest_bridge_talk_complete');
        return {
            ok: true,
            replayed: false,
            handled: true,
            finished,
            actionKey: key,
            questId: Number(intent.questId),
            npcSelfId: Number(npcSelfId),
            state: saved || completed
        };
    } catch (error) {
        utils.infoWarn('BotQuest', 'cold quest talk failed closed character=%s quest=%s npc=%s key=%s: %s',
            characterId, intent.questId, npcSelfId, key, error?.message || error);
        return {
            ok: false,
            claimed: true,
            failClosed: true,
            reason: error?.message || 'quest_talk_failed',
            actionKey: key,
            state: claimedState
        };
    } finally {
        disposeFullSession(session);
    }
}

function commitRevision(entry, state) {
    return Number(entry?.result?.revision
        ?? state?.simulation?.revision
        ?? entry?.nextState?.simulation?.revision
        ?? entry?.proposal?.token?.revision
        ?? 0);
}

async function processCommittedKills(entry, committedState = null) {
    const initial = committedState || LifeState.snapshot(entry?.nextState?.characterId) || entry?.nextState;
    if (!initial?.characterId || !Bridge.intentFrom(initial)) return { processed: 0, skipped: true, state: initial };
    const fought = (entry?.proposal?.result?.debug?.foughtNpcIds || [])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!fought.length) return { processed: 0, state: initial };

    const revision = commitRevision(entry, initial);
    let state = initial;
    let processed = 0;
    for (let index = 0; index < fought.length; index++) {
        const npcSelfId = fought[index];
        const intent = Bridge.intentFrom(state);
        if (!intent || !KillPlanner.isKillTarget(intent, npcSelfId)) continue;
        const killKey = `cold:${state.characterId}:r${revision}:i${index}:npc${npcSelfId}`;
        const result = await resolveColdKill(state, npcSelfId, killKey, {
            timestamp: Number(entry?.proposal?.enqueuedAt || Date.now())
        });
        if (result.state) state = result.state;
        if (result.ok && !result.replayed) processed += 1;
    }
    return { processed, state };
}

module.exports = {
    MAX_RECEIPTS,
    RECEIPT_VERSION,
    adenaFromInventory,
    characterRow,
    coldFullSessionFor,
    coldSessionFor,
    commitRevision,
    disposeFullSession,
    equipQuestItem,
    hasReceipt,
    killActionKey,
    normalizedReceipts,
    processCommittedKills,
    reconcileColdSession,
    resolveColdKill,
    resolveColdTalk,
    talkActionKey,
    withClaim,
    withCompletion
};
