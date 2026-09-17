const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
require('../src/Global');
const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const Backpack = invoke('GameServer/Actor/Backpack');
const Service = invoke('GameServer/Quest/QuestService');
const Transfer = invoke('GameServer/ClassTransfer');
const Q401 = require('../src/GameServer/Quest/quests/Q401_PathToWarrior');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-profession-'));
const file = path.join(directory, 'test.sqlite');
options.default.Database.path = file;
async function sessionFor(id) {
    const [row] = await Database.execute(['SELECT * FROM characters WHERE id = ?', [id]]);
    const actor = { classId: row.classId, level: row.level, fetchId: () => id, fetchName: () => 'Trial',
        fetchClassId() { return this.classId; }, setClassId(value) { this.classId = value; }, fetchLevel() { return this.level; },
        fetchClanId: () => 0, backpack: new Backpack({ items: await Database.fetchItems(id), paperdoll: {} }) };
    const session = { actor, dataSendToMe() {} };
    await Service.ensureLoaded(session);
    return session;
}
async function main() {
    const seed = new DatabaseSync(file);
    seed.exec(fs.readFileSync(path.resolve(__dirname, '../database/sql/sqlite.sql'), 'utf8'));
    seed.exec("INSERT INTO accounts(username,password) VALUES ('proof','test')");
    for (let id = 1; id <= 30; id++) seed.prepare(`INSERT INTO characters(id,username,name,classId,race,level,exp,sp,maxHp,maxMp,hp,mp,sex,face,hair,hairColor,locX,locY,locZ)
        VALUES (?, 'proof', ?, 0, 0, 19, 0, 0, 187, 74, 187, 74, 0, 0, 0, 0, 0, 0, 0)`).run(id, `Proof${id}`);
    seed.close(); Database.init(); DataCache.init();
    let session = await sessionFor(1);
    session.activeNpcTalk = { selfId: 7010, objectId: 100 };
    session.actor.level = 18;
    assert.equal(await Service.onEvent(session, { questId: 401, name: 'start' }), false);
    session.actor.level = 19;
    await Service.onEvent(session, { questId: 401, name: 'start' });
    const state = session.questStates.get(401);
    assert.equal(state.getInt('cond'), 1);
    session.activeNpcTalk.selfId = 7010;
    assert.equal(await Service.onEvent(session, { questId: 401, name: 'guild' }), false, 'wrong NPC cannot advance');
    session.activeNpcTalk.selfId = 7253;
    await Service.onEvent(session, { questId: 401, name: 'guild' });
    const random = Math.random;
    try {
        Math.random = () => 0;
        await Q401.onKill(state, { fetchSelfId: () => 38 });
        assert.equal(state.getInt('cond'), 2);
        for (let n = 0; n < 10; n++) await Q401.onKill(state, { fetchSelfId: () => 35 });
    } finally { Math.random = random; }
    await Q401.onTalk(state, { fetchSelfId: () => 7253 });
    session.activeNpcTalk.selfId = 7010;
    await Service.onEvent(session, { questId: 401, name: 'forge' });
    session.actor.backpack.fetchPaperdollSelfId = () => 0;
    await Q401.onKill(state, { fetchSelfId: () => 38 });
    assert.equal(session.actor.backpack.fetchItemFromSelfId(1144), undefined, 'trial weapon required');
    session.actor.backpack.fetchPaperdollSelfId = () => 1142;
    for (let n = 0; n < 20; n++) await Q401.onKill(state, { fetchSelfId: () => 38 });
    await Q401.onTalk(state, { fetchSelfId: () => 7010 });
    assert.equal(state.state, 'completed');
    assert.equal(session.actor.fetchClassId(), 0, 'quest never mutates class');
    assert.equal((await Transfer.transferPersisted(1, 1)).reason, 'level');
    await Q401.onTalk(state, { fetchSelfId: () => 7010 });
    assert.equal((await Database.fetchItems(1)).filter(i => i.selfId === 1145).length, 1, 'reward replay is harmless');
    await Database.close(); Database.init();
    session = await sessionFor(1);
    assert.equal(session.questStates.get(401).getInt('professionProof'), 1145, 'proof survives restart');
    await Database.execute(['UPDATE characters SET level = 20 WHERE id <= 4', []]);
    assert.equal((await Transfer.transferPersisted(2, 1)).reason, 'proof', 'no proof');
    await Service.giveItem(await sessionFor(2), 1145, 1);
    assert.equal((await Transfer.transferPersisted(2, 1)).reason, 'proof', 'item alone is not quest completion');
    await Database.setCharacterQuest(3, 401, 'completed', { professionProof: '1145' });
    await Service.giveItem(await sessionFor(3), 1164, 1);
    assert.equal((await Transfer.transferPersisted(3, 1)).reason, 'proof', 'wrong proof item');
    await Database.execute(['UPDATE characters SET classId = 10 WHERE id = 4', []]);
    assert.equal((await Transfer.transferPersisted(4, 1)).reason, 'wrong_profession');
    const result = await Promise.all([Transfer.transferPersisted(1, 1), Transfer.transferPersisted(1, 1)]);
    assert(result.every(r => r.ok));
    assert.equal(result.filter(r => r.alreadyTransferred).length, 1, 'atomic idempotent transfer');
    assert.equal((await Database.fetchItems(1)).some(i => i.selfId === 1145), false);
    await Database.execute(['UPDATE characters SET classId = 0 WHERE id = 1', []]);
    await Service.giveItem(await sessionFor(1), 1145, 1);
    assert.equal((await Transfer.transferPersisted(1, 1)).reason, 'proof', 'spent proof cannot be reused after repair/reset');
    console.log('Q401 start, NPC guards, kills, equipment, completion, restart and atomic proof transfer passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
    await Database.close(); fs.rmSync(directory, { recursive: true, force: true });
});
