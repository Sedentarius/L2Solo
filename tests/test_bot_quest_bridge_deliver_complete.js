const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

require('../src/Global');

const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const Backpack = invoke('GameServer/Actor/Backpack');
const QuestService = invoke('GameServer/Quest/QuestService');
const LifeState = invoke('GameServer/Bot/Population/BotLifeState');
const InventorySummary = invoke('GameServer/Bot/Population/InventorySummary');
const Bridge = invoke('GameServer/Bot/Quest/BotQuestBridge');
const TalkPlanner = invoke('GameServer/Bot/Quest/BotQuestTalkPlanner');
const Runtime = invoke('GameServer/Bot/Quest/ColdQuestRuntime');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-quest-bridge-b3-'));
const file = path.join(directory, 'quest-b3.sqlite');
options.default.Database.path = file;
process.env.L2NODE_PROGRESSION_RATE = 'x1';
Object.assign(options.default.General, {
    expRate: 1, spRate: 1, questExpRate: 1, questSpRate: 1, questAdenaRate: 1
});

async function starterSession(id) {
    const session = {
        actor: {
            exp: 0,
            sp: 0,
            fetchId: () => id,
            fetchName: () => `ColdQuest${id}`,
            fetchRace: () => 2,
            fetchClassId: () => 31,
            fetchLevel: () => 6,
            fetchClanId: () => 0,
            fetchExp() { return this.exp; },
            fetchSp() { return this.sp; },
            setExpSp(exp, sp) { this.exp = exp; this.sp = sp; },
            backpack: new Backpack({ items: await Database.fetchItems(id), paperdoll: {} })
        },
        packets: [],
        dataSendToMe(packet) { this.packets.push(packet); }
    };
    await QuestService.ensureLoaded(session);
    return session;
}

async function amountOf(characterId, selfId) {
    const items = await Database.fetchItems(characterId);
    return items
        .filter((item) => Number(item.selfId) === Number(selfId))
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

async function main() {
    const seed = new DatabaseSync(file);
    seed.exec(fs.readFileSync(path.resolve(__dirname, '../database/sql/sqlite.sql'), 'utf8'));
    seed.prepare('INSERT INTO accounts(username, password) VALUES (?, ?)').run('bot_quest_b3', 'test');
    seed.prepare(`INSERT INTO characters(id, username, name, classId, race, level, exp, sp, maxHp, maxMp, hp, mp, sex, face, hair, hairColor, locX, locY, locZ)
        VALUES (1, 'bot_quest_b3', 'ColdQuest1', 31, 2, 6, 0, 0, 187, 74, 187, 74, 0, 0, 0, 0, 100, 100, 0)`).run();
    seed.close();
    Database.init();
    DataCache.init();

    const starter = await starterSession(1);
    const nelsya = { fetchId: () => 107348, fetchSelfId: () => 7348 };
    starter.activeNpcTalk = { objectId: nelsya.fetchId(), selfId: nelsya.fetchSelfId() };
    assert.equal(await QuestService.onTalk(starter, nelsya), true);
    assert.equal(await QuestService.onEvent(starter, { questId: 165, name: 'start' }), true);

    let lifecycle = {
        characterId: 1,
        name: 'ColdQuest1',
        classId: 31,
        level: 6,
        exp: 0,
        sp: 0,
        phase: 'cold',
        activity: 'hunting',
        loc: { locX: 100, locY: 100, locZ: 0 },
        vitals: { hp: 187, maxHp: 187, mp: 74, maxMp: 74 },
        timing: { lastResolvedAt: 1000, nextResolveAt: 2000 },
        simulation: { ownerId: 'legacy_main', revision: 70 },
        stats: {
            questBridge: Bridge.normalizeIntent({ questId: 165, step: 'collect', attempt: 1 }, 1000)
        },
        inventory: InventorySummary.fromItems(await Database.fetchItems(1)),
        adena: 0
    };

    const originalSnapshot = LifeState.snapshot;
    const originalUpsert = LifeState.upsertState;
    try {
        LifeState.snapshot = (id) => Number(id) === 1 ? lifecycle : null;
        LifeState.upsertState = async (state) => {
            lifecycle = state;
            return state;
        };

        for (let index = 0; index < 13; index++) {
            const result = await Runtime.resolveColdKill(lifecycle, 456, `b3-wolf-${index}`);
            assert.equal(result.ok, true);
            assert.equal(result.replayed, false);
            lifecycle = result.state;
        }
        assert.equal(await amountOf(1, 1160), 13, 'collection phase must materialize all 13 Dark Bezoars');

        lifecycle = {
            ...lifecycle,
            stats: {
                ...(lifecycle.stats || {}),
                questBridge: Bridge.normalizeIntent({
                    questId: 165,
                    step: 'deliver',
                    attempt: 1,
                    targetNpcId: 7348,
                    createdAt: lifecycle.stats.questBridge.createdAt
                }, 5000)
            }
        };

        assert.deepEqual(TalkPlanner.talkNpcIds(lifecycle.stats.questBridge), [7348]);
        assert.equal(TalkPlanner.isTalkTarget(lifecycle.stats.questBridge, 7348), true);
        assert.equal(TalkPlanner.isTalkTarget(lifecycle.stats.questBridge, 7349), false);

        const wrongNpc = await Runtime.resolveColdTalk(lifecycle, 7349, 'wrong-npc');
        assert.equal(wrongNpc.ok, false);
        assert.equal(wrongNpc.reason, 'not_quest_talk_target');
        assert.equal(await amountOf(1, 1160), 13);

        const completed = await Runtime.resolveColdTalk(lifecycle, 7348, 'handin-1', { objectId: 107348, timestamp: 6000 });
        assert.equal(completed.ok, true);
        assert.equal(completed.finished, true, 'final authored hand-in must close the active quest');
        lifecycle = completed.state;

        assert.equal(await amountOf(1, 1160), 0, 'hand-in must consume the real collected quest items');
        assert.equal(await amountOf(1, 1060), 5, 'hand-in must award the authored five reward items');
        assert.equal(lifecycle.inventory['1060'].amount, 5, 'cold inventory projection must reconcile the real reward');
        assert.equal(lifecycle.inventory['1160'], undefined, 'consumed quest items must disappear from cold inventory');
        assert.equal(lifecycle.exp, 1000, 'quest EXP reward must reconcile into cold lifecycle state');
        assert.equal(lifecycle.sp, 0);
        assert.equal(lifecycle.stats.questBridge, null, 'finished quest must clear the active bridge intent');

        const rows = await Database.fetchCharacterQuests(1);
        const q165 = rows.find((row) => Number(row.questId) === 165);
        assert.equal(q165.state, 'completed', 'QuestState remains the durable completion authority');
        const character = (await Database.execute([
            'SELECT level, exp, sp FROM characters WHERE id = ? LIMIT 1', [1]
        ]))[0];
        assert.equal(Number(character.level), 6);
        assert.equal(Number(character.exp), 1000, 'buffered ExperienceReward persistence must be flushed before completion returns');
        assert.equal(Number(character.sp), 0);

        const replay = await Runtime.resolveColdTalk(lifecycle, 7348, 'handin-1');
        assert.equal(replay.ok, false);
        assert.equal(replay.reason, 'missing_intent', 'a completed bridge cannot re-enter the final hand-in');
        assert.equal(await amountOf(1, 1060), 5, 'replaying completion must not duplicate rewards');
    } finally {
        LifeState.snapshot = originalSnapshot;
        LifeState.upsertState = originalUpsert;
    }

    console.log('Bot Quest Bridge B3 deliver/complete checks passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    try {
        await Database.close();
    } finally {
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    }
});
