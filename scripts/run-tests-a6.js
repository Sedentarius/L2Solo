const { spawnSync } = require('child_process');

const tests = [
    // P0-A death/progression invariants touched by A6 integration.
    'tests/test_death_experience.js',
    'tests/test_death_item_drop.js',
    'tests/test_death_item_drop_policy_edges.js',
    'tests/test_hot_cold_progression_parity.js',
    'tests/test_restart_point_revive.js',

    // PvP/karma/summon cause classification around death consequences.
    'tests/test_cold_pvp.js',
    'tests/test_summon_pvp.js',
    'tests/test_cold_karma_policy.js',
    'tests/test_cold_worker_karma.js',
    'tests/test_pk_hunting_state.js',

    // Adjacent frozen P0-A invariants: A6 must not regress them.
    // Upstream replaced the parallel bow implementation with
    // GameServer/Actor/BowResources and removed test_bow_normal_attack_mp.js.
    // Ranged attack resource consumption is covered here now.
    'tests/test_player_ranged_combat.js',
    'tests/test_overhit_reward.js',
    'tests/test_progression_content_cap.js',
    'tests/test_quest_registry_integrity.js'
];

for (const testFile of tests) {
    console.log(`\n> node ${testFile}`);
    const result = spawnSync(process.execPath, [testFile], {
        cwd: process.cwd(),
        stdio: 'inherit'
    });

    if (result.error) {
        console.error(result.error);
        process.exit(1);
    }
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

console.log(`\nP0-A6 focused regression pack passed (${tests.length} tests).`);
