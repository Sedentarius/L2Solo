// Reviewed C4 starter quests (Q1-Q10, Q45-Q49), moved onto shared atomic steps.
// Facts are taken from the pinned MOBIUS_C4 6674a607 handlers; NPC ids below are
// L2Solo native datapack ids (reference id - 23000). Items keep reference ids.
// See docs/c4/quests/runtime-sources.md for the reviewed deviations.

// The five race starter routes only differ by race and their escape scroll.
const traveler = (id, name, race, startNpc, stages, escape) => ({
    id, name, minLevel: 3, race, startNpc, repeatable: false,
    stages, reward: { items: [[7570, 1], [escape, 1]] }
});
// Q45-Q49 are the same six-step Galladucci errand; only race and scroll differ.
const GALLADUCCI = 7097, GENTLER = 7094, SANDRA = 7090, DUSTIN = 7116;
const ORDER_1 = 7563, ORDER_2 = 7564, ORDER_3 = 7565;
const HILT = 7568, POWDER = 7567, NECKLACE = 7566, MARK = 7570;
const errand = (id, name, race, escape) => ({
    id, name, minLevel: 3, race, startNpc: GALLADUCCI, repeatable: false,
    // The reference gates the offer on already holding the Mark of Traveler.
    requiredAny: [MARK], startItems: [[ORDER_1, 1]],
    questItems: [ORDER_1, ORDER_2, ORDER_3, HILT, POWDER, NECKLACE],
    stages: [
        { type: 'DELIVER', npc: GENTLER, event: 'hilt', takes: [[ORDER_1, 1]], gives: [[HILT, 1]],
            recover: { npc: GALLADUCCI, gives: [[ORDER_1, 1]] } },
        { type: 'DELIVER', npc: GALLADUCCI, event: 'order2', takes: [[HILT, 1]], gives: [[ORDER_2, 1]] },
        { type: 'DELIVER', npc: SANDRA, event: 'powder', takes: [[ORDER_2, 1]], gives: [[POWDER, 1]] },
        { type: 'DELIVER', npc: GALLADUCCI, event: 'order3', takes: [[POWDER, 1]], gives: [[ORDER_3, 1]] },
        { type: 'DELIVER', npc: DUSTIN, event: 'necklace', takes: [[ORDER_3, 1]], gives: [[NECKLACE, 1]] },
        // The reference destroys every Mark of Traveler here. One is consumed
        // instead, which cannot be farmed: the errand completes only once.
        { type: 'COMPLETE', npc: GALLADUCCI, event: 'reward', takes: [[NECKLACE, 1], [MARK, 1]] }
    ],
    reward: { items: [[escape, 1]] }
});

