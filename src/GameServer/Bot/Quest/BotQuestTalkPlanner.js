const KillPlanner = require('./BotQuestKillPlanner');

function npcSelfId(npc) {
    return Number(npc?.fetchSelfId?.() ?? npc?.npcSelfId ?? npc?.selfId ?? npc) || 0;
}

function talkNpcIds(intent) {
    const quest = KillPlanner.questForIntent(intent);
    return [...new Set((quest?.npcs || [])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function isTalkTarget(intent, npc) {
    const id = npcSelfId(npc);
    if (!id || !talkNpcIds(intent).includes(id)) return false;
    const planned = Number(intent?.targetNpcId || 0);
    return planned <= 0 || planned === id;
}

module.exports = {
    isTalkTarget,
    npcSelfId,
    talkNpcIds
};
