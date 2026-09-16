const QuestRegistry = require('../../Quest/QuestRegistry');
const BotQuestBridge = require('./BotQuestBridge');

function activeQuestMap() {
    return new Map(QuestRegistry.activeQuests().map((quest) => [Number(quest.id), quest]));
}

function questForIntent(intent) {
    if (!intent?.questId) return null;
    return activeQuestMap().get(Number(intent.questId)) || null;
}

function killNpcIds(intent) {
    const quest = questForIntent(intent);
    return [...new Set((quest?.killNpcs || [])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function npcSelfId(npc) {
    return Number(npc?.fetchSelfId?.() ?? npc?.npcSelfId ?? npc?.selfId ?? npc) || 0;
}

function isAlive(npc) {
    if (!npc) return false;
    if (typeof npc.isDead === 'function') return !npc.isDead();
    if (npc.state?.fetchDead) return !npc.state.fetchDead();
    return npc.dead !== true;
}

function isKillTarget(intent, npc) {
    const id = npcSelfId(npc);
    return id > 0 && killNpcIds(intent).includes(id);
}

function point(actor) {
    const locX = Number(actor?.fetchLocX?.() ?? actor?.locX);
    const locY = Number(actor?.fetchLocY?.() ?? actor?.locY);
    if (!Number.isFinite(locX) || !Number.isFinite(locY)) return null;
    return { locX, locY };
}

function distance2d(actor, target) {
    const left = point(actor);
    const right = point(target);
    if (!left || !right) return Number.POSITIVE_INFINITY;
    return Math.hypot(left.locX - right.locX, left.locY - right.locY);
}

function selectHotKillTarget(session, npcs = [], intent = null) {
    const selectedIntent = intent || BotQuestBridge.activeIntent(session);
    if (!selectedIntent || !questForIntent(selectedIntent)) return null;
    return (npcs || [])
        .filter((npc) => isAlive(npc) && isKillTarget(selectedIntent, npc))
        .sort((left, right) => distance2d(session?.actor, left) - distance2d(session?.actor, right)
            || Number(left?.fetchId?.() ?? left?.actorId ?? 0) - Number(right?.fetchId?.() ?? right?.actorId ?? 0))[0] || null;
}

module.exports = {
    distance2d,
    isKillTarget,
    killNpcIds,
    npcSelfId,
    questForIntent,
    selectHotKillTarget
};
