const assert = require('node:assert/strict');
const fs = require('fs');

const { audit, hash } =
    require('../scripts/check-c4-quests');

const inventory = fs
    .readFileSync(
        'docs/c4/quests/C4_QUEST_MASTER_INVENTORY.jsonl',
        'utf8'
    )
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);

const review = JSON.parse(
    fs.readFileSync(
        'docs/c4/quests/runtime-review.json',
        'utf8'
    )
);

const clean = audit({ evidence: {} });

assert.deepEqual(clean.errors, []);
assert.equal(clean.confirmedInScope, 107);

assert.equal(
    clean.capabilities.scriptedSpawnHot,
    'PRESENT'
);

assert.equal(
    clean.capabilities.atomicQuestStep,
    'PRESENT'
);

assert.equal(
    clean.capabilities.professionProofTransfer,
    'PRESENT'
);

for (const id of [255, 999]) {
    assert.equal(
        clean.rows.find(row => row.questId === id).inScope,
        false
    );
}

assert(
    audit({
        inventory: [...inventory, inventory[0]],
        evidence: {}
    }).errors.some(error =>
        error.includes('duplicate inventory')
    )
);

assert(
    audit({
        inventory:
            inventory.filter(q => q.quest_id !== 401),
        evidence: {}
    }).errors.some(error =>
        error.includes('Registry ID absent')
    )
);

const modified = structuredClone(inventory);

modified.find(
    q => q.quest_id === 401
).class_transfer_proof.item_id = 57;

assert(
    audit({
        inventory: modified,
        evidence: {}
    }).errors.some(error =>
        error.includes('Profession contract differs')
    )
);

// Synthetic stale-certificate test.
const evidence = {
    401: {
        certified: true,
        tests: [
            'tests/test_c4_profession_routes.js'
        ]
    },

    _certification: {
        sourceHashes: {
            'src/GameServer/ClassTransfer.js':
                'invalid'
        },

        tests: [{
            path:
                'tests/test_c4_profession_routes.js',
            exitCode: 0
        }]
    }
};

const stale = audit({ evidence });

assert(
    stale.errors.some(error =>
        error.includes('Certification stale')
    )
);

assert.notEqual(
    stale.rows.find(
        row => row.questId === 401
    ).status,
    'VERIFIED'
);

evidence._certification.sourceHashes[
    'src/GameServer/ClassTransfer.js'
] = hash('src/GameServer/ClassTransfer.js');

assert.equal(
    audit({ evidence }).rows.find(
        row => row.questId === 401
    ).status,
    'VERIFIED'
);

// Every one of the 107 in-scope quests must now have
// non-bot evidence.
const scope = inventory.filter(q =>
    q.chronicle_status === 'CONFIRMED_C4' &&
    q.level_min >= 1 &&
    q.level_min <= 20
);

assert.equal(scope.length, 107);

for (const q of scope) {
    const entry = review[String(q.quest_id)];

    assert(
        entry?.certified,
        `Q${q.quest_id} lacks certification review`
    );

    assert(
        entry.tests?.length,
        `Q${q.quest_id} lacks test evidence`
    );

    for (const test of entry.tests) {
        assert(
            !/test_bot_|test_first_profession_proof|GameServer\/Bot\/Quest/i
                .test(test),
            `Q${q.quest_id} still depends on bot evidence: ${test}`
        );
    }
}

assert(
    review['165'].tests.includes(
        'tests/test_c4_shilens_hunt.js'
    ),
    'Q165 must use its focused C4 player-route test'
);

// Disabled registry entries retain their own reason.
const registry =
    require('../src/GameServer/Quest/QuestRegistry');

const disabled =
    registry.entries.filter(
        entry => entry.id &&
            entry.status === 'disabled'
    );

assert(
    disabled.length,
    'registry still distinguishes disabled entries'
);

for (const entry of disabled) {
    const row = clean.rows.find(
        row => row.questId === entry.id
    );

    if (!row)
        continue;

    assert.equal(row.registered, false);
    assert.equal(
        row.status,
        'PARTIAL/BLOCKED'
    );
    assert.equal(row.blocker, entry.reason);
}

console.log(
    'C4 inventory: 107 in-scope quests, clean non-bot evidence, ' +
    'proof contracts, quarantine and stale-certificate guards passed'
);
