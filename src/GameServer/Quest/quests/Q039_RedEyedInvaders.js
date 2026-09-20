// Q39 Red-Eyed Invaders. Source: MOBIUS_C4 6674a607 Q00039_RedEyedInvaders.
//
// NPC ids are L2Solo native datapack ids (reference id - 23000); mob ids are
// the reference id - 20000.
//
// Two collections, each of two tokens, and each token has its own target and
// its own chance. Bathis only moves on when BOTH tokens of the current pair are
// full, which is why the counts are checked as a pair rather than as a sum.
const BABENCO = 7334;
const BATHIS = 7332;

const MAILLE_LIZARDMAN = 919;
const MAILLE_LIZARDMAN_SCOUT = 920;
const MAILLE_LIZARDMAN_GUARD = 921;
const ARANEID = 925;

const BLACK_BONE_NECKLACE = 7178;
const RED_BONE_NECKLACE = 7179;
const INCENSE_POUCH = 7180;
const GEM_OF_MAILLE = 7181;

const LURE = 6521;
const BABY_DUCK_ROD = 6529;
const FISHING_SHOT = 6535;

const MIN_LEVEL = 20;

// Each phase names the pair it needs, how many of each, and which target drops
// which token at what chance. The chances are the reference's own, expressed
// there out of one million.
const PHASES = [
    {
        cond: 2, done: 3, required: 100, items: [BLACK_BONE_NECKLACE, RED_BONE_NECKLACE],
        drops: {
            [MAILLE_LIZARDMAN_GUARD]: { item: RED_BONE_NECKLACE, chance: 1 },
            [MAILLE_LIZARDMAN]: { item: BLACK_BONE_NECKLACE, chance: 1 },
            [MAILLE_LIZARDMAN_SCOUT]: { item: BLACK_BONE_NECKLACE, chance: 1 }
        }
    },
    {
        cond: 4, done: 5, required: 30, items: [INCENSE_POUCH, GEM_OF_MAILLE],
        drops: {
            [ARANEID]: { item: GEM_OF_MAILLE, chance: 0.5 },
            [MAILLE_LIZARDMAN_GUARD]: { item: INCENSE_POUCH, chance: 0.3 },
            [MAILLE_LIZARDMAN_SCOUT]: { item: INCENSE_POUCH, chance: 0.25 }
        }
    }
];

const step = (state, options) => require('../QuestStep').apply(state, options);
const count = (state, selfId) => state.session.actor.backpack.fetchItems()
    .filter((item) => item.fetchSelfId() === selfId)
    .reduce((sum, item) => sum + item.fetchAmount(), 0);
const page = (who, text, action = '') => `<html><body>${who}:<br>${text}<br><br>${action}</body></html>`;
const link = (event, label) => `<a action="bypass -h quest 39 ${event}">${label}</a>`;
const tally = (state, phase) => phase.items
    .map((selfId) => `${count(state, selfId)}/${phase.required}`).join(', ');

