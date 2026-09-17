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
const Definitions = require('../src/GameServer/Quest/LowLevelDefinitions');
const Catalog = require('../src/GameServer/Bot/Quest/AutonomousQuestCatalog');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-c4-definitions-'));
options.default.Database.path = path.join(directory, 'test.sqlite');
process.env.L2NODE_PROGRESSION_RATE = 'x1';
Object.assign(options.default.General, { questExpRate:1,questSpRate:1,questAdenaRate:1 });
async function sessionFor(id) {
    const [row] = await Database.execute(['SELECT * FROM characters WHERE id = ?', [id]]);
    const actor = { ...row, fetchId: () => id, fetchName: () => `Quest${id}`, fetchClanId: () => 0,
        fetchLevel() { return this.level; }, fetchRace() { return this.race; }, fetchClassId() { return this.classId; },
        fetchExp() { return this.exp; }, fetchSp() { return this.sp; }, setExpSp(exp,sp) { this.exp=exp;this.sp=sp; },
        backpack: new Backpack({items:await Database.fetchItems(id), paperdoll:{}}) };
    const session = {actor,dataSendToMe(){}};
    await Service.ensureLoaded(session); return session;
}
const amount = async (id,item) => (await Database.fetchItems(id)).filter(i=>i.selfId===item).reduce((sum,i)=>sum+i.amount,0);
async function main() {
    DataCache.init();
    const seed = new DatabaseSync(options.default.Database.path);
    seed.exec(fs.readFileSync(path.resolve(__dirname,'../database/sql/sqlite.sql'),'utf8'));
    seed.exec("INSERT INTO accounts(username,password) VALUES ('quests','test')");
    for (const d of Definitions) seed.prepare(`INSERT INTO characters(id,username,name,classId,race,level,exp,sp,maxHp,maxMp,hp,mp,sex,face,hair,hairColor,locX,locY,locZ)
        VALUES (?, 'quests', ?, 0, ?, 20, ?, 0, 187, 74, 187, 74, 0, 0, 0, 0, 0, 0, 0)`).run(d.id,`Quest${d.id}`,d.race??0,DataCache.experience[19]);
    seed.close(); Database.init();
    for (const d of Definitions) {
        const quest = Service.quests().find(q=>q.id===d.id);
        let s=await sessionFor(d.id);
        s.activeNpcTalk={selfId:d.startNpc,objectId:1};
        s.actor.level=d.minLevel-1;
        assert.equal(await Service.onEvent(s,{questId:d.id,name:'start'}),false,`Q${d.id} level gate`);
        s.actor.level=20;
        if(d.race!==undefined) {
            s.actor.race=(d.race+1)%5;
            assert.equal(await Service.onEvent(s,{questId:d.id,name:'start'}),false,`Q${d.id} race gate`);
            s.actor.race=d.race;
        }
        await Service.onEvent(s,{questId:d.id,name:'start'});
        let state=s.questStates.get(d.id);
        assert.equal(state.state,'started');
        const objective=d.stages[0];
        await quest.onKill(state,{fetchSelfId:()=>999999});
        assert.equal(await amount(d.id,objective.item),0);
        const random=Math.random;
        try {
            Math.random=()=>.9999;
            if(objective.drops[0].chance<1) {
                await quest.onKill(state,{fetchSelfId:()=>objective.drops[0].npc});
                assert.equal(await amount(d.id,objective.item),0,'failed drop has no mutation');
            }
            Math.random=()=>0;
            await quest.onKill(state,{fetchSelfId:()=>objective.drops[0].npc});
        } finally {Math.random=random;}
        await Database.close(); Database.init();
        s=await sessionFor(d.id);state=s.questStates.get(d.id);
        assert.equal(state.state,'started','collection survives database reopen');
        try {
            Math.random=()=>0;
            for(let n=0;n<objective.count+3;n++) await quest.onKill(state,{fetchSelfId:()=>objective.drops[0].npc});
        } finally {Math.random=random;}
        assert.equal(await amount(d.id,objective.item),objective.count,'bounded collection');
        const spec=Catalog.specFor(d.id);
        assert(spec && Catalog.npcLocation(d.startNpc),`Q${d.id} has authored start location`);
        assert(Catalog.killSpot(spec,{level:20}),`Q${d.id} has a real hunting spot`);
        const clone=await sessionFor(d.id);
        const before=(await Database.execute(['SELECT exp,sp FROM characters WHERE id=?',[d.id]]))[0];
        await quest.onTalk(state,{fetchSelfId:()=>d.startNpc+100000});
        assert.equal(state.state,'started','wrong NPC cannot deliver');
        try {
            Math.random=()=>0;
            await quest.onTalk(state,{fetchSelfId:()=>d.startNpc});
        } finally {Math.random=random;}
        assert.equal(state.state,'created','repeatable quest resets');
        assert.equal(state.getInt('completions'),1);
        assert.equal(await amount(d.id,objective.item),0);
        const rewards=JSON.stringify(await Database.fetchItems(d.id));
        await assert.rejects(quest.onTalk(clone.questStates.get(d.id),{fetchSelfId:()=>d.startNpc}),/step changed/,'stale session cannot duplicate reward');
        await quest.onTalk(state,{fetchSelfId:()=>d.startNpc});
        assert.equal(JSON.stringify(await Database.fetchItems(d.id)),rewards);
        const after=(await Database.execute(['SELECT exp,sp FROM characters WHERE id=?',[d.id]]))[0];
        assert.equal(after.exp-before.exp,d.reward.exp||0,'quest EXP commits once');
        assert.equal(after.sp-before.sp,d.reward.sp||0,'quest SP commits once');
        await quest.onEvent(state,'start');
        assert.equal(state.state,'started');
        await quest.onAbort(state);
        assert.equal(state.state,'created');
        assert.equal(state.getInt('completions'),1,'abort preserves completion receipts');
    }
    // Same physical quest progresses cold -> hot -> cold. The Bridge keeps
    // receipts; QuestService and QuestStep own all item/state mutations.
    const Runtime = require('../src/GameServer/Bot/Quest/ColdQuestRuntime');
    const Bridge = require('../src/GameServer/Bot/Quest/BotQuestBridge');
    const Life = invoke('GameServer/Bot/Population/BotLifeState');
    const Summary = invoke('GameServer/Bot/Population/InventorySummary');
    let life = {characterId:313,name:'Quest313',classId:0,level:20,phase:'cold',activity:'hunting',
        loc:{locX:0,locY:0,locZ:0},vitals:{hp:187,maxHp:187,mp:74,maxMp:74},
        timing:{lastResolvedAt:1000,nextResolveAt:2000},simulation:{ownerId:'legacy_main',revision:70},
        stats:{questBridge:Bridge.normalizeIntent({questId:313,step:'start',targetNpcId:7150,attempt:1},1000)},
        inventory:Summary.fromItems(await Database.fetchItems(313))};
    const original={snapshot:Life.snapshot,upsertState:Life.upsertState};
    const random=Math.random;
    try {
        Life.snapshot=id=>id===313?life:null;
        Life.upsertState=async s=>(life=s);
        assert.equal((await Runtime.resolveColdTalk(life,7150,'start',{eventName:'start'})).ok,true);
        life=Bridge.withIntent(life,{questId:313,step:'collect',targetNpcId:509,attempt:1});
        Math.random=()=>0;
        for(let n=0;n<5;n++) assert.equal((await Runtime.resolveColdKill(life,509,`fungus-${n}`)).ok,true);
        const hot=await sessionFor(313);
        assert.equal(Bridge.hydrateSessionIntent(hot).questId,313);
        const quest=Service.quests().find(q=>q.id===313);
        for(let n=0;n<5;n++) await Service.mutate(hot,()=>quest.onKill(hot.questStates.get(313),{fetchSelfId:()=>509}));
        life={...life,inventory:Summary.fromItems(hot.actor.backpack.fetchItems())};
        life=Bridge.withIntent(life,{questId:313,step:'return',targetNpcId:7150,attempt:1});
        const before=await amount(313,57);
        const completed=await Runtime.resolveColdTalk(life,7150,'return');
        assert.equal(completed.ok,true);assert.equal(completed.finished,true);
        assert.equal(await amount(313,57),before+3500);
        assert.equal(life.stats.questBridge,null);
        assert.equal((await Runtime.resolveColdTalk(life,7150,'return')).reason,'missing_intent');
        assert.equal(await amount(313,57),before+3500);
    } finally {Object.assign(Life,original);Math.random=random;}
    console.log(`${Definitions.length} declarative quests: eligibility, NPC guards, kills, caps, restart, atomic rewards, stale-session rejection and reset passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await Database.close();fs.rmSync(directory,{recursive:true,force:true});});
