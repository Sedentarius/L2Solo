const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
require('../src/Global');
const Database = invoke('Database');
const CompanionIdentity = invoke('GameServer/Companion/CompanionIdentity');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-companion-identity-'));
const file = path.join(dir, 'test.sqlite');
options.default.Database.path = file;

const schema = fs.readFileSync(path.join(process.cwd(), 'database', 'sql', 'sqlite.sql'), 'utf8');
const account = (username) => Database.execute(['INSERT INTO accounts(username, password) VALUES (?, ?)', [username, 'test']]);

// A database that predates the companion schema: everything except the new table.
function seedLegacyDatabase() {
    const legacy = schema.replace(/CREATE TABLE IF NOT EXISTS companion_identities[\s\S]*?\);\r?\n/, '')
        .replace(/CREATE INDEX IF NOT EXISTS companion_identities_core_enabled[^\r\n]*\r?\n/, '');
    assert(!/companion_identities/.test(legacy), 'legacy schema fixture still mentions the companion table');
    const connection = new DatabaseSync(file);
    connection.exec('PRAGMA foreign_keys = ON;');
    connection.exec(legacy);
    connection.prepare('INSERT INTO accounts(username, password) VALUES (?, ?)').run('bot_pop_legacy', 'test');
    connection.prepare(`INSERT INTO characters(id, username, name, classId, race, maxHp, maxMp, sex, face, hair, hairColor, locX, locY, locZ)
        VALUES (?, ?, ?, 0, 0, 100, 100, 0, 0, 0, 0, 0, 0, 0)`).run(1, 'bot_pop_legacy', 'LegacyBot');
    connection.close();
}

