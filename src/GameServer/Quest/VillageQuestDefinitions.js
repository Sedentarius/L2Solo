// Reviewed C4 first-village quests (Q152, Q154, Q157, Q159, Q162, Q163, Q166,
// Q167, Q169), moved onto shared atomic quest steps.
//
// Facts from the pinned MOBIUS_C4 6674a607 handlers. NPC ids are L2Solo native
// datapack ids (reference id - 23000); mob ids are reference id - 20000, or
// reference id - 22000 for the 27xxx quest-monster range.

module.exports = [
    // Harris sends the shards to Altran, who forges the tool box.
    { id: 152, name: 'Shards of Golem', minLevel: 10, startNpc: 7035, repeatable: false,
        startItems: [[1008, 1]], questItems: [1008, 1009, 1010, 1011],
        stages: [
            { type: 'DELIVER', npc: 7283, takes: [[1008, 1]], gives: [[1009, 1]] },
            { type: 'KILL_COLLECT', item: 1010, count: 5, drops: [{ npc: 16, chance: .3 }] },
            { type: 'DELIVER', npc: 7283, takes: [[1010, 5]], gives: [[1011, 1]] },
            { type: 'COMPLETE', npc: 7035, takes: [[1009, 1], [1011, 1]] }
        ], reward: { items: [[23, 1]] } },

    // Rockswell's daughter's doll: fur, then yarn, then the doll itself.
    { id: 154, name: 'Sacrifice to the Sea', minLevel: 2, startNpc: 7312, repeatable: false,
        questItems: [1032, 1033, 1034],
        stages: [
            { type: 'KILL_COLLECT', item: 1032, count: 10,
                drops: [481, 544, 545].map(npc => ({ npc, chance: .4 })) },
            { type: 'DELIVER', npc: 7051, takes: [[1032, 10]], gives: [[1033, 1]] },
            { type: 'DELIVER', npc: 7055, takes: [[1033, 1]], gives: [[1034, 1]] },
            { type: 'COMPLETE', npc: 7312, takes: [[1034, 1]] }
        ], reward: { items: [[113, 1]] } },

    // Wilford wants his smuggled ore back from the toads.
    { id: 157, name: 'Recover Smuggled Goods', minLevel: 5, startNpc: 7005, repeatable: false,
        questItems: [1024],
        stages: [
            { type: 'KILL_COLLECT', item: 1024, count: 20, drops: [{ npc: 121, chance: .4 }] },
            { type: 'COMPLETE', npc: 7005, takes: [[1024, 20]] }
        ], reward: { items: [[20, 1]] } },

    // Asterios issues two charms; the second one samples five doses of dust.
    { id: 159, name: 'Protect the Water Source', minLevel: 12, race: 1, startNpc: 7154, repeatable: false,
        startItems: [[1071, 1]], questItems: [1035, 1071, 1072],
        stages: [
            { type: 'KILL_COLLECT', item: 1035, count: 1, drops: [{ npc: 5017, chance: .4 }] },
            { type: 'DELIVER', npc: 7154, takes: [[1035, 1], [1071, 1]], gives: [[1072, 1]] },
            { type: 'KILL_COLLECT', item: 1035, count: 5, drops: [{ npc: 5017, chance: .4 }] },
            { type: 'COMPLETE', npc: 7154, takes: [[1035, 5], [1072, 1]] }
        ], reward: { adena: 18250 } },

    // Unoren pays for proof that the fortress dead are still walking.
    // Dark Elves are the only race the reference turns away here.
    { id: 162, name: 'Curse of the Underground Fortress', minLevel: 12, races: [0, 1, 3, 4],
        startNpc: 7147, repeatable: false, questItems: [1158, 1159],
        stages: [
            { type: 'KILL_COLLECT', objectives: [[1159, 3], [1158, 10]], drops: [
                { npc: 33, item: 1159, chance: .25 }, { npc: 345, item: 1159, chance: .26 },
                { npc: 371, item: 1159, chance: .23 },
                { npc: 463, item: 1158, chance: .25 }, { npc: 464, item: 1158, chance: .23 },
                { npc: 504, item: 1158, chance: .26 }] },
            { type: 'COMPLETE', npc: 7147, takes: [[1159, 3], [1158, 10]] }
        ], reward: { items: [[625, 1]], adena: 24000 } },

    // Starden's four poems drop independently from the same two Baraq orcs.
    { id: 163, name: "Legacy of the Poet", minLevel: 11, races: [0, 1, 3, 4],
        startNpc: 7220, repeatable: false, questItems: [1038, 1039, 1040, 1041],
        stages: [
            { type: 'KILL_COLLECT', objectives: [[1038, 1], [1039, 1], [1040, 1], [1041, 1]],
                drops: [372, 373].map(npc => ({ npc, items: [
                    { item: 1038, chance: .1 }, { item: 1039, chance: .2 },
                    { item: 1040, chance: .2 }, { item: 1041, chance: .4 }] })) },
            { type: 'COMPLETE', npc: 7220, takes: [[1038, 1], [1039, 1], [1040, 1], [1041, 1]] }
        ], reward: { adena: 13890 } },

    // Three acolytes each contribute one offering for Undrias's ceremony.
    { id: 166, name: 'Mass of Darkness', minLevel: 2, race: 2, startNpc: 7130, repeatable: false,
        startItems: [[1088, 1]], questItems: [1088, 1089, 1090, 1091],
        stages: [
            { type: 'GATHER', objectives: [[1089, 1], [1090, 1], [1091, 1]], sources: [
                { npc: 7135, gives: [[1089, 1]] },
                { npc: 7139, gives: [[1090, 1]] },
                { npc: 7143, gives: [[1091, 1]] }] },
            { type: 'COMPLETE', npc: 7130, takes: [[1088, 1], [1089, 1], [1090, 1], [1091, 1]] }
        ], reward: { adena: 500 } },

    // Haprock either forwards Carlon's letter to Norman, or buys it outright.
    { id: 167, name: 'Dwarven Kinship', minLevel: 15, startNpc: 7350, repeatable: false,
        startItems: [[1076, 1]], questItems: [1076, 1106],
        stages: [
            { type: 'CHOICE', npc: 7255, choices: [
                { event: 'haprock', npc: 7255, label: 'Forward the letter to Norman.',
                    takes: [[1076, 1]], reward: { items: [[1106, 1]], adena: 2000 }, next: 2 },
                { event: 'haprock_sell', npc: 7255, label: 'Sell the letter to Haprock.',
                    takes: [[1076, 1]], reward: { adena: 3000 }, finish: true } ] },
            // The reference pays nothing more at Haprock once the letter is
            // forwarded: only Norman can settle the delivery.
            { type: 'COMPLETE', npc: 7210, event: 'norman_finish', takes: [[1106, 1]] }
        ], reward: { adena: 20000 } },

    // Vlasty pays a flat fee plus a bounty on every cracked skull handed in.
    { id: 169, name: 'Offspring of Nightmares', minLevel: 15, race: 2, startNpc: 7145, repeatable: false,
        questItems: [1030, 1031],
        stages: [
            // The reference rolls for the perfect skull first and, when that tier
            // does not apply, rolls again for a cracked one.
            { type: 'KILL_COLLECT', objectives: [[1031, 1]], keepDropping: true, drops: [105, 25].map(npc => ({ npc,
                cascade: [{ item: 1031, chance: .2 }, { item: 1030, chance: .3 }] })) },
            { type: 'COMPLETE', npc: 7145, takes: [[1031, 1]], consumeAll: [1030] }
        ],
        // 17000 plus 20 adena for each cracked skull also handed over.
        reward: { items: [[31, 1]], adena: 17000, perItemAdena: [[1030, 20]] } }
];
