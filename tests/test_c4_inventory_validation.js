const assert=require('node:assert/strict');
const fs=require('fs');
const {audit,hash}=require('../scripts/check-c4-quests');
const inventory=fs.readFileSync('docs/c4/quests/C4_QUEST_MASTER_INVENTORY.jsonl','utf8').trim().split(/\r?\n/).map(JSON.parse);
const clean=audit({evidence:{}});
assert.deepEqual(clean.errors,[]);
assert.equal(clean.confirmedInScope,107);
for(const id of [255,999]) assert.equal(clean.rows.find(r=>r.questId===id).inScope,false);
assert(audit({inventory:[...inventory,inventory[0]],evidence:{}}).errors.some(e=>e.includes('duplicate inventory')));
assert(audit({inventory:inventory.filter(q=>q.quest_id!==401),evidence:{}}).errors.some(e=>e.includes('Registry ID absent')));
const modified=structuredClone(inventory);modified.find(q=>q.quest_id===401).class_transfer_proof.item_id=57;
assert(audit({inventory:modified,evidence:{}}).errors.some(e=>e.includes('Profession contract differs')));
const evidence={401:{certified:true,tests:['tests/test_first_profession_proof.js']},
    _certification:{sourceHashes:{'src/GameServer/ClassTransfer.js':'invalid'},tests:[{path:'tests/test_first_profession_proof.js',exitCode:0}]}};
const stale=audit({evidence});
assert(stale.errors.some(e=>e.includes('Certification stale')));
assert.notEqual(stale.rows.find(r=>r.questId===401).status,'VERIFIED');
evidence._certification.sourceHashes['src/GameServer/ClassTransfer.js']=hash('src/GameServer/ClassTransfer.js');
assert.equal(audit({evidence}).rows.find(r=>r.questId===401).status,'VERIFIED');
assert.equal(clean.capabilities.genericGoalResolver,'PRESENT');
assert.equal(clean.capabilities.scriptedSpawnHot,'PRESENT');
// A disabled registry entry must surface its own reason and never be reported
// as runnable, whichever quests happen to be disabled at the time.
const registry=require('../src/GameServer/Quest/QuestRegistry');
const disabled=registry.entries.filter(e=>e.id&&e.status==='disabled');
assert(disabled.length,'the registry still distinguishes disabled entries');
for(const entry of disabled) {
    const row=clean.rows.find(r=>r.questId===entry.id);
    if(!row) continue;
    assert.equal(row.registered,false,`Q${entry.id} is not reported as registered`);
    assert.equal(row.status,'PARTIAL/BLOCKED',`Q${entry.id} is reported blocked`);
    assert.equal(row.blocker,entry.reason,`Q${entry.id} surfaces its own reason`);
}
console.log('Inventory duplicates, orphan registration, proof mismatch, quarantine and stale certification checks passed');
