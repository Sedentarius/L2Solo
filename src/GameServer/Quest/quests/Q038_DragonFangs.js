// Q38 Dragon Fangs. Source: MOBIUS_C4 6674a607 Q00038_DragonFangs.
//
// NPC ids are L2Solo native datapack ids (reference id - 23000); mob ids are
// the reference id - 20000, which also covers the 21xxx Langk variants
// (21100 -> 1100, 21101 -> 1101).
//
// Two hunts with one errand between them: a hundred feather ornaments that drop
// on every kill, then a letter carried between Iris and Rohmer, then fifty
// dragon teeth at half chance. Iris pays one of four reward sets, drawn evenly.
const LUIS = 7386;
const IRIS = 7034;
const ROHMER = 7344;

const FEATHER = 7173;
const TOOTH_OF_TOTEM = 7174;
const TOOTH_OF_DRAGON = 7175;
const LETTER_OF_IRIS = 7176;
const LETTER_OF_ROHMER = 7177;

// [target, item, required, chance]; the reference expresses the chance out of
// one million, so a feather always drops and a tooth drops half the time.
const DROPS = [
    { npcs: [1100, 357], cond: 1, item: FEATHER, required: 100, chance: 1 },
    { npcs: [1101, 356], cond: 6, item: TOOTH_OF_DRAGON, required: 50, chance: 0.5 }
];
// [item, adena]
const REWARDS = [[45, 5200], [627, 1500], [1123, 3200], [605, 3200]];

const MIN_LEVEL = 19;

const step = (state, options) => require('../QuestStep').apply(state, options);
const count = (state, selfId) => state.session.actor.backpack.fetchItems()
    .filter((item) => item.fetchSelfId() === selfId)
    .reduce((sum, item) => sum + item.fetchAmount(), 0);
const adena = (amount) => Math.floor(amount * invoke('GameServer/ProgressionRates').profile().questAdena);
const page = (who, text, action = '') => `<html><body>${who}:<br>${text}<br><br>${action}</body></html>`;
const link = (event, label) => `<a action="bypass -h quest 38 ${event}">${label}</a>`;

// Each hand-over consumes what it is given and advances in the same commit.
const HANDOVERS = {
    feathers: { npc: LUIS, cond: 2, takes: [[FEATHER, 100]], gives: [[TOOTH_OF_TOTEM, 1]],
        text: 'Take the totem tooth to Iris in Gludio.' },
    iris: { npc: IRIS, cond: 3, takes: [[TOOTH_OF_TOTEM, 1]], gives: [[LETTER_OF_IRIS, 1]],
        text: 'Carry this letter to Rohmer.' },
    rohmer: { npc: ROHMER, cond: 4, takes: [[LETTER_OF_IRIS, 1]], gives: [[LETTER_OF_ROHMER, 1]],
        text: 'Take my reply back to Iris.' },
    back: { npc: IRIS, cond: 5, takes: [[LETTER_OF_ROHMER, 1]], gives: [],
        text: 'Bring me fifty Teeth of Dragon.' }
};

