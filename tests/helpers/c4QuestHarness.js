// Shared C4 quest certification harness.
//
// Every helper drives the real QuestService, the real DeclarativeQuest/script
// handlers and a real SQLite database. Nothing here mocks a quest handler: a
// certification that passes through this harness exercised the same code path a
// player's packet would. Reopening the database between steps proves that state
// and rewards survive a server restart rather than living in a cached session.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

require('../../src/Global');
const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const Backpack = invoke('GameServer/Actor/Backpack');
const Service = invoke('GameServer/Quest/QuestService');

const CHARACTER_COLUMNS = `(id,username,name,classId,race,level,exp,sp,maxHp,maxMp,hp,mp,sex,face,hair,hairColor,locX,locY,locZ,newbie,newbieShotsReceived)`;

// Quest rates are pinned so reward assertions compare against authored values.
function pinRates() {
    process.env.L2NODE_PROGRESSION_RATE = 'x1';
    Object.assign(options.default.General, { questExpRate: 1, questSpRate: 1, questAdenaRate: 1 });
}

async function createWorld(characters, label = 'c4-quest') {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `l2-${label}-`));
    options.default.Database.path = path.join(directory, 'test.sqlite');
    pinRates();
    DataCache.init();
    const seed = new DatabaseSync(options.default.Database.path);
    seed.exec(fs.readFileSync(path.resolve(__dirname, '../../database/sql/sqlite.sql'), 'utf8'));
    seed.exec("INSERT INTO accounts(username,password) VALUES ('quests','test')");
    const insert = seed.prepare(`INSERT INTO characters${CHARACTER_COLUMNS}
        VALUES (?, 'quests', ?, ?, ?, ?, ?, 0, 187, 74, 187, 74, 0, 0, 0, 0, 0, 0, 0, ?, ?)`);
    for (const character of characters) {
        insert.run(character.id, character.name || `Quest${character.id}`,
            Number(character.classId || 0), Number(character.race || 0),
            Number(character.level || 20), Number(character.exp || 0),
            // -1 is the migration's "eligibility cannot be proven" default.
            Number(character.newbie ?? -1), Number(character.newbieShotsReceived || 0));
    }
    seed.close();
    Database.init();
    return new World(directory);
}

class World {
    constructor(directory) {
        this.directory = directory;
        this.sessions = new Map();
    }

    // A session deliberately exposes only what the quest runtime really uses.
    async session(id) {
        const [row] = await Database.execute(['SELECT * FROM characters WHERE id = ?', [id]]);
        if (!row) throw new Error(`character ${id} missing`);
        const actor = {
            ...row,
            fetchId: () => id,
            fetchName() { return this.name; },
            fetchClanId: () => 0,
            fetchLevel() { return this.level; },
            fetchRace() { return this.race; },
            fetchClassId() { return this.classId; },
            fetchExp() { return this.exp; },
            fetchSp() { return this.sp; },
            setExpSp(exp, sp) { this.exp = exp; this.sp = sp; },
            backpack: new Backpack({ items: await Database.fetchItems(id), paperdoll: {} })
        };
        const session = { actor, packets: [], dataSendToMe(packet) { this.packets.push(packet); } };
        await Service.ensureLoaded(session);
        this.sessions.set(id, session);
        return session;
    }

    // Closing and reinitialising the database is the restart the tests assert on.
    async reopen(id) {
        await Database.close();
        Database.init();
        return this.session(id);
    }

    async close() {
        await Database.close();
        fs.rmSync(this.directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    }

    async amount(id, selfId) {
        return (await Database.fetchItems(id))
            .filter(item => item.selfId === selfId)
            .reduce((sum, item) => sum + item.amount, 0);
    }

    async character(id) {
        const [row] = await Database.execute(['SELECT * FROM characters WHERE id = ?', [id]]);
        return row;
    }

    async questRow(id, questId) {
        const [row] = await Database.execute(
            ['SELECT * FROM character_quests WHERE characterId = ? AND questId = ?', [id, questId]]);
        return row || null;
    }

    // Talking routes through QuestService exactly as the talk packet does.
    talk(session, npcId, objectId = 1) {
        session.activeNpcTalk = { selfId: npcId, objectId };
        return Service.onTalk(session, { fetchSelfId: () => npcId, fetchId: () => objectId });
    }

    // Quest link clicks route through QuestService's bypass handler.
    event(session, questId, name, npcId) {
        if (npcId !== undefined) session.activeNpcTalk = { selfId: npcId, objectId: 1 };
        return Service.onEvent(session, { questId, name });
    }

    kill(session, npcId, objectId = 900000) {
        return Service.onKill(session, { fetchSelfId: () => npcId, fetchId: () => objectId });
    }

    // Equips a carried item the way the paperdoll would, for quests that only
    // progress while their trial weapon is wielded.
    async equip(session, selfId) {
        const id = session.actor.fetchId();
        const [row] = await Database.execute(
            ['SELECT id, slot FROM items WHERE characterId = ? AND selfId = ? ORDER BY id LIMIT 1', [id, selfId]]);
        if (!row) throw new Error(`character ${id} does not carry item ${selfId}`);
        await Database.execute(['UPDATE items SET equipped = 1, slot = 7 WHERE id = ?', [row.id]]);
        const item = session.actor.backpack.fetchItemFromSelfId(selfId);
        if (item?.setEquipped) { item.setEquipped(true); item.setSlot?.(7); }
        return item;
    }

    state(session, questId) {
        return session.questStates.get(questId);
    }
}

// Deterministic RNG so drop-chance branches are exercised on purpose, never by luck.
function withRandom(values, body) {
    const original = Math.random;
    const queue = [...values];
    Math.random = () => (queue.length ? queue.shift() : 0);
    return Promise.resolve()
        .then(body)
        .finally(() => { Math.random = original; });
}

module.exports = { createWorld, withRandom, Service, Database, DataCache };
