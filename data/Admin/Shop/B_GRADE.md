# B-grade equipment catalog

`shop.json` lists complete Zubei, Avadon, Blue Wolf and Doom heavy, light
and robe sets, their shields, and Adamantite / Black Ore jewelry (55 items).
The explicit list excludes legacy unused templates from the broad armor table.
Gloves and boots use the specialized heavy/light/robe IDs required by
`C4ArmorSets`, rather than their generic or sealed versions.

The 24 added templates in `data/Items/Armors/c4_b_grade.json` come from
[L2J Lisvus](https://gitlab.com/TheDnR/l2j-lisvus) revision
`fdc7e33af5d69067b41a6ee7cc7c07fe7aa35975`,
`datapack/data/stats/items/5700-5799.xml` (IDs 5710–5740, excluding sealed items).
Names, weight, price, P.Def, grade and crystal count are copied from that source.
The local slot mapping is gloves = 9, feet = 12.