module.exports = {
    id: 38,
    name: 'Dragon Fangs',
    npcs: [LUIS, IRIS, ROHMER],
    startNpcs: [LUIS],
    killNpcs: DROPS.flatMap((drop) => drop.npcs),
    eventNpc: (event) => (event === 'start' ? LUIS : event === 'reward' ? IRIS : HANDOVERS[event]?.npc ?? null),
    canTalk: () => true,

    async onEvent(state, event) {
        if (event === 'start') {
            if (state.isStarted() || state.isCompleted()) return null;
            if (Number(state.session.actor.fetchLevel()) < MIN_LEVEL) return null;
            await step(state, { variables: { ...state.variables, cond: '1' } });
            state.playSound('ItemSound.quest_accept');
            return page('Luis', 'Bring me a hundred Feather Ornaments.');
        }
        if (!state.isStarted()) return null;
        const cond = state.getInt('cond');

        const handover = HANDOVERS[event];
        if (handover) {
            if (cond !== handover.cond) return null;
            if (!handover.takes.every(([selfId, amount]) => count(state, selfId) >= amount)) return null;
            await step(state, {
                takes: handover.takes, gives: handover.gives,
                variables: { ...state.variables, cond: String(cond + 1) }
            });
            state.playSound('ItemSound.quest_middle');
            return page(handover.npc === LUIS ? 'Luis' : handover.npc === IRIS ? 'Iris' : 'Rohmer', handover.text);
        }

        if (event === 'reward') {
            if (cond !== 7 || count(state, TOOTH_OF_DRAGON) < 50) return null;
            const [item, money] = REWARDS[Math.floor(Math.random() * REWARDS.length)];
            await step(state, {
                takes: [[TOOTH_OF_DRAGON, 50]], gives: [[item, 1], [57, adena(money)]],
                status: 'completed', variables: { ...state.variables, cond: '0' }
            });
            state.playSound('ItemSound.quest_finish');
            return page('Iris', 'The dragon is answered. Take this with my thanks.');
        }
        return null;
    },

    async onTalk(state, npc) {
        const id = Number(npc.fetchSelfId());
        if (!this.npcs.includes(id)) return null;
        if (state.isCompleted()) return page('Luis', 'You have already done this for us.');
        if (!state.isStarted()) {
            if (id !== LUIS) return null;
            if (Number(state.session.actor.fetchLevel()) < MIN_LEVEL) {
                return page('Luis', `This is no errand for anyone below level ${MIN_LEVEL}.`);
            }
            return page('Luis', 'The lizardmen wear the feathers of something far worse.',
                link('start', 'Ask what he needs.'));
        }
        // A database written before the drop and its cond advance became one
        // transaction can hold a finished collection at the old cond. Settling
        // it here lets such a character continue instead of being stuck.
        const stalled = DROPS.find((drop) => drop.cond === state.getInt('cond')
            && count(state, drop.item) >= drop.required);
        if (stalled) {
            await step(state, { variables: { ...state.variables, cond: String(stalled.cond + 1) } });
            return this.onTalk(state, npc);
        }
        const cond = state.getInt('cond');

        if (id === LUIS) {
            if (cond === 1) return page('Luis', `Feather Ornament: ${count(state, FEATHER)}/100.`);
            if (cond === 2) {
                return page('Luis', 'You have the feathers.', link('feathers', 'Hand them over.'));
            }
            return page('Luis', 'Iris is the one to speak to now.');
        }

        if (id === ROHMER) {
            if (cond === 4) return page('Rohmer', "Iris has written to me.", link('rohmer', 'Deliver the letter.'));
            return page('Rohmer', 'We have nothing to discuss.');
        }

        // IRIS
        if (cond === 3) return page('Iris', 'That tooth is no totem.', link('iris', 'Show her the tooth.'));
        if (cond === 5) return page('Iris', "Rohmer has answered.", link('back', 'Hand over the reply.'));
        if (cond === 6) return page('Iris', `Tooth of Dragon: ${count(state, TOOTH_OF_DRAGON)}/50.`);
        if (cond === 7) return page('Iris', 'Fifty teeth, exactly as I asked.', link('reward', 'Hand them over.'));
        return page('Iris', 'Finish what Luis asked of you first.');
    },

    async onKill(state, npc) {
        if (!state.isStarted()) return;
        const id = Number(npc.fetchSelfId());
        const cond = state.getInt('cond');
        const drop = DROPS.find((entry) => entry.cond === cond && entry.npcs.includes(id));
        if (!drop) return;
        const held = count(state, drop.item);
        if (held >= drop.required) return;
        if (Math.random() >= drop.chance) return;
        const complete = held + 1 >= drop.required;
        // The token and the cond it completes commit together.
        await step(state, {
            gives: [[drop.item, 1]],
            variables: { ...state.variables, cond: String(cond + (complete ? 1 : 0)) }
        });
        state.playSound(complete ? 'ItemSound.quest_middle' : 'ItemSound.quest_itemget');
    }
};
