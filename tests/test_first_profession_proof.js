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
process.env.L2NODE_PROGRESSION_RATE = 'x1';
Object.assign(options.default.General, {questExpRate:1,questSpRate:1});
async function sessionFor(id) {
    const [row] = await Database.execute(['SELECT * FROM characters WHERE id = ?', [id]]);
    const actor = { classId: row.classId, level: row.level, exp:row.exp, sp:row.sp,
        fetchExp() { return this.exp; }, fetchSp() { return this.sp; }, setExpSp(exp,sp) {this.exp=exp;this.sp=sp;},
        fetchId: () => id, fetchName: () => 'Trial',
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
    let state = session.questStates.get(401);
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
    for (let n = 0; n < 10; n++) await Q401.onKill(state, { fetchSelfId: () => 38 });
    const sword=session.actor.backpack.fetchItemFromSelfId(1142);
    await Database.updateItemEquipState(1,sword.fetchId(),true,7);
    await Database.close();Database.init();
    const Cold=require('../src/GameServer/Bot/Quest/ColdQuestRuntime');
    const Bridge=require('../src/GameServer/Bot/Quest/BotQuestBridge');
    const Life=invoke('GameServer/Bot/Population/BotLifeState');
    const savedLife={snapshot:Life.snapshot,upsertState:Life.upsertState};
    let life={characterId:1,classId:0,level:19,phase:'cold',activity:'hunting',
        stats:{questBridge:Bridge.normalizeIntent({questId:401,step:'collect',targetNpcId:38,attempt:1},1000)}};
    try {
        Life.snapshot=()=>life;Life.upsertState=async next=>(life=next);
        const cold=await Cold.coldSessionFor(life);
        assert.equal(cold.actor.backpack.fetchPaperdollSelfId(7),1142,'cold kills retain trial equipment');
        for(let n=0;n<10;n++) assert.equal((await Cold.resolveColdKill(life,38,`q401-spider-${n}`)).ok,true);
        assert.equal((await Cold.resolveColdKill(life,38,'q401-spider-9')).replayed,true);
    } finally {Object.assign(Life,savedLife);}
    session=await sessionFor(1);state=session.questStates.get(401);
    assert.equal(state.getInt('cond'),6,'hot/cold progress and condition survive restart');
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
    const Proof = require('../src/GameServer/Quest/FirstProfessionProof');
    const inventory = fs.readFileSync(path.resolve(__dirname, '../docs/c4/quests/C4_QUEST_MASTER_INVENTORY.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    // Script-specific final hand-ins, not arbitrary proof injection. Earlier
    // retail branches are covered by test_quest_runtime; Q401 above is full E2E.
    const finals = {
        402: [7417,1,[[1271,1],...[1162,1163,1164,1165,1166,1167].map(i=>[i,1])]],
        403: [7379,5,[1186,1187,1188,1189].map(i=>[i,1])],
        404: [7391,1,[1282,1285,1288,1291].map(i=>[i,1])],
        405: [7022,5,[[1192,1],[1200,1]]], 406: [7327,6,[[1203,1]]],
        407: [7328,6,[[1216,1]]], 408: [7414,1,[1220,1221,1226,1229].map(i=>[i,1])],
        // Manuel completes Q409 at cond 7, after Allana exchanges the diary.
        409: [7293,7,[1231,1232,1233,1234].map(i=>[i,1])], 410: [7329,5,[[1243,1]]],
        411: [7416,5,[[1251,1]]], 412: [7421,1,[1253,1254,1255,1256].map(i=>[i,1])],
        413: [7330,5,[[1265,1],[1269,1]]], 414: [7501,5,[[1589,1],[1591,2]]],
        415: [7501,13,[1603,1613,1614].map(i=>[i,1])],416: [7502,11,[[1630,1]]],
        417: [7316,10,[[1645,1]]],418: [7317,7,[1633,1634,1641].map(i=>[i,1])]
    };
    for (const spec of Proof.paths) {
        const source = inventory.find(q => q.quest_id === spec.questId);
        assert.deepEqual(source.from_class_ids, [spec.fromClassId]);
        assert.deepEqual(source.to_class_ids, [spec.toClassId]);
        assert.equal(source.class_transfer_proof.item_id, spec.itemId);
        if (spec.questId === 401) continue;
        const id = spec.questId - 397;
        await Database.execute(['UPDATE characters SET classId = ?, level = 19 WHERE id = ?', [spec.fromClassId,id]]);
        const s = await sessionFor(id);
        const quest = Service.quests().find(q => q.id === spec.questId);
        const [npc, cond, items] = finals[spec.questId];
        await Database.setCharacterQuest(id, quest.id, 'started', { cond: String(cond) });
        s.questStatesLoaded = false; await Service.ensureLoaded(s);
        for (const [item, amount] of items) await Service.giveItem(s,item,amount);
        const state = s.questStates.get(quest.id);
        await quest.onTalk(state, { fetchSelfId: () => npc });
        assert.equal(state.state, 'completed', `Q${quest.id} final hand-in completes`);
        assert.equal(s.actor.fetchClassId(), spec.fromClassId);
        await quest.onTalk(state, { fetchSelfId: () => npc });
        assert.equal((await Database.fetchItems(id)).filter(i=>i.selfId===spec.itemId).length,1);
        await Database.execute(['UPDATE characters SET level = 20 WHERE id = ?', [id]]);
        assert.equal((await Transfer.transferPersisted(id,spec.toClassId)).ok,true);
        assert.equal((await Transfer.transferPersisted(id,spec.toClassId)).alreadyTransferred,true);
    }
    // Autonomous reference vertical schedules real NPC travel, script events,
    // trial equipment, credited kills and ClassTransfer through the same Bridge.
    const Progress=invoke('GameServer/Bot/BotClassProgression');
    const id=[22,23,24,25,26,27,28].find(id=>Progress.nextClass(0,20,id)===1);
    assert(id);
    await Database.execute(['UPDATE characters SET level=20,exp=? WHERE id=?',[DataCache.experience[19],id]]);
    const Runtime=require('../src/GameServer/Bot/Quest/AutonomousQuestRuntime');
    const Catalog=require('../src/GameServer/Bot/Quest/AutonomousQuestCatalog');
    let auto={characterId:id,classId:0,level:20,phase:'cold',activity:'hunting',loc:{locX:0,locY:0,locZ:0},
        inventory:{},stats:{classId:0},timing:{nextResolveAt:1000},simulation:{ownerId:'legacy_main',revision:1}};
    const goal=Catalog.candidateFor(auto,{ignoreStagger:true,timestamp:1000});
    assert.equal(goal.target.questId,401);
    const Goal=invoke('GameServer/Bot/Goals/GoalService');
    const prior={snapshot:Life.snapshot,upsertState:Life.upsertState,goal:Goal.snapshot,complete:Goal.complete};
    try {
        Life.snapshot=()=>auto;Life.upsertState=async next=>(auto=next);
        Goal.snapshot=()=>({current:{...goal,status:'active'}});Goal.complete=async()=>{};
        Math.random=()=>0;
        for(let tick=1;tick<=100 && auto.classId!==1;tick++) {
            if(auto.activity==='traveling') {
                const travel=auto.stats.travel;
                assert(travel?.to);
                auto={...auto,loc:{...travel.to},spotId:travel.spotId||auto.spotId,activity:'hunting',stats:{...auto.stats,travel:null}};
            }
            auto=await Runtime.advance(auto,{timestamp:tick*1000});
            const intent=Bridge.intentFrom(auto);
            if(auto.activity==='hunting' && intent?.step==='collect') {
                assert((await Cold.resolveColdKill(auto,intent.targetNpcId,`autonomous-${tick}`)).ok);
            }
            if(tick===10) {await Database.close();Database.init();}
        }
        assert.equal(auto.classId,1,'autonomous Q401 reaches Warrior using earned proof');
        assert.equal(auto.stats.classId,1);
        assert.equal(auto.stats.questBridge,null);
        assert.equal((await Database.fetchItems(id)).some(i=>i.selfId===1145),false,'transfer consumes the earned medallion');
        assert.equal((await Transfer.transferPersisted(id,1)).alreadyTransferred,true);
    } finally {
        Life.snapshot=prior.snapshot;Life.upsertState=prior.upsertState;Goal.snapshot=prior.goal;Goal.complete=prior.complete;Math.random=random;
    }
    const a = await Database.chooseFirstProfessionPath(29,0,1);
    await Database.close(); Database.init();
    assert.deepEqual(await Database.chooseFirstProfessionPath(29,0,4),a,'stored branch survives restart and changed selection');
    assert.equal((await invoke('GameServer/Bot/BotClassProgression').reconcile({characterId:30,classId:0,level:20})).classId,0,'bot without proof stays base class');
    assert.equal(invoke('GameServer/Bot/BotClassProgression').plan({classId:0,level:76,seed:30}).classId,0,'worker cannot project unearned professions');
    console.log('Q401 start, NPC guards, kills, equipment, completion, restart and atomic proof transfer passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
    await Database.close(); fs.rmSync(directory, { recursive: true, force: true });
});
