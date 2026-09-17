const DataCache = invoke('GameServer/DataCache');
const SpotProfiles = invoke('GameServer/Bot/Population/SpotProfiles');

const DARK_ELF_CLASS_IDS = new Set(Array.from({ length: 13 }, (_, index) => 31 + index));
const QUEST_BUCKETS = 8;
const SPOT_GRID_SIZE = 6000;

const QUESTS = Object.freeze({
    165: Object.freeze({
        questId: 165,
        name: "Shilen's Hunt",
        race: 2,
        minLevel: 3,
        startNpcId: 7348,
        returnNpcId: 7348,
        startEvent: 'start',
        collectItemId: 1160,
        collectAmount: 13,
        preferredKillNpcIds: [456],
        priority: 50
    }),
    ...Object.fromEntries(require('../../Quest/LowLevelDefinitions').filter(d=>d.stages[0].type==='KILL_COLLECT').map(d => [d.id, Object.freeze({
        questId: d.id, name: d.name, race: d.race ?? null, minLevel: d.minLevel,
        startNpcId: d.startNpc, returnNpcId: d.startNpc, startEvent: 'start',
        collectItemId: d.stages[0].item, collectAmount: d.stages[0].count,
        preferredKillNpcIds: d.stages[0].drops.map(drop => drop.npc), priority: 45
    })]))
});

function classRace(state = {}) {
    const classId = Number(state.stats?.classId ?? state.classId ?? 0);
    if (DARK_ELF_CLASS_IDS.has(classId)) return 2;
    if (classId >= 0 && classId <= 17) return 0;
    if (classId >= 18 && classId <= 30) return 1;
    if (classId >= 44 && classId <= 52) return 3;
    if (classId >= 53 && classId <= 57) return 4;
    return null;
}

function completedAt(state = {}, questId) {
    return Number(state.stats?.questAutomation?.completed?.[String(questId)] || 0);
}

function admissionBucket(characterId) {
    return Math.abs(Number(characterId || 0)) % QUEST_BUCKETS;
}

function bucketFor(timestamp = Date.now()) {
    return Math.floor(Number(timestamp) / 60000) % QUEST_BUCKETS;
}

function eligible(state, spec, timestamp = Date.now(), options = {}) {
    if (!state?.characterId || !spec || state.phase === 'hot') return false;
    if (completedAt(state, spec.questId)) return false;
    if (Number(state.stats?.karma || 0) > 0) return false;
    if (state.party?.partyId || state.partyId) return false;
    if (!['hunting', 'resting', 'traveling'].includes(String(state.activity || ''))) return false;
    if (Number(state.level || 1) < Number(spec.minLevel || 1)) return false;
    if (spec.race !== null && spec.race !== undefined && classRace(state) !== Number(spec.race)) return false;
    if (Number(state.stats?.questBridge?.questId || 0) === Number(spec.questId)) return true;
    if (options.ignoreStagger === true) return true;
    return admissionBucket(state.characterId) === bucketFor(timestamp);
}

function candidateFor(state = {}, options = {}) {
    const timestamp = Number(options.timestamp || options.now) || Date.now();
    for (const spec of Object.values(QUESTS)) {
        if (!eligible(state, spec, timestamp, options)) continue;
        return {
            type: 'complete_quest',
            priority: Number(spec.priority || 50),
            target: { questId: spec.questId, questName: spec.name },
            plan: {
                kind: 'quest',
                questId: spec.questId,
                expectedBenefit: 'quest_reward_and_progression'
            },
            blockers: [],
            nextReviewAt: timestamp + 30 * 60 * 1000
        };
    }
    return null;
}

function specFor(questId) {
    return QUESTS[Number(questId)] || null;
}

function inventoryAmount(state = {}, selfId) {
    return Math.max(0, Number(state.inventory?.[String(selfId)]?.amount || 0));
}

function collectComplete(state = {}, spec) {
    return !!spec && inventoryAmount(state, spec.collectItemId) >= Number(spec.collectAmount || 0);
}

function coordinate(value) {
    if (!value || typeof value !== 'object') return null;
    const locX = Number(value.locX);
    const locY = Number(value.locY);
    const locZ = Number(value.locZ);
    if ([locX, locY, locZ].every(Number.isFinite)) return { locX, locY, locZ };
    return null;
}

function firstCoordinate(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    const own = coordinate(value);
    if (own) return own;
    for (const child of Object.values(value)) {
        if (!child || typeof child !== 'object') continue;
        const found = firstCoordinate(child, seen);
        if (found) return found;
    }
    return null;
}

function findNpcNode(value, npcSelfId, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    if (Number(value.selfId) === Number(npcSelfId)) {
        const loc = firstCoordinate(value);
        if (loc) return loc;
    }
    for (const child of Object.values(value)) {
        if (!child || typeof child !== 'object') continue;
        const found = findNpcNode(child, npcSelfId, seen);
        if (found) return found;
    }
    return null;
}