module.exports = {
    id: 39,
    name: 'Red-Eyed Invaders',
    npcs: [BABENCO, BATHIS],
    startNpcs: [BABENCO],
    killNpcs: [MAILLE_LIZARDMAN, MAILLE_LIZARDMAN_SCOUT, MAILLE_LIZARDMAN_GUARD, ARANEID],
    eventNpc: (event) => (event === 'start' ? BABENCO : BATHIS),
    canTalk: () => true,

    async onEvent(state, event) {
        if (event === 'start') {
            if (state.isStarted() || state.isCompleted()) return null;
            if (Number(state.session.actor.fetchLevel()) < MIN_LEVEL) return null;
            await step(state, { variables: { ...state.variables, cond: '1' } });
            state.playSound('ItemSound.quest_accept');
            return page('Babenco', 'Bathis in Gludin knows what the Maille Lizardmen are doing.');
        }
        if (!state.isStarted()) return null;
        const cond = state.getInt('cond');

        if (event === 'bathis' && cond === 1) {
            await step(state, { variables: { ...state.variables, cond: '2' } });
            state.playSound('ItemSound.quest_middle');
            return page('Bathis', 'Bring me a hundred necklaces of each colour.');
        }
        if (event === 'necklaces' && cond === 3) {
            // Both stacks are surrendered in the transaction that opens the
            // second hunt, so neither can be carried into it.
            await step(state, {
                takes: [[BLACK_BONE_NECKLACE, count(state, BLACK_BONE_NECKLACE)],
                    [RED_BONE_NECKLACE, count(state, RED_BONE_NECKLACE)]].filter(([, n]) => n > 0),
                variables: { ...state.variables, cond: '4' }
            });
            state.playSound('ItemSound.quest_middle');
            return page('Bathis', 'Now thirty incense pouches and thirty gems.');
        }
        if (event === 'finish' && cond === 5) {
            await step(state, {
                takes: [[INCENSE_POUCH, count(state, INCENSE_POUCH)],
                    [GEM_OF_MAILLE, count(state, GEM_OF_MAILLE)]].filter(([, n]) => n > 0),
                gives: [[LURE, 60], [BABY_DUCK_ROD, 1], [FISHING_SHOT, 500]],
                status: 'completed', variables: { ...state.variables, cond: '0' }
            });
            state.playSound('ItemSound.quest_finish');
            return page('Bathis', 'That is what I needed. Take these and go fishing.');
        }
        return null;
    },

    async onTalk(state, npc) {
        const id = Number(npc.fetchSelfId());
        if (!this.npcs.includes(id)) return null;
        if (state.isCompleted()) return page('Babenco', 'You have already dealt with the invaders.');
        if (!state.isStarted()) {
            if (id !== BABENCO) return null;
            if (Number(state.session.actor.fetchLevel()) < MIN_LEVEL) {
                return page('Babenco', `Come back when you have reached level ${MIN_LEVEL}.`);
            }
            return page('Babenco', 'Red-eyed lizardmen have been seen on the plains.',
                link('start', 'Ask what they want.'));
        }
        // Same recovery as Q38: a pair that is already full advances here rather
        // than leaving a legacy character stranded at the collecting cond.
        const stalled = PHASES.find((phase) => phase.cond === state.getInt('cond')
            && phase.items.every((selfId) => count(state, selfId) >= phase.required));
        if (stalled) {
            await step(state, { variables: { ...state.variables, cond: String(stalled.done) } });
            return this.onTalk(state, npc);
        }
        const cond = state.getInt('cond');
        if (id === BABENCO) return page('Babenco', 'Bathis is the one handling this now.');

        if (cond === 1) return page('Bathis', 'Babenco sent you.', link('bathis', 'Offer to help.'));
        if (cond === 2) return page('Bathis', `Bone necklaces: ${tally(state, PHASES[0])}.`);
        if (cond === 3) return page('Bathis', 'You have both hundreds.', link('necklaces', 'Hand them over.'));
        if (cond === 4) return page('Bathis', `Pouches and gems: ${tally(state, PHASES[1])}.`);
        return page('Bathis', 'You have everything I asked for.', link('finish', 'Hand it all over.'));
    },

    async onKill(state, npc) {
        if (!state.isStarted()) return;
        const cond = state.getInt('cond');
        const phase = PHASES.find((entry) => entry.cond === cond);
        if (!phase) return;
        const drop = phase.drops[Number(npc.fetchSelfId())];
        if (!drop) return;
        if (count(state, drop.item) >= phase.required) return;
        if (Math.random() >= drop.chance) return;
        // The pair only advances when both stacks are full, which is the
        // reference's own check on the other token of the pair.
        const other = phase.items.find((selfId) => selfId !== drop.item);
        const complete = count(state, drop.item) + 1 >= phase.required
            && count(state, other) >= phase.required;
        await step(state, {
            gives: [[drop.item, 1]],
            variables: { ...state.variables, cond: String(complete ? phase.done : cond) }
        });
        state.playSound(complete ? 'ItemSound.quest_middle' : 'ItemSound.quest_itemget');
    }
};
