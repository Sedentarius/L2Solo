const assert = require('assert');
const fs = require('fs');

require('../src/Global');

const NpcTalk = invoke('GameServer/World/Generics/NpcTalk');
const NpcTalkResponse = invoke('GameServer/World/Generics/NpcTalkResponse');
const NpcShopBuyLists = invoke('GameServer/World/Generics/NpcShopBuyLists');
const QuestService = invoke('GameServer/Quest/QuestService');

const questNpcIds = new Set(QuestService.quests().flatMap((quest) => quest.npcs || []));
const dualRoleNpcIds = NpcShopBuyLists.npcIds().filter((npcId) => questNpcIds.has(npcId));

assert.ok(dualRoleNpcIds.includes(7147), 'Unoren must be covered as a quest and merchant NPC');
assert.ok(dualRoleNpcIds.length > 1, 'regression must cover all current dual-role NPCs');

function packetIncludes(packet, text) {
    return packet.includes(Buffer.from(text, 'ucs2'));
}

for (const npcId of dualRoleNpcIds) {
    const htmlPath = `data/Html/${npcId}.html`;
    assert.ok(fs.existsSync(htmlPath), `dual-role NPC ${npcId} must have a main HTML page`);
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.match(html, /buy-shop/, `dual-role NPC ${npcId} must expose its merchant action`);

    const packets = [];
    const session = {
        actor: {
            fetchId: () => 900000 + npcId,
            fetchLevel: () => 1,
            fetchRace: () => 0
        },
        questStatesLoaded: true,
        questStates: new Map(),
        dataSendToMe(packet) {
            packets.push(packet);
        }
    };

    NpcTalk(session, {
        fetchSelfId: () => npcId,
        fetchId: () => 910000 + npcId,
        fetchName: () => `NPC ${npcId}`,
        fetchTitle: () => 'Trader'
    });

    assert.strictEqual(packets[0][0], 0x0f, `dual-role NPC ${npcId} must open its main HTML`);
    assert.ok(packetIncludes(packets[0], 'buy-shop'), `dual-role NPC ${npcId} must keep its shop link reachable`);
    assert.ok(packetIncludes(packets[0], `html ${npcId}-quest`), `dual-role NPC ${npcId} must expose its quest action`);
    assert.strictEqual(packets[1][0], 0x25, `dual-role NPC ${npcId} must terminate the main interaction`);
}

(async () => {
    // Unoren's quest is a reviewed definition with a level requirement, so the
    // character used here has to meet it; an ineligible one would correctly be
    // shown the no-quest page and would prove nothing about the dual role.
    const unorenQuest = QuestService.quests().find((quest) => (quest.startNpcs || []).includes(7147));
    assert.ok(unorenQuest, 'Unoren must start a quest');
    const eligibleLevel = Number(unorenQuest.definition?.minLevel) || 1;

    const packets = [];
    const session = {
        actor: {
            fetchId: () => 42,
            fetchLevel: () => eligibleLevel,
            fetchRace: () => Number(unorenQuest.definition?.race ?? 0)
        },
        questStatesLoaded: true,
        questStates: new Map(),
        dataSendToMe(packet) {
            packets.push(packet);
        }
    };

    NpcTalk(session, {
        fetchSelfId: () => 7147,
        fetchId: () => 97147,
        fetchName: () => 'Unoren',
        fetchTitle: () => 'Trader'
    });
    assert.ok(session.activeNpcTalk, 'merchant talk must retain the active NPC for the quest link');
    NpcTalkResponse(session, { link: 'html 7147-quest' });
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(packets[2][0], 0x0f, 'Unoren quest link must open a quest HTML page');
    // A reviewed definition heads its pages with the quest's own name rather
    // than the NPC's, so that is what the rendered page must carry.
    assert.ok(packetIncludes(packets[2], unorenQuest.name),
        'Unoren quest link must render QuestService output for his own quest');
    assert.strictEqual(packets[3][0], 0x25, 'Unoren quest link must terminate the quest interaction');
    console.log(`dual-role NPC checks passed (${dualRoleNpcIds.length} NPCs)`);
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
