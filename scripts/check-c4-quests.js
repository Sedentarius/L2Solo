// Evidence is deliberately read only here, never imported by the game server.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const hash = p => require('crypto').createHash('sha256').update(read(p).replace(/\r\n/g,'\n')).digest('hex');
function audit(options = {}) {
    require('../src/Global');
    const inventory = options.inventory || read('docs/c4/quests/C4_QUEST_MASTER_INVENTORY.jsonl').trim().split(/\r?\n/).map(JSON.parse);
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
    const evidence = options.evidence || (fs.existsSync(path.join(root, evidencePath)) ? JSON.parse(read(evidencePath)) : {});
    const certificate=evidence._certification;
    const staleSources=Object.entries(certificate?.sourceHashes||{}).filter(([p,h])=>!fs.existsSync(path.join(root,p))||hash(p)!==h).map(([p])=>p);
    if(staleSources.length) errors.push(`Certification stale: ${staleSources.join(', ')}`);
    const certificateValid=!!certificate?.sourceHashes && Object.keys(certificate.sourceHashes).length>0 && !staleSources.length;
    const Catalog=require('../src/GameServer/Bot/Quest/AutonomousQuestCatalog');
    const Runtime=require('../src/GameServer/Bot/Quest/AutonomousQuestRuntime');
    const genericPresent=typeof Catalog.candidateFor==='function' && typeof Runtime.advance==='function';
    const capabilities={genericGoalResolver:genericPresent?'PRESENT':'MISSING',
        scriptedSpawnHot:typeof require('../src/GameServer/Quest/QuestState').prototype.addSpawn==='function'?'PRESENT':'MISSING',
        scriptedEncounterCold:'NOT_CERTIFIED',partyQuestSharing:'NOT_CERTIFIED',
        note:'Existing NPC spawns and script events do not certify cold encounter ownership, timers or party credit.'};
    const rows = inventory.map(q => {
        const entry = registry.entries.find(e => e.id === q.quest_id);
        const script = scripts.find(f => Number(f.match(/^Q(\d+)/)[1]) === q.quest_id);
        const knownTests = tests.filter(t => t.text.includes(q.quest_code + '_') || (q.l2solo_tests || []).includes(t.path)).map(t => t.path);
        const ev = evidence[q.quest_id] || {};
        for (const test of ev.tests || []) if (!fs.existsSync(path.join(root, test))) errors.push(`Q${q.quest_id}: missing certification test ${test}`);
        const certified=ev.certified && certificateValid && ev.tests?.length && ev.tests.every(p=>certificate.tests?.some(t=>t.path===p&&t.exitCode===0));
        if(ev.certified && !certified) errors.push(`Q${q.quest_id}: certification lacks current passing evidence`);
        const status = entry?.status === 'disabled' || ev.runtimeBlocker ? 'PARTIAL/BLOCKED' : certified && entry?.status === 'active' ? 'VERIFIED' : entry?.status === 'active' ? 'IMPLEMENTED' : script ? 'PARTIAL/BLOCKED' : 'MISSING';
        const drift = [];
        if (!!script !== q.l2solo_script_exists) drift.push('script_existence');
        if (entry?.definitionId) drift.push('implemented_as_reviewed_definition');
        if ((entry?.status === 'active') !== q.l2solo_registered) drift.push('registration');
        if (status !== q.l2solo_runtime_status) drift.push(`status:${q.l2solo_runtime_status}->${status}`);
        for (const t of q.l2solo_tests || []) if (!fs.existsSync(path.join(root, t))) drift.push(`missing_historical_test:${t}`);
        const obsolete = (q.bridge_missing_capabilities || []).filter(c => genericPresent && c === 'GENERIC_QUEST_GOAL_AND_RESOLVER');
        if (obsolete.length) drift.push('generic_bridge_already_exists');
        return { questId: q.quest_id, name: q.name, inScope: q.chronicle_status === 'CONFIRMED_C4' && q.level_min >= 1 && q.level_min <= 20,
            quarantined: [255, 999].includes(q.quest_id), status, script: script || null, definitionId: entry?.definitionId || null, registered: entry?.status === 'active',
            tests: [...new Set([...knownTests, ...(ev.tests || [])])], blocker: ev.runtimeBlocker || ev.blocker || entry?.reason || null,
            certificationBlocker:ev.certificationBlocker||null,professionProofContract:ev.professionProofContract
                ? (certificateValid && ev.tests?.every(p=>certificate.tests?.some(t=>t.path===p&&t.exitCode===0)) ? ev.professionProofContract : 'STALE') : null,
            bridge: { genericResolver: capabilities.genericGoalResolver, questAdapter: ev.bridge || 'NOT_CERTIFIED',
                reviewedRequirements:ev.reviewedRequirements||null,requirementsNeedingReview: (q.bridge_missing_capabilities || []).filter(c => !obsolete.includes(c) && !ev.reviewedRequirements) }, drift };
    });
    const scope = rows.filter(r => r.inScope);
    const counts = Object.fromEntries(['VERIFIED','IMPLEMENTED','PARTIAL/BLOCKED','MISSING'].map(s => [s, scope.filter(r => r.status === s).length]));
    return { errors:[...new Set(errors)], confirmedInScope: scope.length, counts, capabilities,
        registeredInScope:scope.filter(r=>r.registered).length,proofContracts:scope.filter(r=>r.professionProofContract==='PASS').length,
        driftCount: rows.filter(r => r.drift.length).length, scopeDriftCount:scope.filter(r=>r.drift.length).length, rows };
}
if (require.main === module) {
    const report = audit();
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else console.log(JSON.stringify({ errors: report.errors, confirmedInScope: report.confirmedInScope, counts: report.counts, driftCount: report.driftCount }, null, 2));
    if (report.errors.length || (process.argv.includes('--strict-drift') && report.driftCount)) process.exitCode = 1;
}
module.exports = { audit, hash };
