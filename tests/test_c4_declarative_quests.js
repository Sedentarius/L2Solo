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
const Definitions = [...require('../src/GameServer/Quest/LowLevelDefinitions').filter(d=>!d.blocked), ...require('../src/GameServer/Quest/RecoveredLowLevelDefinitions')];
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
        if(d.requiredAny) {
            assert.equal(await Service.onEvent(s,{questId:d.id,name:'start'}),false,'prerequisite item gate');
            await Service.giveItem(s,d.requiredAny[0],1);
        }
        await Service.onEvent(s,{questId:d.id,name:'start'});
        let state=s.questStates.get(d.id);
        assert.equal(state.state,'started');
        const objective=d.stages[0];
        const random=Math.random;
        if(objective.type==='COLLECT') {
            try {
                Math.random=()=>.999;
                if(objective.drops[0].chance<1) await quest.onKill(state,{fetchSelfId:()=>objective.drops[0].npc});
                assert.equal(await amount(d.id,objective.drops[0].item),0);
                Math.random=()=>0;
                for(let n=0;n<9;n++) await quest.onKill(state,{fetchSelfId:()=>objective.drops[0].npc});
                await quest.onTalk(state,{fetchSelfId:()=>d.startNpc});
                const first={259:225,263:180,306:540,316:270,317:360}[d.id];
                assert.equal(await amount(d.id,57),first,'below-threshold unit payout');
                assert.equal(state.state,'started');
                for(let n=0;n<10;n++) {
                    if(n===5) {await Database.close();Database.init();s=await sessionFor(d.id);state=s.questStates.get(d.id);}
                    const drop=objective.drops[n%2];
                    await quest.onKill(state,{fetchSelfId:()=>drop.npc});
                }
                const clone=await sessionFor(d.id);
                await quest.onTalk(state,{fetchSelfId:()=>999999});
                assert.equal(await amount(d.id,57),first);
                await quest.onTalk(state,{fetchSelfId:()=>d.startNpc});
                assert.equal(await amount(d.id,57),first+({259:500,263:1250,306:5600,316:5300,317:3388}[d.id]),'mixed-item threshold payout');
                await assert.rejects(quest.onTalk(clone.questStates.get(d.id),{fetchSelfId:()=>d.startNpc}),/step changed/);
                const before=await amount(d.id,57);
                await quest.onTalk(state,{fetchSelfId:()=>d.startNpc});
                assert.equal(await amount(d.id,57),before,'empty hand-in cannot repeat bonus');
                if(d.id===316) {
                    for(let n=0;n<20;n++) await quest.onKill(state,{fetchSelfId:()=>5020});
                    assert.equal(await amount(d.id,1043),1,'unique boss trophy cap');
                    await quest.onTalk(state,{fetchSelfId:()=>d.startNpc});
                    assert.equal(await amount(d.id,57),before+10000,'boss trophy alone does not earn rat threshold bonus');
                }
                if(d.id===259) {
                    s.activeNpcTalk={selfId:7405,objectId:1};
                    assert.equal(await Service.onEvent(s,{questId:259,name:'potion'}),false,'empty exchange denied');
                    for(let n=0;n<20;n++) await quest.onKill(state,{fetchSelfId:()=>103});
                    s.activeNpcTalk.selfId=7497;
                    assert.equal(await Service.onEvent(s,{questId:259,name:'potion'}),false,'wrong NPC exchange denied');
                    s.activeNpcTalk.selfId=7405;
                    await Service.onEvent(s,{questId:259,name:'potion'});
                    await Service.onEvent(s,{questId:259,name:'arrows'});
                    assert.equal(await amount(d.id,1061),1);assert.equal(await amount(d.id,17),50);
                    assert.equal(await amount(d.id,1495),0);
                    assert.equal(await Service.onEvent(s,{questId:259,name:'arrows'}),false,'exchanges cannot spend the same skins twice');
                }
                await quest.onKill(state,{fetchSelfId:()=>objective.drops[0].npc});
                s.activeNpcTalk={selfId:d.startNpc+1,objectId:1};
                assert.equal(await Service.onEvent(s,{questId:d.id,name:'quit'}),false);
                s.activeNpcTalk.selfId=d.startNpc;
                await Service.onEvent(s,{questId:d.id,name:'quit'});
                assert.equal(state.state,'created');
                assert.equal(await amount(d.id,objective.drops[0].item),0,'quit removes pending quest items');
                assert.equal(state.getInt('cashouts'),d.id===316?3:2);
                await quest.onEvent(state,'start');assert.equal(state.state,'started');
            } finally {Math.random=random;}
            continue;
        }
        if(objective.objectives) {
            try {
                Math.random=()=>0;
                for(const [item,needed] of objective.objectives) {
                    const drop=objective.drops.find(x=>x.item===item);
                    for(let n=0;n<needed+2;n++) await quest.onKill(state,{fetchSelfId:()=>drop.npc});
                    assert.equal(await amount(d.id,item),needed,'independent objective cap');
                    await Database.close();Database.init();s=await sessionFor(d.id);state=s.questStates.get(d.id);
                }
                assert.equal(state.getInt('cond'),2);
                const stale=await sessionFor(d.id);
                await quest.onTalk(state,{fetchSelfId:()=>d.startNpc});
                assert.equal(await amount(d.id,5956),1);
                await assert.rejects(quest.onTalk(stale.questStates.get(d.id),{fetchSelfId:()=>d.startNpc}),/step changed/);
                for(const [item] of objective.objectives) assert.equal(await amount(d.id,item),0);
                assert.equal(state.state,'created');
            } finally {Math.random=random;}
            continue;
        }
        if(objective.type==='KILL_COLLECT') {
        await quest.onKill(state,{fetchSelfId:()=>999999});
        assert.equal(await amount(d.id,objective.item),0);
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
        }
        if(d.repeatable) {
        const spec=Catalog.specFor(d.id);
        assert(spec && Catalog.npcLocation(d.startNpc),`Q${d.id} has authored start location`);
        assert(Catalog.killSpot(spec,{level:20}),`Q${d.id} has a real hunting spot`);
        }
        for(const stage of d.stages.filter(x=>['TALK','DELIVER'].includes(x.type))) {
            await quest.onTalk(state,{fetchSelfId:()=>d.startNpc});
            const cond=state.getInt('cond');
            const stale=await sessionFor(d.id);
            await quest.onTalk(state,{fetchSelfId:()=>stage.npc});
            assert.equal(state.getInt('cond'),cond+1);
            await assert.rejects(quest.onTalk(stale.questStates.get(d.id),{fetchSelfId:()=>stage.npc}),/step changed/);
            await Database.close();Database.init();s=await sessionFor(d.id);state=s.questStates.get(d.id);
        }
        const finishNpc=d.stages.at(-1).npc;
        const clone=await sessionFor(d.id);
        const before=(await Database.execute(['SELECT exp,sp FROM characters WHERE id=?',[d.id]]))[0];
        await quest.onTalk(state,{fetchSelfId:()=>d.startNpc+100000});
        assert.equal(state.state,'started','wrong NPC cannot deliver');
        try {
            Math.random=()=>0;
            await quest.onTalk(state,{fetchSelfId:()=>finishNpc});
        } finally {Math.random=random;}
        assert.equal(state.state,d.repeatable?'created':'completed','authored completion policy');
        assert.equal(state.getInt('completions'),1);
        const expectedRewards={151:[[102,1]],155:[[734,1]],156:[[5250,1]],161:[[57,1000]],258:[[390,1]],261:[[57,1000]],262:[[57,3000]],
            264:[[43,1]],271:[[1507,1]],272:[[57,1500]],277:[[1658,2]],291:[[1502,1]],294:[[1508,1]],295:[[1509,1]],
            297:[[1659,2]],303:[[57,1000]],313:[[57,3500]],319:[[57,3350],[1060,1]],320:[[57,8470]],324:[[57,5810]],341:[[57,3710]]};
        for(const [item,quantity] of expectedRewards[d.id]||[]) assert.equal(await amount(d.id,item),quantity,`Q${d.id} authored reward ${item}`);
        if(d.id===274) {
            assert.equal(await amount(d.id,57),27500,'forty bonus totems paid once with base reward');
            assert.equal(await amount(d.id,1501),0);
            assert.equal(await amount(d.id,1506),1,'prerequisite necklace is retained');
        }
        for(const [item] of d.stages.at(-1).takes||[]) assert.equal(await amount(d.id,item),0);
        const rewards=JSON.stringify(await Database.fetchItems(d.id));
        await assert.rejects(quest.onTalk(clone.questStates.get(d.id),{fetchSelfId:()=>finishNpc}),/step changed/,'stale session cannot duplicate reward');
        await quest.onTalk(state,{fetchSelfId:()=>finishNpc});
        assert.equal(JSON.stringify(await Database.fetchItems(d.id)),rewards);
        const after=(await Database.execute(['SELECT exp,sp FROM characters WHERE id=?',[d.id]]))[0];
        assert.equal(after.exp-before.exp,d.reward.exp||0,'quest EXP commits once');
        assert.equal(after.sp-before.sp,d.reward.sp||0,'quest SP commits once');
        await quest.onEvent(state,'start');
        if(!d.repeatable) {assert.equal(state.state,'completed','one-time quest cannot restart');continue;}
        assert.equal(state.state,'started');
        await quest.onAbort(state);
        assert.equal(state.state,'created');
        assert.equal(state.getInt('completions'),1,'abort preserves completion receipts');
        if([294,295].includes(d.id)) {
            await quest.onEvent(state,'start');
            try {
                Math.random=()=>0;
                for(let n=0;n<objective.count;n++) await quest.onKill(state,{fetchSelfId:()=>objective.drops[0].npc});
                await quest.onTalk(state,{fetchSelfId:()=>d.startNpc});
            } finally {Math.random=random;}
            assert.equal(await amount(d.id,57),2400,'owned ring chooses Adena alternative');
            assert.equal(await amount(d.id,d.id===294?1508:1509),1,'repeat does not duplicate unique ring');
        }
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
    // Focused multiple-objective test uses known local item templates. Q379
    // itself stays disabled until its five missing templates are restored.
    const multi=require('../src/GameServer/Quest/DeclarativeQuest').create({id:313,name:'Multi-objective fixture',minLevel:1,startNpc:7150,repeatable:true,
        stages:[{type:'KILL_COLLECT',objectives:[[1118,2],[1045,3]],drops:[{npc:509,item:1118,chance:1},{npc:15,item:1045,chance:1}]},
            {type:'COMPLETE',npc:7150,takes:[[1118,2],[1045,3]]}],reward:{items:[[1060,1]]}});
    let multiSession=await sessionFor(313),multiState=multiSession.questStates.get(313);
    await multi.onEvent(multiState,'start');
    for(let n=0;n<5;n++) await multi.onKill(multiState,{fetchSelfId:()=>509});
    assert.equal(multiState.getInt('cond'),1);
    assert.equal(await amount(313,1118),2);
    await multi.onTalk(multiState,{fetchSelfId:()=>7150});
    assert.equal(multiState.state,'started','one objective is insufficient');
    await Database.close();Database.init();multiSession=await sessionFor(313);multiState=multiSession.questStates.get(313);
    for(let n=0;n<5;n++) await multi.onKill(multiState,{fetchSelfId:()=>15});
    assert.equal(await amount(313,1045),3);assert.equal(multiState.getInt('cond'),2);
    await multi.onTalk(multiState,{fetchSelfId:()=>7150});
    assert.equal(multiState.state,'created');assert.equal(await amount(313,1060),1);
    assert.equal(await amount(313,1118),0);assert.equal(await amount(313,1045),0);
    console.log(`${Definitions.length} declarative quests: eligibility, NPC guards, kills, caps, restart, atomic rewards, stale-session rejection and reset passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await Database.close();fs.rmSync(directory,{recursive:true,force:true});});
