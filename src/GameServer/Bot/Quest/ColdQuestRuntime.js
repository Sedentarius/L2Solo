const Database = invoke('Database');
const Backpack = invoke('GameServer/Actor/Backpack');
const QuestService = invoke('GameServer/Quest/QuestService');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const InventorySummary = invoke('GameServer/Bot/Population/InventorySummary');
const Bridge = require('./BotQuestBridge');
const KillPlanner = require('./BotQuestKillPlanner');

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
        `SELECT id, name, race, classId, level, exp, sp, locX, locY, locZ
         FROM characters WHERE id = ? LIMIT 1`,
        [Number(characterId)]
    ]);
    return rows?.[0] || null;
}

async function coldSessionFor(state) {
    const characterId = Number(state?.characterId || 0);
    if (!characterId) throw new Error('cold quest session requires characterId');
    const row = await characterRow(characterId);
    if (!row) throw new Error(`missing character ${characterId} for cold quest callback`);
    const items = await Database.fetchItems(characterId);
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
        backpack: new Backpack({ items, paperdoll: {} })
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

function killActionKey(intent, killKey) {
    return Bridge.actionKey(intent, `kill:${String(killKey)}`);
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
    coldSessionFor,
    commitRevision,
    hasReceipt,
    killActionKey,
    normalizedReceipts,
    processCommittedKills,
    resolveColdKill,
    withClaim,
    withCompletion
};
