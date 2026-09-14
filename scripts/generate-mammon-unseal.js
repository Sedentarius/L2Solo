// Import C4 unsealing recipes and missing armor templates from a Lisvus checkout.
const fs = require('fs');
const path = require('path');
const root = process.argv[2] || 'tmp/vendor/l2j-lisvus/datapack';
const lists = ['1002', '81262504', '81262505', '81262506', '81262507'];
const xmlItems = new Map();
for (const file of fs.readdirSync(path.join(root, 'data/stats/items'))) {
    if (!file.endsWith('.xml')) continue;
    const xml = fs.readFileSync(path.join(root, 'data/stats/items', file), 'utf8');
    for (const m of xml.matchAll(/<item id="(\d+)" name="([^"]+)" type="Armor">([\s\S]*?)<\/item>/g)) {
        xmlItems.set(Number(m[1]), { name: m[2].replace(/&amp;/g, '&').replace(/&apos;/g, "'"), body: m[3] });
    }
}
const recipes = [];
for (const list of lists) {
    const xml = fs.readFileSync(path.join(root, `data/multisell/${list}.xml`), 'utf8');
    for (const m of xml.matchAll(/<item id="\d+">([\s\S]*?)<\/item>/g)) {
        const sourceId = [...m[1].matchAll(/<ingredient id="(\d+)"/g)].map(v => Number(v[1])).find(id => ![57, 5575].includes(id));
        const productId = Number(/<production id="(\d+)"/.exec(m[1])[1]);
        const name = xmlItems.get(productId).name;
        const style = /Heavy Armor/i.test(name) ? 'heavy' : /Light Armor/i.test(name) ? 'light' : / - Robe/i.test(name) ? 'robe' : null;
        recipes.push({ sourceId, productId, style });
    }
}
const existing = new Set();
for (const file of fs.readdirSync('data/Items/Armors')) {
    if (file.endsWith('.json') && file !== 'c4_unsealed.json') {
        const entries = JSON.parse(fs.readFileSync(`data/Items/Armors/${file}`));
        for (const item of Array.isArray(entries) ? entries : []) existing.add(item.selfId);
    }
}
const slots = { head:6, gloves:9, feet:12, chest:10, legs:11, fullarmor:15, lhand:8, neck:3, 'rear;lear':1 };
slots['rfinger;lfinger'] = 4;
const items = [...new Set(recipes.flatMap(r => [r.sourceId, r.productId]))].filter(id => !existing.has(id)).sort((a,b)=>a-b).map(selfId => {
    const {name, body} = xmlItems.get(selfId);
    const sets = Object.fromEntries([...body.matchAll(/<set name="([^"]+)" val="([^"]+)"/g)].map(m=>[m[1],m[2]]));
    const adds = Object.fromEntries([...body.matchAll(/<(?:add|set) [^>]*stat="([^"]+)" val="([^"]+)"/g)].map(m=>[m[1],Number(m[2])]));
    const subs = Object.fromEntries([...body.matchAll(/<sub [^>]*stat="([^"]+)" val="([^"]+)"/g)].map(m=>[m[1],Number(m[2])]));
    const slot = slots[sets.bodypart];
    if (slot === undefined) throw Error(`Unknown body part ${sets.bodypart}`);
    const kind = [1,3,4].includes(slot) ? 'Armor.Jewel' : slot === 8 ? 'Armor.Shield'
        : ({heavy:'Armor.Chain',light:'Armor.Leather',magic:'Armor.Fabric'}[sets.armor_type?.toLowerCase()] || 'Armor.Wear');
    return {selfId,template:{kind,name,class1:1,class2:1,mass:Number(sets.weight||0),price:Number(sets.price||0)},
        stats:{pDef:adds.pDef||adds.sDef||0,mDef:adds.mDef||0,evasion:(adds.rEvas||0)-(subs.rEvas||0),maxMp:adds.maxMp||0},
        etc:{slot,rank:sets.crystal_type.toLowerCase(),cristals:Number(sets.crystal_count||0)}};
});
fs.writeFileSync('data/Items/Armors/c4_unsealed.json', JSON.stringify(items,null,4)+'\n');
fs.writeFileSync('data/Items/c4_unseal.json', JSON.stringify({source:'L2J Lisvus C4 datapack/data/multisell: '+lists.join(', '),recipes},null,4)+'\n');
console.log(`${recipes.length} recipes, ${items.length} missing templates`);
