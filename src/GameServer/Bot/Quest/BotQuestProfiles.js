'use strict';

// Bot quest resolution is metadata-driven. QuestService and the authored quest
// scripts remain authoritative for eligibility, state, drops and rewards; these
// profiles only tell autonomous bots how to navigate a supported quest.
const PROFILES = Object.freeze([
    Object.freeze({
        version: 1,
        questId: 165,
        name: "Shilen's Hunt",
        oneTime: true,
        goalPriority: 48,
        activePriority: 68,
        eligibility: Object.freeze({
            minLevel: 3,
            maxLevel: 12,
            // Dark Elf starter/derived classes. QuestService still verifies the
            // actual race and level before accepting the quest.
            classIdMin: 31,
            classIdMax: 43,
            // Do not send the whole eligible population to one quest. More
            // profiles can occupy other buckets as the bridge catalog grows.
            participationModulo: 4,
            participationRemainder: 1
        }),
        start: Object.freeze({ npcId: 7348, eventName: 'start' }),
        collect: Object.freeze({
            itemId: 1160,
            amount: 13,
            // Prefer the guaranteed Dark Bezoar source; the authored quest
            // script still accepts its other three kill targets naturally.
            preferredNpcIds: Object.freeze([456, 536, 529, 532])
        }),
        finish: Object.freeze({ npcId: 7348 })
    })
]);

const BY_ID = new Map(PROFILES.map((profile) => [Number(profile.questId), profile]));

function byId(questId) {
    return BY_ID.get(Number(questId)) || null;
}

function completedIds(state = {}) {
    return new Set((state.stats?.questBridgeHistory?.completed || []).map(Number).filter(Boolean));
}

function participates(state = {}, profile = {}) {
    const modulo = Math.max(1, Number(profile.eligibility?.participationModulo) || 1);
    const expected = ((Number(profile.eligibility?.participationRemainder) || 0) % modulo + modulo) % modulo;
    const characterId = Math.max(0, Number(state.characterId) || 0);
    return characterId % modulo === expected;
}

function eligible(state = {}, profile = {}) {
    if (!state?.characterId || state.phase === 'hot' || state.party?.partyId) return false;
    if (['dead', 'pk_hunting', 'merchant', 'crafting'].includes(String(state.activity || ''))) return false;
    const level = Math.max(1, Number(state.level || 1));
    const classId = Number(state.stats?.classId ?? state.classId ?? -1);
    const rules = profile.eligibility || {};
    if (level < Math.max(1, Number(rules.minLevel) || 1)) return false;
    if (Number.isFinite(Number(rules.maxLevel)) && level > Number(rules.maxLevel)) return false;
    if (Number.isFinite(Number(rules.classIdMin)) && classId < Number(rules.classIdMin)) return false;
    if (Number.isFinite(Number(rules.classIdMax)) && classId > Number(rules.classIdMax)) return false;
    if (profile.oneTime && completedIds(state).has(Number(profile.questId))) return false;
    return participates(state, profile);
}

function forState(state = {}) {
    const activeId = Number(state.stats?.questBridge?.questId || 0);
    if (activeId) return byId(activeId);
    return PROFILES.find((profile) => eligible(state, profile)) || null;
}

module.exports = {
    PROFILES,
    byId,
    completedIds,
    eligible,
    forState,
    participates
};
