// Server-authored definitions implement the existing QuestService interface.
// This is not an inventory interpreter: only reviewed local definitions enter.
const page = (name, text) => `<html><body>${name}:<br>${text}</body></html>`;
const count = (state, id) => state.session.actor.backpack.fetchItems()
    .filter(item => item.fetchSelfId() === id).reduce((sum,item) => sum + item.fetchAmount(), 0);
const TYPES = new Set(['TALK', 'DELIVER', 'KILL_COLLECT', 'COLLECT', 'COMPLETE', 'CHOICE']);
const objectives = stage => stage.objectives || (stage.item ? [[stage.item,stage.count]] : []);

function validate(definition) {
    if (!Number.isInteger(definition.id) || !definition.name || !Number.isInteger(definition.startNpc) || !definition.stages?.length) throw new Error('Invalid quest definition');
    for (const stage of definition.stages) {
        if (!TYPES.has(stage.type)) throw new Error(`Unsupported quest stage ${stage.type}`);
        if(stage.type==='CHOICE' && (!stage.choices?.length || stage.choices.some(c=>!c.event||!Number.isInteger(c.npc)||(!c.finish&&(!Number.isInteger(c.next)||c.next<1||c.next>definition.stages.length))))) throw new Error('Unresolved quest choice');
        if (stage.type === 'KILL_COLLECT' && (!stage.drops?.length || !objectives(stage).length || objectives(stage).some(([id,n])=>!Number.isInteger(id)||!Number.isInteger(n)||n<1))) throw new Error('Unresolved collection mechanic');
        if (stage.type === 'COLLECT' && (!stage.drops?.length || !stage.prices?.length || !stage.npc)) throw new Error('Unresolved bounty mechanic');
        for (const drop of stage.drops || []) {
            if (!Number.isInteger(drop.npc) || !Number.isFinite(drop.chance) || drop.chance <= 0 || drop.chance > 1) throw new Error('Unresolved quest drop');
        }
    }
}
function create(definition) {
    validate(definition);
    const d = definition;
    const exchanges=d.exchanges||[];
    const choices=d.stages.flatMap(s=>s.choices||[]);
    const npcs = [...new Set([d.startNpc, ...exchanges.map(e=>e.npc), ...choices.map(c=>c.npc), ...d.stages.map(s => s.npc).filter(Boolean)])];
    const allowed = state => Number(state.session.actor.fetchLevel()) >= d.minLevel &&
        (d.race === undefined || Number(state.session.actor.fetchRace()) === d.race) &&
        (!d.classes || d.classes.includes(Number(state.session.actor.fetchClassId()))) &&
        (!d.requiredAny || d.requiredAny.some(id=>count(state,id)>0));
    const step = (state, options) => require('./QuestStep').apply(state, options);
    const stageFor = state => d.stages[state.getInt('cond') - 1];
    const itemName=id=>invoke('GameServer/DataCache').items.find(x=>x.selfId===id)?.template?.name||`item ${id}`;
    const npcName=id=>invoke('GameServer/DataCache').npcs.find(x=>x.selfId===id)?.template?.name||`NPC ${id}`;
    const describe=stage=>stage?.choices ? `Consult ${[...new Set(stage.choices.map(c=>npcName(c.npc)))].join(' and ')}.` : stage?.drops
        ? `Hunt ${[...new Set(stage.drops.map(x=>npcName(x.npc)))].join(', ')}. ${objectives(stage).map(([id,n])=>`Collect ${n} ${itemName(id)}.`).join(' ')} Return to ${npcName(d.startNpc)}.`
        : `Visit ${npcName(stage?.npc||d.startNpc)}. ${(stage?.takes||[]).map(([id,n])=>`Bring ${n} ${itemName(id)}.`).join(' ')}`;
    const rewards = (state, authored = {}) => {
        let value = authored;
        if (authored.ifOwned) value = count(state, authored.ifOwned.item) ? authored.ifOwned.yes : authored.ifOwned.no;
        if (value.choices) {
            const total = value.choices.reduce((sum, c) => sum + c.weight, 0);
            let roll = Math.random() * total;
            value = value.choices.find(c => (roll -= c.weight) < 0) || value.choices.at(-1);
        }
        const gives = [...(value.items || [])];
        const adena=(value.adena||0)+(value.perItemAdena||[]).reduce((sum,[id,unit])=>sum+count(state,id)*unit,0);
        if (adena) {
            const amount = Math.floor(adena * invoke('GameServer/ProgressionRates').profile().questAdena);
            if (amount > 0) gives.push([57, amount]);
        }
        return { gives, exp: authored.exp || value.exp || 0, sp: authored.sp || value.sp || 0 };
    };
    const quest = {
        id: d.id, name: d.name, definition: d, npcs, startNpcs: [d.startNpc],
        killNpcs: [...new Set(d.stages.flatMap(s => (s.drops || []).map(x => x.npc)))],
        eventNpc: event => choices.find(c=>c.event===event)?.npc ?? exchanges.find(e=>e.event===event)?.npc ?? (event === 'start' || (event === 'quit' && d.stages.some(s=>s.type==='COLLECT')) ? d.startNpc : null),
        canTalk: state => state.isStarted() || state.isCompleted() || allowed(state),
        async onEvent(state, event) {
            const choice=state.isStarted() && stageFor(state)?.choices?.find(c=>c.event===event);
            if(choice) {
                if(!(choice.takes||[]).every(([id,n])=>count(state,id)>=n)) return null;
                await step(state,{takes:choice.takes||[],...rewards(state,choice.reward),
                    variables:{...state.variables,cond:String(choice.finish?0:choice.next),
                        ...(choice.finish?{completions:String(state.getInt('completions')+1)}:{})},
                    status:choice.finish?(d.repeatable?'created':'completed'):'started'});
                return page(d.name,choice.finish?'Your chosen reward has been delivered.':describe(stageFor(state)));
            }
            const exchange=exchanges.find(e=>e.event===event);
            if(exchange && state.isStarted() && state.getInt('cond')===exchange.cond) {
                if(!exchange.takes.every(([id,n])=>count(state,id)>=n)) return null;
                await step(state,{takes:exchange.takes,gives:exchange.gives});
                return page(d.name,'Your exchange is complete.');
            }
            if (event === 'quit' && state.isStarted() && stageFor(state)?.type === 'COLLECT') {
                await quest.onAbort(state);
                return page(d.name, 'Your task has ended.');
            }
            if (event !== 'start' || state.isStarted() || state.isCompleted() || !allowed(state)) return null;
            await step(state, { variables: { ...state.variables, cond: '1' }, gives: d.startItems || [] });
            state.playSound('ItemSound.quest_accept');
            return page(d.name, d.stages[0].text || describe(d.stages[0]));
        },
        async onTalk(state, npc) {
            const id = Number(npc.fetchSelfId());
            if (!npcs.includes(id)) return null;
            if (state.isCompleted()) return page(d.name, 'You have already completed this quest.');
            if (!state.isStarted()) return page(d.name, allowed(state) && id === d.startNpc
                ? `<a action="bypass -h quest ${d.id} start">Accept.</a>` : `This task requires level ${d.minLevel} and the appropriate race or class.`);
            const stage = stageFor(state);
            if (!stage) return null;
            const offers=exchanges.filter(e=>e.npc===id && e.cond===state.getInt('cond'));
            if(offers.length) return page(d.name,offers.map(e=>`<a action="bypass -h quest ${d.id} ${e.event}">${e.label}</a>`).join('<br>'));
            if(stage.type==='CHOICE') return page(d.name,stage.choices.filter(c=>c.npc===id)
                .map(c=>`<a action="bypass -h quest ${d.id} ${c.event}">${c.label}</a>`).join('<br>')||'Consult the people involved in your task.');
            if (stage.type === 'KILL_COLLECT') return page(d.name, `${describe(stage)}<br>${objectives(stage).map(([id,n])=>`${itemName(id)}: ${count(state,id)}/${n}`).join('<br>')}`);
            if (id !== stage.npc) return page(d.name, stage.text || 'Continue your task.');
            if (stage.type === 'COLLECT') {
                const takes=stage.prices.map(([item])=>[item,count(state,item)]).filter(([,n])=>n>0);
                if(takes.length) {
                    const total=takes.filter(([id])=>!stage.bonusItems||stage.bonusItems.includes(id)).reduce((n,[,amount])=>n+amount,0);
                    const adena=takes.reduce((n,[item,amount])=>n+amount*stage.prices.find(p=>p[0]===item)[1],0)
                        +(total >= stage.bonusAt ? stage.bonusAdena : 0);
                    await step(state,{takes,...rewards(state,{adena}),variables:{...state.variables,cashouts:String(state.getInt('cashouts')+1)}});
                }
                return page(d.name, `${describe(stage)}<br>Continue hunting, or <a action="bypass -h quest ${d.id} quit">end this task</a>.`);
            }
            const takes = [...(stage.takes || []), ...(stage.consumeAll||[]).map(id=>[id,count(state,id)]).filter(([,n])=>n>0)];
            if (!takes.every(([item, amount]) => count(state, item) >= amount)) return page(d.name, 'Bring all required quest items.');
            const finishing = stage.type === 'COMPLETE';
            const reward = finishing ? rewards(state, d.reward) : { gives: stage.gives || [] };
            await step(state, { ...reward, takes,
                variables: { ...state.variables, cond: String(finishing ? 0 : state.getInt('cond') + 1),
                    ...(finishing ? { completions: String(state.getInt('completions') + 1) } : {}) },
                status: finishing ? (d.repeatable ? 'created' : 'completed') : 'started' });
            state.playSound(finishing ? 'ItemSound.quest_finish' : 'ItemSound.quest_middle');
            return page(d.name, finishing ? 'Your task is complete. You have received your reward.' : describe(stageFor(state)));
        },
        async onKill(state, npc) {
            if (!state.isStarted()) return;
            const stage = stageFor(state);
            if (!['KILL_COLLECT','COLLECT'].includes(stage?.type)) return;
            const drop = stage.drops.find(d => d.npc === Number(npc.fetchSelfId()));
            if(!drop) return;
            const item = drop.item || stage.item;
            const cap=drop.cap || objectives(stage).find(([id])=>id===item)?.[1] || Infinity;
            if (count(state,item)>=cap || Math.random()>=drop.chance) return;
            let amount = drop.amount || 1;
            if (drop.amounts) {
                let roll = Math.random();
                amount = (drop.amounts.find(a => (roll -= a.chance) < 0) || drop.amounts.at(-1)).amount;
            }
            amount = Math.min(amount, cap - count(state, item));
            const goals=objectives(stage);
            const complete = goals.length>0 && goals.every(([id,n])=>count(state,id)+(id===item?amount:0)>=n);
            const extra=(stage.sideDrops||[]).filter(d=>Math.random()<d.chance).map(d=>[d.item,1]);
            await step(state, { gives: [[item, amount],...extra], variables: {
                ...state.variables, cond: String(state.getInt('cond') + (complete ? 1 : 0))
            } });
            state.playSound(complete ? 'ItemSound.quest_middle' : 'ItemSound.quest_itemget');
        },
        async onAbort(state) {
            const ids = [...new Set([...(d.startItems || []).map(x => x[0]), ...d.stages.flatMap(s => [s.item, ...(s.drops || []).map(x => x.item), ...(s.sideDrops||[]).map(x=>x.item), ...(s.gives || []).map(x => x[0]), ...(s.takes || []).map(x => x[0])]).filter(Boolean)])];
            await step(state, { status: 'created', variables: { completions: state.get('completions', '0'), cashouts:state.get('cashouts','0') },
                takes: ids.map(id => [id, count(state, id)]).filter(([,n]) => n > 0) });
        }
    };
    return quest;
}
module.exports = { create, validate };
