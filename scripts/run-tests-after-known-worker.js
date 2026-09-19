const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const canonicalRunner = path.join(__dirname, 'run-tests.js');
const source = fs.readFileSync(canonicalRunner, 'utf8');
const tests = [...source.matchAll(/'((?:tests\/)[^']+\.js)'/g)].map((match) => match[1]);
const knownFailure = 'tests/test_companion_pathfinding_worker.js';
const index = tests.indexOf(knownFailure);

if (index < 0) {
    console.error(`Could not locate ${knownFailure} in scripts/run-tests.js`);
    process.exit(2);
}

const remaining = tests.slice(index + 1);
const failures = [];

console.log(`Known baseline failure recorded at ${knownFailure}.`);
console.log(`Continuing canonical suite with ${remaining.length} test(s) after it.`);

for (const testFile of remaining) {
    console.log(`\n> node ${testFile}`);
    const result = spawnSync(process.execPath, [testFile], {
        cwd: process.cwd(),
        stdio: 'inherit'
    });

    if (result.status !== 0) {
        failures.push({ testFile, status: result.status || 1 });
        console.error(`\nRecorded post-baseline failure: ${testFile} (exit ${result.status || 1}). Continuing...`);
    }
}

if (failures.length) {
    console.error('\nPost-baseline failures:');
    for (const failure of failures) {
        console.error(`- ${failure.testFile} (exit ${failure.status})`);
    }
    process.exitCode = 1;
} else {
    console.log('\nAll tests after the known companion pathfinding worker baseline failure passed.');
}
