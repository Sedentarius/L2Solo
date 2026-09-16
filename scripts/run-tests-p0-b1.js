const { spawnSync } = require('child_process');

const tests = [
    'tests/test_bot_quest_bridge_foundation.js',
    'tests/test_bot_cold_travel.js',
    'tests/test_quest_runtime.js',
    'tests/test_quest_handins.js',
    'tests/test_quest_registry_integrity.js',
    'tests/test_hot_cold_progression_parity.js'
];

let failures = 0;
for (const test of tests) {
    console.log(`\n> node ${test}`);
    const result = spawnSync(process.execPath, [test], { stdio: 'inherit' });
    if (result.status !== 0) {
        failures += 1;
        console.error(`P0-B1 failure: ${test} (exit ${result.status})`);
    }
}

if (failures) {
    console.error(`\nP0-B1 focused regression pack failed: ${failures}/${tests.length} test(s).`);
    process.exitCode = 1;
} else {
    console.log(`\nP0-B1 focused regression pack passed (${tests.length} tests).`);
}
