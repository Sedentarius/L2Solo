// Re-run evidence; never promote inventory metadata to runtime authority.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const { audit, hash } =
    require('./check-c4-quests');

const review = JSON.parse(
    fs.readFileSync(
        path.join(
            root,
            'docs/c4/quests/runtime-review.json'
        ),
        'utf8'
    )
);

const focused = [
    'tests/test_c4_inventory_validation.js',
    'tests/test_c4_declarative_quests.js',
    'tests/test_c4_starter_quests.js',
    'tests/test_c4_beginner_quests.js',
    'tests/test_c4_class_quests.js',
    'tests/test_c4_village_quests.js',
    'tests/test_c4_profession_routes.js',
    'tests/test_c4_orc_bounty_quests.js',
    'tests/test_c4_lizardmen_quest.js',
    'tests/test_c4_music_feast_quests.js',
    'tests/test_c4_lizardman_invader_quests.js',
    'tests/test_c4_elven_forest_quests.js',
    'tests/test_c4_bounty_target_quests.js',
    'tests/test_c4_catacomb_quests.js',
    'tests/test_c4_sin_eater_quest.js',
    'tests/test_c4_dimensional_rift_quest.js'
];

const reviewedTests = Object.values(review)
    .flatMap(entry =>
        Array.isArray(entry?.tests)
            ? entry.tests
            : []
    );

const tests = [
    ...new Set([
        ...focused,
        ...reviewedTests
    ])
];

if (
    tests.some(test =>
        /test_bot_|test_first_profession_proof|GameServer\/Bot\/Quest/i
            .test(test)
    )
) {
    throw new Error(
        'Bot-only test leaked into C4 certification'
    );
}

function trackedSources() {
    const selectors = [
        'src/GameServer/Quest',
        'src/Database.js',
        'src/GameServer/ClassTransfer.js',
        'src/GameServer/DataCache.js',

        'database/sql/sqlite.sql',

        'data/Npcs/c4_quest_content.json',
        'data/Npcs/Rewards/c4_quest_content.json',
        'data/Npcs/Spawns/c4_quest_content.json',
        'data/Npcs/Spawns/spawns.json',

        'data/Items/Others/others.json',
        'data/Items/Weapons/weapons.json',

        'config/default.ini',

        'tests/helpers/c4QuestHarness.js',
        'tests/helpers/legacyCharacterSchema.js'
    ];

    const result = spawnSync(
        'git',
        [
            'ls-files',
            '--cached',
            '--others',
            '--exclude-standard',
            '--',
            ...selectors
        ],
        {
            cwd: root,
            encoding: 'utf8'
        }
    );

    if (result.status !== 0)
        throw new Error(result.stderr);

    const sourceFiles = result.stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);

    return [
        ...new Set([
            ...sourceFiles,
            ...tests,

            'scripts/check-c4-quests.js',
            'scripts/certify-c4-quests.js',

            'docs/c4/quests/runtime-review.json',
            'docs/c4/quests/C4_QUEST_MASTER_INVENTORY.jsonl'
        ])
    ].filter(file =>
        fs.existsSync(path.join(root, file))
    );
}

function main() {
    const results = [];
    const sources = trackedSources();

    const sourceHashes = Object.fromEntries(
        sources.map(file => [
            file,
            hash(file)
        ])
    );

    for (const test of tests) {
        console.log(`Certifying ${test}`);

        const result = spawnSync(
            process.execPath,
            [test],
            {
                cwd: root,
                stdio: 'inherit',
                timeout: 180000
            }
        );

        if (result.status !== 0) {
            throw new Error(
                `Certification failed: ${test} ` +
                `(${result.error?.message || result.status})`
            );
        }

        results.push({
            path: test,
            exitCode: result.status
        });
    }

    for (const [file, expected] of Object.entries(sourceHashes)) {
        if (hash(file) !== expected) {
            throw new Error(
                `Source changed during certification: ${file}`
            );
        }
    }

    const evidence = JSON.parse(
        fs.readFileSync(
            path.join(
                root,
                'docs/c4/quests/runtime-review.json'
            ),
            'utf8'
        )
    );

    evidence._certification = {
        generatedAt:
            new Date().toISOString(),

        sourceHashes,

        tests: results,

        scope:
            'C4 quests with minimum level 1-20. ' +
            'Player/runtime certification only; ' +
            'bot autonomy is outside this PR.'
    };

    fs.writeFileSync(
        path.join(
            root,
            'docs/c4/quests/runtime-evidence.json'
        ),
        JSON.stringify(evidence, null, 2) + '\n'
    );

    const report = audit();


    if (report.errors.length)
        throw new Error(
            report.errors.join('\n')
        );

    if (
        report.confirmedInScope !== 107 ||
        report.counts.VERIFIED !== 107
    ) {
        throw new Error(
            `Expected 107 VERIFIED quests, got ` +
            `${report.counts.VERIFIED}/` +
            `${report.confirmedInScope}`
        );
    }

    console.log(JSON.stringify({
        confirmedInScope:
            report.confirmedInScope,

        counts:
            report.counts,

        proofContracts:
            report.proofContracts,

        tests:
            results.length
    }, null, 2));
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    tests,
    trackedSources
};