function boundsCenter(bounds = []) {
    const points = (Array.isArray(bounds) ? bounds : Object.values(bounds || {}))
        .map((bound) => {
            const locX = Number(bound?.locX);
            const locY = Number(bound?.locY);
            if (![locX, locY].every(Number.isFinite)) return null;
            const minZ = Number(bound?.minZ);
            const maxZ = Number(bound?.maxZ);
            let locZ = Number(bound?.locZ);
            if (!Number.isFinite(locZ) && Number.isFinite(minZ) && Number.isFinite(maxZ)) {
                locZ = (minZ + maxZ) / 2;
            } else if (!Number.isFinite(locZ) && Number.isFinite(minZ)) {
                locZ = minZ;
            } else if (!Number.isFinite(locZ) && Number.isFinite(maxZ)) {
                locZ = maxZ;
            }
            return { locX, locY, locZ: Number.isFinite(locZ) ? locZ : 0 };
        })
        .filter(Boolean);
    if (!points.length) return null;
    return {
        locX: Math.round(points.reduce((sum, point) => sum + point.locX, 0) / points.length),
        locY: Math.round(points.reduce((sum, point) => sum + point.locY, 0) / points.length),
        locZ: Math.round(points.reduce((sum, point) => sum + point.locZ, 0) / points.length)
    };
}

function spawnGroupLocation(npcSelfId) {
    const groups = Array.isArray(DataCache.npcSpawns)
        ? DataCache.npcSpawns
        : Object.values(DataCache.npcSpawns || {});
    for (const group of groups) {
        const spawns = Array.isArray(group?.spawns) ? group.spawns : Object.values(group?.spawns || {});
        const spawn = spawns.find((entry) => Number(entry?.selfId) === Number(npcSelfId));
        if (!spawn) continue;
        const direct = firstCoordinate(spawn.coords || spawn);
        if (direct) return direct;
        const center = boundsCenter(group?.bounds || []);
        if (center) return center;
    }
    return null;
}

function npcLocation(npcSelfId) {
    return findNpcNode(DataCache.npcSpawns || [], Number(npcSelfId))
        || spawnGroupLocation(Number(npcSelfId));
}

function questKillTargets(spec) {
    const quest = require('../../Quest/QuestRegistry').activeQuests()
        .find((entry) => Number(entry.id) === Number(spec?.questId));
    return (quest?.killNpcs || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
}

function preferredRank(spec, spot) {
    const entries = new Set((spot?.npcEntries || []).map((entry) => Number(entry.selfId)));
    const preferred = (spec?.preferredKillNpcIds || []).map(Number);
    const index = preferred.findIndex((id) => entries.has(id));
    return index >= 0 ? index : preferred.length + 1;
}

function authoredHuntingSpot(spec) {
    if (!spec) return null;
    const targets = questKillTargets(spec);
    const ordered = [...new Set([
        ...(spec.preferredKillNpcIds || []).map(Number),
        ...targets
    ].filter((id) => Number.isSafeInteger(id) && id > 0))];
    for (const npcSelfId of ordered) {
        const center = npcLocation(npcSelfId);
        if (!center) continue;
        const template = (DataCache.npcs || []).find((npc) => Number(npc.selfId) === npcSelfId) || {};
        const level = Math.max(1, Number(template.template?.level || template.level || 1));
        const name = template.template?.name || template.name || `NPC ${npcSelfId}`;
        const gridX = Math.floor(center.locX / SPOT_GRID_SIZE);
        const gridY = Math.floor(center.locY / SPOT_GRID_SIZE);
        return {
            id: `${gridX}_${gridY}`,
            name: `${name} quest hunting ground`,
            center: { ...center },
            minLevel: level,
            maxLevel: level,
            avgLevel: level,
            density: 1,
            npcNames: [name],
            npcSelfIds: [npcSelfId],
            npcEntries: [{ selfId: npcSelfId, name, level, count: 1 }],
            arrivalPoints: [{ ...center }],
            levelCounts: { [String(level)]: 1 },
            dominantLevels: [{ level, count: 1 }],
            tags: [],
            tagsAuthoritative: false,
            route: null,
            authoredQuestFallback: true
        };
    }
    return null;
}

function killSpot(spec, state = {}) {
    if (!spec) return null;
    const targets = new Set(questKillTargets(spec));
    if (!targets.size) return null;
    const profiles = SpotProfiles.ensure() || [];
    const matching = profiles.filter((spot) => (spot.npcEntries || []).some((entry) => targets.has(Number(entry.selfId))));
    if (!matching.length) return authoredHuntingSpot(spec);
    matching.sort((left, right) => {
        const preferred = preferredRank(spec, left) - preferredRank(spec, right);
        if (preferred) return preferred;
        const leftLevel = Math.abs(Number(left.avgLevel || left.minLevel || state.level || 1) - Number(state.level || 1));
        const rightLevel = Math.abs(Number(right.avgLevel || right.minLevel || state.level || 1) - Number(state.level || 1));
        return leftLevel - rightLevel || String(left.id).localeCompare(String(right.id));
    });
    return matching[0];
}

function killTargetForSpot(spec, spot) {
    if (!spec || !spot) return 0;
    const entries = new Set((spot.npcEntries || []).map((entry) => Number(entry.selfId)));
    const preferred = (spec.preferredKillNpcIds || []).map(Number).find((id) => entries.has(id));
    if (preferred) return preferred;
    const targets = new Set(questKillTargets(spec));
    return Number((spot.npcEntries || []).find((entry) => targets.has(Number(entry.selfId)))?.selfId || 0);
}

module.exports = {
    QUESTS,
    QUEST_BUCKETS,
    SPOT_GRID_SIZE,
    admissionBucket,
    authoredHuntingSpot,
    bucketFor,
    candidateFor,
    classRace,
    collectComplete,
    completedAt,
    eligible,
    inventoryAmount,
    killSpot,
    killTargetForSpot,
    npcLocation,
    questKillTargets,
    specFor
};
