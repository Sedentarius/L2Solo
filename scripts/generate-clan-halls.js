// Import C4 residence geometry and NPCs. Prices use the historical grade schedule.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const vendor = process.argv[2] || path.join(root, 'tmp/vendor/l2j-lisvus');
const revision = 'fdc7e33af5d69067b41a6ee7cc7c07fe7aa35975';
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: vendor, encoding: 'utf8' }).trim() !== revision)
    throw Error('Unexpected reference revision');
function tuple(line) {
    if (!line.startsWith('(')) return null;
    const out = [];
    let value = '',
        quoted = false,
        escaped = false;
    for (const c of line.slice(1)) {
        if (escaped) {
            value += c;
            escaped = false;
            continue;
        }
        if (c === '\\' && quoted) {
            escaped = true;
            continue;
        }
        if (c === "'") {
            quoted = !quoted;
            continue;
        }
        if (!quoted && (c === ',' || c === ')')) {
            const s = value.trim();
            out.push(/^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : s);
            value = '';
            if (c === ')') return out;
        } else value += c;
    }
    return null;
}
const read = (name) => fs.readFileSync(path.join(vendor, 'datapack', name), 'utf8');
const rows = (name) =>
    read('sql/' + name)
        .split(/\r?\n/)
        .map(tuple)
        .filter(Boolean);
const restarts = read('data/restartPoints.xml');
const zones = read('data/zones/clanHallZones.xml');
const allNpcs = rows('npc.sql');
const spawns = rows('spawnlist.sql');
const halls = rows('clanhall.sql')
    .filter((r) => r[8] > 0)
    .map((r) => {
        const [id, name, , , , , town, , grade] = r;
        const restart = restarts.match(
            new RegExp(`<restartPointGroup id="clan_hall_${id}">([\\s\\S]*?)</restartPointGroup>`)
        )[1];
        const [, x, y, z] = restart.match(/<spawn X="(-?\d+)" Y="(-?\d+)" Z="(-?\d+)"/);
        const zone = [...zones.matchAll(/<zone\b[^>]*>[\s\S]*?<\/zone>/g)].find((m) =>
            m[0].includes(`name="clanHallId" val="${id}"`)
        )[0];
        const nodes = [...zone.matchAll(/<node X="(-?\d+)" Y="(-?\d+)"/g)];
        const bounds = {
            minX: Math.min(...nodes.map((n) => +n[1])),
            maxX: Math.max(...nodes.map((n) => +n[1])),
            minY: Math.min(...nodes.map((n) => +n[2])),
            maxY: Math.max(...nodes.map((n) => +n[2])),
            minZ: +zone.match(/minZ="(-?\d+)"/)[1],
            maxZ: +zone.match(/maxZ="(-?\d+)"/)[1]
        };
        // Giran hall 44's upstream restart Z is 11 units above its zone ceiling.
        // Include that documented floor plus a small actor-height margin.
        if (+z > bounds.maxZ) bounds.maxZ = +z + 32;
        const inside = (s) => s[4] >= bounds.minX && s[4] <= bounds.maxX && s[5] >= bounds.minY && s[5] <= bounds.maxY;
        const managers = spawns
            .filter((s) => inside(s) && allNpcs.some((n) => n[0] === s[3] && n[11] === 'L2ClanHallManager'))
            .map((s) => s[3]);
        if (!managers.length) {
            const nearest = spawns
                .filter((s) => allNpcs.some((n) => n[0] === s[3] && n[11] === 'L2ClanHallManager'))
                .sort((a, b) => Math.hypot(a[4] - x, a[5] - y) - Math.hypot(b[4] - x, b[5] - y))[0];
            if (!nearest || Math.hypot(nearest[4] - x, nearest[5] - y) > 1800) throw Error('Missing manager ' + id);
            managers.push(nearest[3]);
        }
        return {
            id,
            name,
            town,
            grade,
            minimumBid: [0, 8000000, 20000000, 50000000][grade],
            weeklyRent: [0, 200000, 500000, 1000000][grade],
            spawn: { locX: +x, locY: +y, locZ: +z },
            bounds,
            managerIds: [...new Set(managers)]
        };
    });
