// Evidence is deliberately read only here, never imported by the game server.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const hash = p => require('crypto')
    .createHash('sha256')
    .update(read(p).replace(/\r\n/g, '\n'))
    .digest('hex');

function audit(options = {}) {
    require('../src/Global');

    const inventory = options.inventory ||
        read('docs/c4/quests/C4_QUEST_MASTER_INVENTORY.jsonl')
            .trim().split(/\r?\n/).map(JSON.parse);

    const registry = require('../src/GameServer/Quest/QuestRegistry');

    const errors = [
        ...require('./check-quest-registry').auditQuestRegistry().errors
    ];

    const ids = new Set();

    for (const q of inventory) {
        if (!Number.isInteger(q.quest_id) || ids.has(q.quest_id))
            errors.push(`Invalid/duplicate inventory ID ${q.quest_id}`);

        ids.add(q.quest_id);
    }

    // The eighteen first-profession proof contracts must agree with the
    // source inventory independently of runtime certification.
    for (const spec of require('../src/GameServer/Quest/FirstProfessionProof').paths) {
        const q = inventory.find(q => q.quest_id === spec.questId);

        if (
            !q ||
            JSON.stringify(q.from_class_ids) !==
                JSON.stringify([spec.fromClassId]) ||
            JSON.stringify(q.to_class_ids) !==
                JSON.stringify([spec.toClassId]) ||
            q.class_transfer_proof?.item_id !== spec.itemId
        ) {
            errors.push(
                `Profession contract differs from inventory: Q${spec.questId}`
            );
        }
    }

    const scripts = fs.readdirSync(
        path.join(root, 'src/GameServer/Quest/quests')
    ).filter(f => /^Q\d+_.*\.js$/.test(f));

    for (const file of scripts) {
        const id = Number(file.match(/^Q(\d+)/)[1]);

        if (!ids.has(id))
            errors.push(`Script absent from inventory: ${file}`);
    }

    for (const entry of registry.entries.filter(entry => entry.id)) {
        if (!ids.has(entry.id))
            errors.push(`Registry ID absent from inventory: ${entry.id}`);
    }

    const evidencePath = 'docs/c4/quests/runtime-evidence.json';

    const evidence = options.evidence !== undefined
        ? options.evidence
        : fs.existsSync(path.join(root, evidencePath))
            ? JSON.parse(read(evidencePath))
            : {};

    const certificate = evidence._certification;

    const staleSources = Object.entries(
        certificate?.sourceHashes || {}
    ).filter(([file, expected]) =>
        !fs.existsSync(path.join(root, file)) ||
        hash(file) !== expected
    ).map(([file]) => file);

    if (staleSources.length) {
        errors.push(
            `Certification stale: ${staleSources.join(', ')}`
        );
    }

    const certificateValid =
        !!certificate?.sourceHashes &&
        Object.keys(certificate.sourceHashes).length > 0 &&
        !staleSources.length;

    const Database = invoke('Database');

    const capabilities = {
        scriptedSpawnHot:
            typeof require('../src/GameServer/Quest/QuestState')
                .prototype.addSpawn === 'function'
                ? 'PRESENT'
                : 'MISSING',

        atomicQuestStep:
            typeof Database.applyQuestStep === 'function'
                ? 'PRESENT'
                : 'MISSING',

        professionProofTransfer:
            typeof Database.transferFirstProfession === 'function'
                ? 'PRESENT'
                : 'MISSING'
    };

    const rows = inventory.map(q => {
        const entry = registry.entries.find(
            e => e.id === q.quest_id
        );

        const script = scripts.find(
            f => Number(f.match(/^Q(\d+)/)[1]) === q.quest_id
        );

        const ev = evidence[String(q.quest_id)] ||
            evidence[q.quest_id] || {};

        for (const test of ev.tests || []) {
            if (!fs.existsSync(path.join(root, test))) {
                errors.push(
                    `Q${q.quest_id}: missing certification test ${test}`
                );
            }
        }

        const passing = test =>
            certificate?.tests?.some(
                result =>
                    result.path === test &&
                    result.exitCode === 0
            );

        const certified = Boolean(
            ev.certified &&
            certificateValid &&
            ev.tests?.length &&
            ev.tests.every(passing)
        );

        if (ev.certified && certificate && !certified) {
            errors.push(
                `Q${q.quest_id}: certification lacks current passing evidence`
            );
        }

        const blocked =
            entry?.status === 'disabled' ||
            !!ev.runtimeBlocker ||
            !!ev.blocker;

        const status = blocked
            ? 'PARTIAL/BLOCKED'
            : certified && entry?.status === 'active'
                ? 'VERIFIED'
                : entry?.status === 'active'
                    ? 'IMPLEMENTED'
                    : script
                        ? 'PARTIAL/BLOCKED'
                        : 'MISSING';

        const drift = [];

        if (!!script !== q.l2solo_script_exists)
            drift.push('script_existence');

        if (
            q.l2solo_registered !== undefined &&
            (entry?.status === 'active') !== q.l2solo_registered
        ) {
            drift.push('registration');
        }

        if (
            q.l2solo_runtime_status &&
            status !== q.l2solo_runtime_status
        ) {
            drift.push(
                `status:${q.l2solo_runtime_status}->${status}`
            );
        }

        return {
            questId: q.quest_id,
            name: q.name,

            inScope:
                q.chronicle_status === 'CONFIRMED_C4' &&
                q.level_min >= 1 &&
                q.level_min <= 20,

            quarantined: [255, 999].includes(q.quest_id),

            status,
            script: script || null,
            definitionId: entry?.definitionId || null,
            registered: entry?.status === 'active',

            tests: [...new Set(ev.tests || [])],

            blocker:
                ev.runtimeBlocker ||
                ev.blocker ||
                entry?.reason ||
                null,

            professionProofContract:
                ev.professionProofContract
                    ? certified
                        ? ev.professionProofContract
                        : 'STALE'
                    : null,

            drift
        };
    });

    const scope = rows.filter(row => row.inScope);

    const counts = Object.fromEntries(
        [
            'VERIFIED',
            'IMPLEMENTED',
            'PARTIAL/BLOCKED',
            'MISSING'
        ].map(status => [
            status,
            scope.filter(row => row.status === status).length
        ])
    );

    return {
        errors: [...new Set(errors)],
        confirmedInScope: scope.length,
        counts,
        capabilities,

        registeredInScope:
            scope.filter(row => row.registered).length,

        proofContracts:
            scope.filter(
                row => row.professionProofContract === 'PASS'
            ).length,

        driftCount:
            rows.filter(row => row.drift.length).length,

        scopeDriftCount:
            scope.filter(row => row.drift.length).length,

        rows
    };
}

if (require.main === module) {
    const report = audit();

    if (process.argv.includes('--json'))
        console.log(JSON.stringify(report, null, 2));
    else
        console.log(JSON.stringify({
            errors: report.errors,
            confirmedInScope: report.confirmedInScope,
            counts: report.counts,
            capabilities: report.capabilities,
            driftCount: report.driftCount
        }, null, 2));

    if (
        report.errors.length ||
        (
            process.argv.includes('--strict-drift') &&
            report.driftCount
        )
    ) {
        process.exitCode = 1;
    }
}

module.exports = { audit, hash };