async function run() {
    // 11. Existing DB compatibility: an existing L2Solo database upgrades in place.
    seedLegacyDatabase();
    Database.init();
    const tables = await Database.execute([`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, ['companion_identities']]);
    assert.strictEqual(tables.length, 1, 'companion_identities is created on an existing database without a wipe');
    const survivors = await Database.execute(['SELECT name FROM characters WHERE id = 1', []]);
    assert.strictEqual(survivors[0].name, 'LegacyBot', 'pre-existing rows survive the schema upgrade');

    // 10. A plain bot account has no identity and is never implicitly converted.
    assert.strictEqual(await CompanionIdentity.findByAccountName('bot_pop_legacy'), null);
    assert.strictEqual(await CompanionIdentity.isCompanion('bot_pop_legacy'), false);
    assert.deepStrictEqual(await CompanionIdentity.list(), []);

    // 2. Creation.
    await account('bot_comp_luna');
    const luna = await CompanionIdentity.create({
        identityKey: 'luna',
        accountName: 'bot_comp_luna',
        displayName: 'Luna',
        coreMember: true,
        profileKey: 'steady_supportive'
    });
    assert.strictEqual(luna.identityKey, 'luna');
    assert.strictEqual(luna.accountName, 'bot_comp_luna');
    assert.strictEqual(luna.displayName, 'Luna');
    assert.strictEqual(luna.coreMember, true, 'core state is stored');
    assert.strictEqual(luna.profileKey, 'steady_supportive', 'profile key is stored');
    assert.strictEqual(luna.enabled, true);
    assert(luna.id > 0 && luna.createdAt > 0);

    // 3/4. Lookup by stable key and by account.
    assert.deepStrictEqual(await CompanionIdentity.findByKey('luna'), luna);
    assert.deepStrictEqual(await CompanionIdentity.findByKey('LUNA'), luna, 'stable keys match case-insensitively');
    assert.deepStrictEqual(await CompanionIdentity.findByAccountName('bot_comp_luna'), luna);
    assert.strictEqual(await CompanionIdentity.isCompanion('bot_comp_luna'), true);
    assert.strictEqual(await CompanionIdentity.findByKey('nobody'), null);

    // 8. Uniqueness: one identity per stable key, one identity per account.
    await assert.rejects(CompanionIdentity.create({ identityKey: 'luna', accountName: 'bot_comp_other' }),
        /UNIQUE|constraint/i, 'a stable key cannot be reused');
    await account('bot_comp_nia');
    await assert.rejects(CompanionIdentity.create({ identityKey: 'nia', accountName: 'bot_comp_luna' }),
        /UNIQUE|constraint/i, 'an account cannot represent two identities');
    await assert.rejects(CompanionIdentity.create({ identityKey: 'ghost', accountName: 'bot_comp_gone' }),
        /FOREIGN KEY/, 'an identity must be anchored to a real account');

    // 5. Listing, including the core/non-core distinction.
    const nia = await CompanionIdentity.create({
        identityKey: 'nia', accountName: 'bot_comp_nia', displayName: 'Nia',
        coreMember: false, profileKey: 'reserved_pragmatic'
    });
    assert.deepStrictEqual((await CompanionIdentity.list()).map((row) => row.identityKey), ['luna', 'nia']);
    assert.deepStrictEqual((await CompanionIdentity.list({ coreOnly: true })).map((row) => row.identityKey), ['luna']);
    assert.strictEqual(nia.coreMember, false);

    // 6. Permitted updates; the stable key and the account stay immutable.
    const renamed = await CompanionIdentity.update('nia', { displayName: 'Nia the Quiet', profileKey: 'cheerful_social' });
    assert.strictEqual(renamed.displayName, 'Nia the Quiet');
    assert.strictEqual(renamed.profileKey, 'cheerful_social');
    assert.strictEqual(renamed.identityKey, 'nia');
    assert.strictEqual(renamed.accountName, 'bot_comp_nia');
    assert.strictEqual(renamed.id, nia.id, 'updates never re-key an identity');
    await assert.rejects(CompanionIdentity.update('nia', { identityKey: 'renamed', accountName: 'bot_comp_luna' }),
        /nothing to update/, 'the stable key and the account are not mutable');
    await assert.rejects(CompanionIdentity.update('nobody', { displayName: 'x' }), /unknown identity/);

    // 7. Disable without deletion.
    const disabled = await CompanionIdentity.setEnabled('nia', false);
    assert.strictEqual(disabled.enabled, false);
    assert.strictEqual(disabled.id, nia.id, 'disabling keeps the original record');
    assert.strictEqual(disabled.createdAt, nia.createdAt, 'disabling preserves the identity history');
    assert.strictEqual(await CompanionIdentity.isCompanion('bot_comp_nia'), true, 'a disabled identity is still a companion account');
    assert.deepStrictEqual((await CompanionIdentity.list({ enabledOnly: true })).map((row) => row.identityKey), ['luna']);
    assert.strictEqual((await CompanionIdentity.list()).length, 2, 'disabling never deletes the row');

    // 9. Persistence across a close/reopen cycle: identities survive a restart.
    await Database.close();
    Database.init();
    const restored = await CompanionIdentity.findByKey('luna');
    assert.deepStrictEqual(restored, luna, 'the identity is unchanged across a restart');
    assert.strictEqual(restored.id, luna.id, 'the identity keeps the same identifier after a restart');
    const restoredNia = await CompanionIdentity.findByAccountName('bot_comp_nia');
    assert.strictEqual(restoredNia.enabled, false, 'disabled state survives a restart');
    assert.strictEqual(restoredNia.coreMember, false, 'core state survives a restart');
    assert.strictEqual(restoredNia.profileKey, 'cheerful_social', 'profile key survives a restart');

    // 10 (again). The plain bot account is untouched by everything above.
    assert.strictEqual(await CompanionIdentity.isCompanion('bot_pop_legacy'), false);
    const legacyBot = await Database.execute(['SELECT username, name FROM characters WHERE id = 1', []]);
    assert.deepStrictEqual(legacyBot[0], { username: 'bot_pop_legacy', name: 'LegacyBot' });

    // Account names are bounded by the accounts table, not by this layer: the
    // 16-character cap some bot provisioning applies must not leak into identities.
    const longAccount = 'bot_companion_with_a_very_long_account_name';
    assert(longAccount.length > 16);
    await account(longAccount);
    const verbose = await CompanionIdentity.create({ identityKey: 'verbose', accountName: longAccount });
    assert.strictEqual(verbose.accountName, longAccount, 'a long account name is stored verbatim');
    assert.deepStrictEqual(await CompanionIdentity.findByAccountName(longAccount), verbose, 'and is queryable in full');
    assert.strictEqual(await CompanionIdentity.isCompanion(longAccount), true);

    // Input guards.
    await assert.rejects(CompanionIdentity.create({ identityKey: '  ', accountName: 'bot_comp_luna' }), /identityKey is required/);
    await assert.rejects(CompanionIdentity.create({ identityKey: 'x', accountName: '' }), /accountName is required/);
    utils.infoSuccess('TEST', 'companion identity persistence ok');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    // Cleanup must never outlive the connection nor mask the original failure.
    await Database.close().catch(() => null);
    fs.rmSync(dir, { recursive: true, force: true });
});