// L2DoormenInstance binds to a hall within 500 units of its zone.
for (const hall of halls) hall.doormanIds = [];
const doormen = new Set(allNpcs.filter(n => n[11] === 'L2Doormen').map(n => n[0]));
for (const spawn of spawns.filter(s => doormen.has(s[3]))) {
    const hall = halls.find(({ bounds: b }) => Math.hypot(
        Math.max(b.minX - spawn[4], 0, spawn[4] - b.maxX),
        Math.max(b.minY - spawn[5], 0, spawn[5] - b.maxY)
    ) < 500);
    if (hall && !hall.doormanIds.includes(spawn[3])) hall.doormanIds.push(spawn[3]);
}
require('../src/Global');
const cache = invoke('GameServer/DataCache');
cache.init();
const previous = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : []);
const oldIds = new Set(previous('data/Npcs/clan_halls.json').map((n) => n.selfId));
const knownIds = new Set(cache.npcs.filter((n) => !oldIds.has(n.selfId)).map((n) => n.selfId));
const knownSpawns = cache.npcSpawns.filter((g) => g.selfId !== 'auction_clan_halls').flatMap((g) => g.spawns);
const auctioneerIds = allNpcs.filter((n) => n[11] === 'L2Auctioneer').map((n) => n[0]);
const needed = new Set([...auctioneerIds, ...halls.flatMap((h) => [...h.managerIds, ...h.doormanIds])]);
const npcs = allNpcs
    .filter((n) => needed.has(n[0]) && !knownIds.has(n[0]))
    .map((row) => {
        const [
            selfId,
            ,
            name,
            ,
            title,
            ,
            ,
            radius,
            size,
            level,
            ,
            type,
            atkRadius,
            maxHp,
            maxMp,
            revHp,
            revMp,
            str,
            con,
            dex,
            int,
            wit,
            men,
            exp,
            sp,
            pAtk,
            pDef,
            mAtk,
            mDef,
            atkSpd,
            ,
            castSpd,
            weapon,
            shield,
            ,
            walk,
            run
        ] = row;
        return {
            selfId,
            template: { kind: type.replace(/^L2/, ''), name, title, level, hostile: false },
            base: { str, con, dex, int, wit, men },
            stats: { pAtk, pAtkRnd: 30, pDef, mAtk, mDef, atkSpd, castSpd, atkRadius, accur: 4.75 },
            speed: { walk, run },
            vitals: { maxHp, maxMp, revHp, revMp, corpseTime: 7000 },
            collision: { radius, size },
            equipment: { weapon, shield, reuseTime: 0 },
            clan: { clanName: '', helpRadius: 0 },
            rewards: { exp, sp }
        };
    });
const missingSpawns = spawns
    .filter(
        (s) =>
            needed.has(s[3]) &&
            !knownSpawns.some(
                (k) => k.selfId === s[3] && (doormen.has(s[3])
                    || k.coords.some((c) => c.locX === s[4] && c.locY === s[5] && Math.abs(c.locZ - s[6]) < 64))
            )
    )
    .map((s) => ({
        selfId: s[3],
        name: allNpcs.find((n) => n[0] === s[3])[2],
        coords: [{ locX: s[4], locY: s[5], locZ: s[6], head: s[9] }],
        total: 1,
        respawn: s[10],
        bias: 0
    }));
const save = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
const nativeSupport = {
    4342: 1204,
    4343: 1257,
    4344: 1040,
    4345: 1068,
    4346: 1035,
    4347: 1045,
    4348: 1048,
    4349: 1036,
    4350: 1259,
    4351: 1078,
    4352: 1062,
    4353: 1243,
    4354: 1268,
    4355: 1085,
    4356: 1059,
    4357: 1086,
    4358: 1240,
    4359: 1077,
    4360: 1242
};
const support = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => {
        const level = index + 1;
        const html = read(`data/html/clanHallManager/support${level}.htm`);
        return [
            level,
            [...html.matchAll(/_support (\d+) (\d+)">([^<]+)<\/a>/g)].map(([, id, skillLevel, name]) => ({
                id: nativeSupport[id],
                level: Number(skillLevel),
                name
            }))
        ];
    })
);
save('data/ClanHalls/support.json', support);
save('data/ClanHalls/catalog.json', { revision, source: 'https://gitlab.com/TheDnR/l2j-lisvus', halls, auctioneerIds });
const doors = [...read('data/doors.xml').matchAll(/<door id="(\d+)" name="([^"]+)">([\s\S]*?)<\/door>/g)]
    .map(([, id, name, body]) => {
        const values = Object.fromEntries([...body.matchAll(/<set name="([^"]+)" val="([^"]+)"/g)]
            .map(([, key, value]) => [key, Number(value)]));
        return { id: Number(id), name, hallId: values.clanHallId,
            locX: values.x, locY: values.y, locZ: values.z, maxHp: values.baseHpMax };
    }).filter(door => halls.some(hall => hall.id === door.hallId));
save('data/ClanHalls/doors.json', doors);
save('data/Npcs/clan_halls.json', npcs);
save('data/Npcs/Spawns/clan_halls.json', [{ selfId: 'auction_clan_halls', bounds: [], spawns: missingSpawns }]);
console.log(`Imported ${halls.length} auction halls, ${npcs.length} NPC templates, ${missingSpawns.length} spawns`);