module.exports = [
    { id: 1, name: 'Letters of Love', minLevel: 2, startNpc: 7048, repeatable: false,
        startItems: [[687, 1]], questItems: [687, 688, 1079, 1080],
        stages: [
            { type: 'DELIVER', npc: 7006, takes: [[687, 1]], gives: [[688, 1]] },
            { type: 'DELIVER', npc: 7048, takes: [[688, 1]], gives: [[1079, 1]] },
            { type: 'DELIVER', npc: 7033, takes: [[1079, 1]], gives: [[1080, 1]] },
            { type: 'COMPLETE', npc: 7048, takes: [[1080, 1]] }
        ], reward: { items: [[906, 1]] } },

    // Human or Elf. Arujien offers either the poetry errand or an early payout.
    { id: 2, name: 'What Women Want', minLevel: 2, races: [0, 1], startNpc: 7223, repeatable: false,
        startItems: [[1092, 1]], questItems: [1092, 1093, 1094, 689, 693],
        stages: [
            { type: 'DELIVER', npc: 7146, takes: [[1092, 1]], gives: [[1093, 1]] },
            { type: 'DELIVER', npc: 7150, takes: [[1093, 1]], gives: [[1094, 1]] },
            { type: 'CHOICE', npc: 7223, choices: [
                { event: 'poetry', npc: 7223, label: 'Take the poetry book to Greenis.',
                    takes: [[1094, 1]], reward: { items: [[689, 1]] }, next: 4 },
                { event: 'reward', npc: 7223, label: 'Hand over the reply and finish.',
                    takes: [[1094, 1]], reward: { adena: 450 }, finish: true } ] },
            { type: 'DELIVER', npc: 7157, takes: [[689, 1]], gives: [[693, 1]] },
            { type: 'COMPLETE', npc: 7223, takes: [[693, 1]] }
        ],
        // The reference awards Mystic's Earring 113 here, not beginner potions.
        reward: { items: [[113, 1]] } },

    // Dark Elf only. Each corpse yields its one token; duplicates never drop.
    { id: 3, name: 'Will the Seal be Broken?', minLevel: 16, race: 2, startNpc: 7141, repeatable: false,
        stages: [
            { type: 'KILL_COLLECT', objectives: [[1081, 1], [1082, 1], [1083, 1]], drops: [
                { npc: 31, chance: 1, item: 1081 },
                { npc: 41, chance: 1, item: 1082 }, { npc: 46, chance: 1, item: 1082 },
                { npc: 48, chance: 1, item: 1083 }, { npc: 52, chance: 1, item: 1083 },
                { npc: 57, chance: 1, item: 1083 } ] },
            { type: 'COMPLETE', npc: 7141, takes: [[1081, 1], [1082, 1], [1083, 1]] }
        ], reward: { items: [[956, 1]] } },

    // Orc only. Six elders each hand over one offering, in any order.
    { id: 4, name: "Long Live the Pa'agrio Lord", minLevel: 2, race: 3, startNpc: 7578, repeatable: false,
        stages: [
            { type: 'GATHER', objectives: [[1541, 1], [1542, 1], [1543, 1], [1544, 1], [1545, 1], [1546, 1]],
                sources: [
                    { npc: 7566, gives: [[1541, 1]] }, { npc: 7585, gives: [[1542, 1]] },
                    { npc: 7562, gives: [[1543, 1]] }, { npc: 7560, gives: [[1544, 1]] },
                    { npc: 7559, gives: [[1545, 1]] }, { npc: 7587, gives: [[1546, 1]] } ] },
            { type: 'COMPLETE', npc: 7578,
                takes: [[1541, 1], [1542, 1], [1543, 1], [1544, 1], [1545, 1], [1546, 1]] }
        ], reward: { items: [[4, 1]] } },

    // Four suppliers; Brunon only trades his pick for Bolter's smelly socks.
    { id: 5, name: "Miner's Favor", minLevel: 2, startNpc: 7554, repeatable: false,
        startItems: [[1547, 1], [1552, 1]], questItems: [1547, 1548, 1549, 1550, 1551, 1552],
        stages: [
            { type: 'GATHER', objectives: [[1548, 1], [1549, 1], [1550, 1], [1551, 1]],
                sources: [
                    { npc: 7517, gives: [[1550, 1]] }, { npc: 7518, gives: [[1548, 1]] },
                    { npc: 7520, gives: [[1551, 1]] },
                    { npc: 7526, gives: [[1549, 1]], takes: [[1552, 1]], event: 'pick',
                        label: 'Give Brunon the smelly socks.' } ] },
            { type: 'COMPLETE', npc: 7554,
                takes: [[1547, 1], [1548, 1], [1549, 1], [1550, 1], [1551, 1]] }
        ], reward: { items: [[906, 1]] } },

    traveler(6, 'Step into the Future', 0, 7006, [
        { type: 'DELIVER', npc: 7033, event: 'letter', gives: [[7571, 1]] },
        { type: 'DELIVER', npc: 7311, event: 'deliver', takes: [[7571, 1]],
            recover: { npc: 7033, event: 'letter', gives: [[7571, 1]] } },
        { type: 'COMPLETE', npc: 7006, event: 'reward' }
    ], 7559),

    traveler(7, 'A Trip Begins', 1, 7146, [
        { type: 'DELIVER', npc: 7148, event: 'recommendation', gives: [[7572, 1]] },
        { type: 'DELIVER', npc: 7154, event: 'deliver', takes: [[7572, 1]],
            recover: { npc: 7148, event: 'recommendation', gives: [[7572, 1]] } },
        { type: 'COMPLETE', npc: 7146, event: 'reward' }
    ], 7559),

    traveler(8, 'An Adventure Begins', 2, 7134, [
        { type: 'DELIVER', npc: 7355, event: 'note', gives: [[7573, 1]] },
        { type: 'DELIVER', npc: 7144, event: 'deliver', takes: [[7573, 1]],
            recover: { npc: 7355, event: 'note', gives: [[7573, 1]] } },
        { type: 'COMPLETE', npc: 7134, event: 'reward' }
    ], 7559),

    // The Orc route ends at Tamil and hands out the Giran scroll variant 7126.
    traveler(9, 'Into the City of Humans', 3, 7583, [
        { type: 'DELIVER', npc: 7571, event: 'council' },
        { type: 'COMPLETE', npc: 7576, event: 'reward' }
    ], 7126),

    traveler(10, 'Into the World', 4, 7533, [
        { type: 'DELIVER', npc: 7520, event: 'necklace', gives: [[7574, 1]] },
        { type: 'DELIVER', npc: 7650, event: 'appraise', takes: [[7574, 1]],
            recover: { npc: 7520, event: 'necklace', gives: [[7574, 1]] } },
        { type: 'DELIVER', npc: 7520, event: 'report' },
        { type: 'COMPLETE', npc: 7533, event: 'reward' }
    ], 7559),

    errand(45, 'To Talking Island', 0, 7554),
    errand(46, 'Once More in the Arms of the Mother Tree', 1, 7555),
    errand(47, 'Into the Dark Elven Forest', 2, 7556),
    errand(48, 'To the Immortal Plateau', 3, 7557),
    errand(49, 'The Road Home', 4, 7558)
];
