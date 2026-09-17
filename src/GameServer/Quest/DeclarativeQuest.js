// Server-authored definitions implement the existing QuestService interface.
// This is not an inventory interpreter: only reviewed local definitions enter.
const page = (name, text) => `<html><body>${name}:<br>${text}</body></html>`;
const count = (state, id) => state.session.actor.backpack.fetchItems()
    .filter(item => item.fetchSelfId() === id).reduce((sum,item) => sum + item.fetchAmount(), 0);
const TYPES = new Set(['TALK', 'DELIVER', 'KILL_COLLECT', 'COMPLETE']);

function validate(definition) {
    if (!Number.isInteger(definition.id) || !definition.name || !Number.isInteger(definition.startNpc) || !definition.stages?.length) throw new Error('Invalid quest definition');
    for (const stage of definition.stages) {
        if (!TYPES.has(stage.type)) throw new Error(`Unsupported quest stage ${stage.type}`);
        if (stage.type === 'KILL_COLLECT' && (!stage.drops?.length || !Number.isInteger(stage.count) || stage.count < 1)) throw new Error('Unresolved collection mechanic');
        for (const drop of stage.drops || []) {
            if (!Number.isInteger(drop.npc) || !Number.isFinite(drop.chance) || drop.chance <= 0 || drop.chance > 1) throw new Error('Unresolved quest drop');
        }
    }
}
function create(definition) {
    validate(definition);
    const d = definition;
    const npcs = [...new Set([d.startNpc, ...d.stages.map(s => s.npc).filter(Boolean)])];
    const allowed = state => Number(state.session.actor.fetchLevel()) >= d.minLevel &&
        (d.race === undefined || Number(state.session.actor.fetchRace()) === d.race) &&
        (!d.classes || d.classes.includes(Number(state.session.actor.fetchClassId())));
    const step = (state, options) => require('./QuestStep').apply(state, options);
    const stageFor = state => d.stages[state.getInt('cond') - 1];
    const rewards = (state, authored = {}) => {
        let value = authored;
        if (authored.ifOwned) value = count(state, authored.ifOwned.item) ? authored.ifOwned.yes : authored.ifOwned.no;
        if (value.choices) {
            const total = value.choices.reduce((sum, c) => sum + c.weight, 0);
            let roll = Math.random() * total;
            value = value.choices.find(c => (roll -= c.weight) < 0) || value.choices.at(-1);
        }
        const gives = [...(value.items || [])];
        if (value.adena) {
            const amount = Math.floor(value.adena * invoke('GameServer/ProgressionRates').profile().questAdena);
            if (amount > 0) gives.push([57, amount]);
        }
        return { gives, exp: authored.exp || value.exp || 0, sp: authored.sp || value.sp || 0 };
    };
    const quest = {
        id: d.id, name: d.name, definition: d, npcs, startNpcs: [d.startNpc],
        killNpcs: [...new Set(d.stages.flatMap(s => (s.drops || []).map(x => x.npc)))],
        eventNpc: event => event === 'start' ? d.startNpc : null,
        canTalk: state => state.isStarted() || state.isCompleted() || allowed(state),
        async onEvent(state, event) {
            if (event !== 'start' || state.isStarted() || state.isCompleted() || !allowed(state)) return null;
            await step(state, { variables: { ...state.variables, cond: '1' }, gives: d.startItems || [] });
            state.playSound('ItemSound.quest_accept');
            return page(d.name, d.stages[0].text || 'Your task has begun.');
        },
        async onTalk(state, npc) {
            const id = Number(npc.fetchSelfId());
            if (!npcs.includes(id)) return null;
            if (state.isCompleted()) return page(d.name, 'You have already completed this quest.');
            if (!state.isStarted()) return page(d.name, allowed(state) && id === d.startNpc
                ? `<a action="bypass -h quest ${d.id} start">Accept.</a>` : `This task requires level ${d.minLevel} and the appropriate race or class.`);
            const stage = stageFor(state);
            if (!stage) return null;
            if (stage.type === 'KILL_COLLECT') return page(d.name, `${stage.text || 'Quest items'}: ${count(state, stage.item)}/${stage.count}.`);
            if (id !== stage.npc) return page(d.name, stage.text || 'Continue your task.');
            const takes = stage.takes || [];
            if (!takes.every(([item, amount]) => count(state, item) >= amount)) return page(d.name, 'Bring all required quest items.');
            const finishing = stage.type === 'COMPLETE';
            const reward = finishing ? rewards(state, d.reward) : { gives: stage.gives || [] };
            await step(state, { ...reward, takes,
                variables: { ...state.variables, cond: String(finishing ? 0 : state.getInt('cond') + 1),
                    ...(finishing ? { completions: String(state.getInt('completions') + 1) } : {}) },
                status: finishing ? (d.repeatable ? 'created' : 'completed') : 'started' });
            state.playSound(finishing ? 'ItemSound.quest_finish' : 'ItemSound.quest_middle');
            return page(d.name, finishing ? 'Your task is complete. You have received your reward.' : stage.text || 'Continue your task.');
        },
        async onKill(state, npc) {
            if (!state.isStarted()) return;
            const stage = stageFor(state);
            if (stage?.type !== 'KILL_COLLECT') return;
            const drop = stage.drops.find(d => d.npc === Number(npc.fetchSelfId()));
            if (!drop || count(state, stage.item) >= stage.count || Math.random() >= drop.chance) return;
            let amount = drop.amount || 1;
            if (drop.amounts) {
                let roll = Math.random();
                amount = (drop.amounts.find(a => (roll -= a.chance) < 0) || drop.amounts.at(-1)).amount;
            }
            amount = Math.min(amount, stage.count - count(state, stage.item));
            const complete = count(state, stage.item) + amount >= stage.count;
            await step(state, { gives: [[stage.item, amount]], variables: {
                ...state.variables, cond: String(state.getInt('cond') + (complete ? 1 : 0))
            } });
            state.playSound(complete ? 'ItemSound.quest_middle' : 'ItemSound.quest_itemget');
        },
        async onAbort(state) {
            const ids = [...new Set([...(d.startItems || []).map(x => x[0]), ...d.stages.flatMap(s => [s.item, ...(s.gives || []).map(x => x[0]), ...(s.takes || []).map(x => x[0])]).filter(Boolean)])];
            await step(state, { status: 'created', variables: { completions: state.get('completions', '0') },
                takes: ids.map(id => [id, count(state, id)]).filter(([,n]) => n > 0) });
        }
    };
    return quest;
}
module.exports = { create, validate };
