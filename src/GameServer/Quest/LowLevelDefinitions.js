// Reviewed gameplay facts: supplied inventory plus pinned MOBIUS_C4 6674a607.
// NPC IDs below are L2Solo's native datapack IDs. See docs/c4/quests/runtime-sources.md.
const collect = (id, name, minLevel, startNpc, item, count, drops, reward, extra = {}) => ({
    id, name, minLevel, startNpc, repeatable: true, ...extra,
    stages: [{ type: 'KILL_COLLECT', item, count, drops: drops.map(([npc,chance,amounts]) => ({npc,chance,...(amounts ? {amounts} : {})})) },
        { type: 'COMPLETE', npc: startNpc, takes: [[item,count]] }], reward
});
const definitions = [
    collect(261, "Collector's Dream", 15, 7222, 1087, 8, [[308,1],[460,1],[466,1]], {adena:1000,exp:2000}),
    collect(262, 'Trade with the Ivory Tower', 8, 7137, 707, 10, [[400,.4],[7,.3]], {adena:3000}),
    collect(272, 'Wrath of Ancestors', 5, 7572, 1474, 50, [[319,1],[320,1]], {adena:1500}, {race:3}),
    collect(291, 'Revenge of the Redbonnet', 4, 7553, 1482, 40, [[317,1]], {
        choices:[{weight:3,items:[[1502,1]]},{weight:18,items:[[1503,1]]},
            {weight:25,items:[[1504,1]]},{weight:54,items:[[1505,1],[736,1]]}]
    }),
    collect(294, 'Covert Business', 10, 7534, 1491, 100, [
        [370,1,[{amount:2,chance:.3},{amount:3,chance:.2},{amount:4,chance:.2},{amount:1,chance:.3}]],
        [480,1,[{amount:2,chance:.3},{amount:3,chance:.3},{amount:1,chance:.4}]]
    ], {sp:600,ifOwned:{item:1508,yes:{adena:2400},no:{items:[[1508,1]]}}}, {race:4}),
    collect(258, 'Bring Wolf Pelts', 3, 7001, 702, 40, [[120,1],[442,1]], {
        choices: [[1,390],[5,29],[3,22],[4,1119],[3,426]].map(([weight,id]) => ({weight,items:[[id,1]]}))
    }),
    collect(264, 'Keen Claws', 3, 7136, 1367, 50, [
        [3,1,[{amount:2,chance:.5},{amount:4,chance:.5}]], [456,1,[{amount:1,chance:.5},{amount:2,chance:.5}]]
    ], { choices: [{weight:1,items:[[43,1]]},{weight:1,adena:1000},{weight:3,items:[[36,1]]},
        {weight:3,items:[[462,1]],adena:50},{weight:3,items:[[1061,1]]},{weight:3,items:[[48,1]]},{weight:3,items:[[35,1]]}] }),
    collect(271, 'Proof of Valor', 4, 7577, 1473, 50, [[475,1,[{amount:2,chance:.25},{amount:1,chance:.75}]]],
        {choices:[{weight:1,items:[[1507,1]]},{weight:9,items:[[1506,1]]}]}, {race:3}),
    collect(277, "Gatekeeper's Offering", 15, 7576, 1572, 20, [[333,.5]], {items:[[1658,2]]}),
    collect(295, 'Dreaming of the Skies', 11, 7536, 1492, 50, [[153,1,[{amount:1,chance:.74},{amount:2,chance:.26}]]],
        {sp:500,ifOwned:{item:1509,yes:{adena:2400},no:{items:[[1509,1]]}}}),
    collect(297, "Gatekeeper's Favor", 15, 7540, 1573, 20, [[521,.5]], {items:[[1659,2]]}),
    collect(303, 'Collect Arrowheads', 10, 7029, 963, 10, [[361,.4]], {adena:1000,exp:2000}),
    collect(313, 'Collect Spores', 8, 7150, 1118, 10, [[509,.4]], {adena:3500}),
    collect(319, 'Scent of Death', 11, 7138, 1045, 5, [[15,.2],[20,.2]], {adena:3350,items:[[1060,1]]}),
    collect(320, 'Bones Tell the Future', 10, 7359, 809, 10, [[517,.18],[518,.2]], {adena:8470}, {race:2}),
    collect(324, 'Sweetest Venom', 18, 7351, 1077, 10, [[34,.22],[38,.23],[43,.25]], {adena:5810}),
    collect(341, 'Hunting for Wild Beasts', 20, 7078, 4259, 20, [[21,.5],[203,.9],[310,.5],[335,.7]], {adena:3710})
];
module.exports = definitions;
