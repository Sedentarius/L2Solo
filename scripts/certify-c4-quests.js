// Re-run evidence; never promote inventory metadata to runtime authority.
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const {audit,hash}=require('./check-c4-quests');
const tests=[
    'tests/test_c4_inventory_validation.js','tests/test_c4_declarative_quests.js','tests/test_c4_starter_quests.js','tests/test_c4_beginner_quests.js','tests/test_c4_class_quests.js','tests/test_c4_village_quests.js','tests/test_first_profession_proof.js',
    'tests/test_quest_registry_integrity.js','tests/test_quest_availability.js','tests/test_quest_packets.js','tests/test_quest_runtime.js',
    'tests/test_change_class.js','tests/test_bot_class_progression.js','tests/test_bot_population_state.js',
    'tests/test_bot_quest_bridge_foundation.js','tests/test_bot_quest_bridge_kill_collect.js',
    'tests/test_bot_quest_bridge_deliver_complete.js','tests/test_bot_quest_bridge_handoff.js',
    'tests/test_bot_quest_bridge_autonomous_vertical.js','tests/test_bot_goal_planner.js','tests/test_bot_goal_market_priority.js'
];
function trackedSources() {
    const result=spawnSync('git',['ls-files','src','tests','scripts','database/sql','data/Templates','data/Npcs','data/Items','data/Pets','data/Skills','config'],{cwd:root,encoding:'utf8'});
    if(result.status!==0) throw new Error(result.stderr);
    return [...new Set([...result.stdout.trim().split(/\r?\n/),...tests,
        'scripts/certify-c4-quests.js','docs/c4/quests/runtime-review.json','docs/c4/quests/C4_QUEST_MASTER_INVENTORY.jsonl'])].filter(p=>fs.existsSync(path.join(root,p)));
}
function main() {
    const results=[];
    const sources=trackedSources();
    const sourceHashes=Object.fromEntries(sources.map(p=>[p,hash(p)]));
    for(const test of tests) {
        console.log(`Certifying ${test}`);
        const result=spawnSync(process.execPath,[test],{cwd:root,stdio:'inherit',timeout:180000});
        if(result.status!==0) throw new Error(`Certification failed: ${test} (${result.error?.message||result.status})`);
        results.push({path:test,exitCode:result.status});
    }
    for(const [p,h] of Object.entries(sourceHashes)) if(hash(p)!==h) throw new Error(`Source changed during certification: ${p}`);
    const evidence=JSON.parse(fs.readFileSync(path.join(root,'docs/c4/quests/runtime-review.json'),'utf8'));
    evidence._certification={generatedAt:new Date().toISOString(),sourceHashes,tests:results,
        scope:'Focused quest certification. Does not assert that the entire repository regression suite passes.'};
    fs.writeFileSync(path.join(root,'docs/c4/quests/runtime-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
    const report=audit();
    fs.writeFileSync(path.join(root,'docs/c4/quests/runtime-report.json'),JSON.stringify(report,null,2)+'\n');
    if(report.errors.length) throw new Error(report.errors.join('\n'));
    console.log(JSON.stringify({confirmedInScope:report.confirmedInScope,counts:report.counts,proofContracts:report.proofContracts},null,2));
}
if(require.main===module) {try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={tests,trackedSources};
