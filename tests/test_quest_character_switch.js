const assert = require('node:assert/strict');
require('../src/Global');
const Session = invoke('GameServer/Session');
const Database = invoke('Database');
const Quests = invoke('GameServer/Quest/QuestService');
const Response = invoke('GameServer/Network/Response');

async function main() {
    const original = Database.fetchCharacterQuests;
    const rows = [{ questId: 167, state: 'started', variables: '{"cond":1}' }];
    const reads = [];
    Database.fetchCharacterQuests = async id => { reads.push(id); return id === 1 ? rows : []; };
    const session = Object.create(Session.prototype);
    const select = id => session.setActor({ id, items: [], paperdoll: {} });
    try {
        select(1);
        await Quests.ensureLoaded(session);
        assert.deepEqual(Quests.active(session), [{ id: 167, condition: 1 }]);
        session.activeNpcTalk = { selfId: 7094 };
        select(2);
        assert.equal(session.activeNpcTalk, null);
        assert.deepEqual(Quests.active(session), [], 'selection discards the previous character cache immediately');
        await Quests.ensureLoaded(session);
        assert.deepEqual(Quests.active(session), []);
        const empty = Response.questList(Quests.active(session));
        assert.equal(empty.readUInt16LE(1), 0, 'new character gets an empty native quest list');
        select(1);
        await Quests.ensureLoaded(session);
        assert.deepEqual(Quests.active(session), [{ id: 167, condition: 1 }], 'main character retains its own progress');
        assert.deepEqual(reads, [1, 2, 1]);

        let finishOldRead;
        select(1);
        Database.fetchCharacterQuests = () => new Promise(resolve => { finishOldRead = resolve; });
        const pending = Quests.ensureLoaded(session);
        select(2);
        Database.fetchCharacterQuests = async () => [];
        await Quests.ensureLoaded(session);
        finishOldRead(rows);
        await pending;
        assert.deepEqual(Quests.active(session), [], 'late old-character load cannot contaminate the new character');
        assert.equal(session.questStatesLoaded, true);
        console.log('Quest character switching, empty client list and stale load isolation passed');
    } finally {
        Database.fetchCharacterQuests = original;
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
