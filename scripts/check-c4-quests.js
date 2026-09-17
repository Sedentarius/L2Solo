// Evidence is deliberately read only here, never imported by the game server.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
function audit() {
    require('../src/Global');
    const inventory = read('docs/c4/quests/C4_QUEST_MASTER_INVENTORY.jsonl').trim().split(/\r?\n/).map(JSON.parse);
    const registry = require('../src/GameServer/Quest/QuestRegistry');
    const errors = require('./check-quest-registry').auditQuestRegistry().errors;
    const ids = new Set();
    for (const q of inventory) {
        if (!Number.isInteger(q.quest_id) || ids.has(q.quest_id)) errors.push(`Invalid/duplicate inventory ID ${q.quest_id}`);
        ids.add(q.quest_id);
    }
    for (const spec of require('../src/GameServer/Quest/FirstProfessionProof').paths) {
        const q = inventory.find(q => q.quest_id === spec.questId);
        if (!q || JSON.stringify(q.from_class_ids) !== JSON.stringify([spec.fromClassId]) ||
            JSON.stringify(q.to_class_ids) !== JSON.stringify([spec.toClassId]) || q.class_transfer_proof?.item_id !== spec.itemId)
            errors.push(`Profession contract differs from inventory: Q${spec.questId}`);
    }
    const scripts = fs.readdirSync(path.join(root, 'src/GameServer/Quest/quests')).filter(f => /^Q\d+_.*\.js$/.test(f));
    for (const f of scripts) if (!ids.has(Number(f.match(/^Q(\d+)/)[1]))) errors.push(`Script absent from inventory: ${f}`);
    for (const e of registry.entries.filter(e => e.id)) if (!ids.has(e.id)) errors.push(`Registry ID absent from inventory: ${e.id}`);
    const tests = fs.readdirSync(path.join(root, 'tests')).filter(f => f.endsWith('.js')).map(f => ({ path: `tests/${f}`, text: read(`tests/${f}`) }));
    const evidencePath = 'docs/c4/quests/runtime-evidence.json';
    const evidence = fs.existsSync(path.join(root, evidencePath)) ? JSON.parse(read(evidencePath)) : {};
    const rows = inventory.map(q => {
        const entry = registry.entries.find(e => e.id === q.quest_id);
        const script = scripts.find(f => Number(f.match(/^Q(\d+)/)[1]) === q.quest_id);
        const knownTests = tests.filter(t => t.text.includes(q.quest_code + '_') || (q.l2solo_tests || []).includes(t.path)).map(t => t.path);
        const ev = evidence[q.quest_id] || {};
        for (const test of ev.tests || []) if (!fs.existsSync(path.join(root, test))) errors.push(`Q${q.quest_id}: missing certification test ${test}`);
        const status = entry?.status === 'disabled' || ev.blocker ? 'PARTIAL/BLOCKED' : ev.certified && entry?.status === 'active' ? 'VERIFIED' : entry?.status === 'active' ? 'IMPLEMENTED' : script ? 'PARTIAL/BLOCKED' : 'MISSING';
        const drift = [];
        if (!!script !== q.l2solo_script_exists) drift.push('script_existence');
        if (entry?.definitionId) drift.push('implemented_as_reviewed_definition');
        if ((entry?.status === 'active') !== q.l2solo_registered) drift.push('registration');
        if (status !== q.l2solo_runtime_status) drift.push(`status:${q.l2solo_runtime_status}->${status}`);
        for (const t of q.l2solo_tests || []) if (!fs.existsSync(path.join(root, t))) drift.push(`missing_historical_test:${t}`);
        const obsolete = (q.bridge_missing_capabilities || []).filter(c => c === 'GENERIC_QUEST_GOAL_AND_RESOLVER');
        if (obsolete.length) drift.push('generic_bridge_already_exists');
        return { questId: q.quest_id, name: q.name, inScope: q.chronicle_status === 'CONFIRMED_C4' && q.level_min >= 1 && q.level_min <= 20,
            quarantined: [255, 999].includes(q.quest_id), status, script: script || null, definitionId: entry?.definitionId || null, registered: entry?.status === 'active',
            tests: [...new Set([...knownTests, ...(ev.tests || [])])], blocker: ev.blocker || entry?.reason || null,
            bridge: { genericResolver: 'PRESENT', questAdapter: ev.bridge || 'NOT_CERTIFIED', requirementsNeedingReview: (q.bridge_missing_capabilities || []).filter(c => !obsolete.includes(c)) }, drift };
    });
    const scope = rows.filter(r => r.inScope);
    const counts = Object.fromEntries(['VERIFIED','IMPLEMENTED','PARTIAL/BLOCKED','MISSING'].map(s => [s, scope.filter(r => r.status === s).length]));
    return { errors, confirmedInScope: scope.length, counts, driftCount: rows.filter(r => r.drift.length).length, rows };
}
if (require.main === module) {
    const report = audit();
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else console.log(JSON.stringify({ errors: report.errors, confirmedInScope: report.confirmedInScope, counts: report.counts, driftCount: report.driftCount }, null, 2));
    if (report.errors.length || (process.argv.includes('--strict-drift') && report.driftCount)) process.exitCode = 1;
}
module.exports = { audit };
