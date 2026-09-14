const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const vendor = path.join(root,'tmp/vendor/l2j-lisvus');
const revision = 'fdc7e33af5d69067b41a6ee7cc7c07fe7aa35975';
if(execFileSync('git',['rev-parse','HEAD'],{cwd:vendor,encoding:'utf8'}).trim()!==revision) throw Error('Unexpected reference revision');
function tuple(line) {
    if(!line.startsWith('(')) return null;
    const values=[];let value='',quoted=false,escaped=false;
    for(let i=1;i<line.length;i++) {
        const c=line[i];
        if(escaped){value+=c;escaped=false;continue;}
        if(c==='\\' && quoted){escaped=true;continue;}
        if(c==="'"){quoted=!quoted;continue;}
        if(!quoted && (c===',' || c===')')) {const s=value.trim();values.push(/^[-+]?\d+(\.\d+)?$/.test(s)?Number(s):s);value='';if(c===')')return values;}
        else value+=c;
    }
    return null;
}
const read=name=>fs.readFileSync(path.join(vendor,'datapack/sql',name),'utf8').split(/\r?\n/).map(tuple).filter(Boolean);

// Permanent Heine residents from Lisvus C4, including Gatekeeper Flauen.
const ids = new Set([...Array.from({ length: 28 }, (_, i) => 7890 + i), 7920, 7921, 7969]);
const npcs = read('npc.sql').filter(row => ids.has(row[0])).map(row => {
    const [selfId,,name,,title,,,radius,size,level,,type,atkRadius,maxHp,maxMp,revHp,revMp,str,con,dex,int,wit,men,exp,sp,pAtk,pDef,mAtk,mDef,atkSpd,aggro,castSpd,weapon,shield,,walk,run,clanName,helpRadius] = row;
    return {
        // L2Guard's source aggro radius applies to PKs, not ordinary players.
        selfId, template: { kind: type.replace(/^L2/, ''), name, title, level, hostile: type !== 'L2Guard' && aggro > 0 },
        base: { str, con, dex, int, wit, men },
        stats: { pAtk, pAtkRnd: 30, pDef, mAtk, mDef, atkSpd, castSpd, atkRadius, accur: 4.75 },
        speed: { walk, run }, vitals: { maxHp, maxMp, revHp, revMp, corpseTime: 7000 },
        collision: { radius, size }, equipment: { weapon, shield, reuseTime: 0 },
        clan: { clanName: clanName === 'NULL' ? '' : clanName, helpRadius }, rewards: { exp, sp }
    };
});
if (npcs.length !== 31) throw Error('Missing Heine NPC templates');
const spawns = read('spawnlist.sql').filter(row => ids.has(row[3])).map(row => ({
    selfId: row[3], name: npcs.find(npc => npc.selfId === row[3]).template.name,
    coords: [{ locX: row[4], locY: row[5], locZ: row[6], head: row[9] }], total: row[2], respawn: row[10], bias: 0
}));
if (spawns.length !== 31 || spawns.some(s => Math.abs(s.coords[0].locX - 111386) > 6000 || Math.abs(s.coords[0].locY - 219413) > 5000)) throw Error('Unexpected Heine spawn coverage');
const sourceLists = { 7890: [5800, 5801], 7891: [5802, 5803], 7892: [5600, 10], 7893: [5601, 6] };
const buyRows = read('merchant_buylists.sql');
// These source entries have no item template in the current server datapack.
const unsupportedItems = new Set([5284, 5589, 4679]);
const shops = Object.fromEntries(Object.entries(sourceLists).map(([npcId, listIds]) => {
    const entries = new Map();
    for (const listId of listIds) for (const [selfId, price, id] of buyRows) {
        if (id === listId && !unsupportedItems.has(selfId) && !entries.has(selfId)) entries.set(selfId, { selfId, price });
    }
    if (!entries.size) throw Error('Missing shop ' + npcId);
    return [npcId, [...entries.values()]];
}));
const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n');
write('data/Npcs/c4_heine.json', npcs);
write('data/Npcs/Spawns/c4_heine.json', [{ selfId: 'c4_heine', bounds: [], spawns }]);
write('data/Npcs/c4_heine_shops.json', shops);
for (const npc of npcs) {
    const { name, title } = npc.template;
    const links = shops[npc.selfId] ? '<a action="bypass -h buy-shop npc">Buy goods</a><br>\n<a action="bypass -h sell-shop">Sell items</a><br>\n' : '';
    fs.writeFileSync(path.join(root, 'data/Html', npc.selfId + '.html'), '<html><body>\n' + (title ? title + ' ' : '') + name + ':<br>\nWelcome to Heine.<br>\n' + links + '<a action="bypass -h html ' + npc.selfId + '-quest">Quest</a>\n</body></html>\n');
}
console.log('Generated 31 Heine residents and 4 source-backed shops at Lisvus ' + revision);
