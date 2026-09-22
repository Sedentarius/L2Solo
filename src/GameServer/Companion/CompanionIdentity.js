const Database = invoke('Database');

// A companion identity is the durable, account-level record of a persistent
// fictional person. It deliberately knows nothing about characters: the hot/cold
// lifecycle of any single avatar must not be able to destroy or recreate it.
const COLUMNS = 'id, identityKey, accountName, displayName, coreMember, profileKey, enabled, createdAt, updatedAt';
const MUTABLE = ['displayName', 'coreMember', 'profileKey', 'enabled'];

// Lengths are bounded by the schema, not by this layer: every companion column
// is unbounded TEXT, and the provisioning cap some bots apply to account names
// is a caller's concern rather than the durable identity's.
function text(value, field, { required = true } = {}) {
    const normalized = String(value ?? '').trim();
    if (!normalized && required) throw new Error(`companion identity: ${field} is required`);
    return normalized;
}

function flag(value) {
    return value ? 1 : 0;
}

function hydrate(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        identityKey: String(row.identityKey),
        accountName: String(row.accountName),
        displayName: String(row.displayName),
        coreMember: !!row.coreMember,
        profileKey: String(row.profileKey),
        enabled: !!row.enabled,
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt)
    };
}

module.exports = {
    async create(identity = {}) {
        const identityKey = text(identity.identityKey ?? identity.key, 'identityKey');
        const account = text(identity.accountName ?? identity.account, 'accountName');
        const timestamp = Date.now();
        await Database.execute([`INSERT INTO companion_identities
            (identityKey, accountName, displayName, coreMember, profileKey, enabled, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            identityKey,
            account,
            text(identity.displayName, 'displayName', { required: false }),
            flag(identity.coreMember),
            text(identity.profileKey, 'profileKey', { required: false }),
            identity.enabled === undefined ? 1 : flag(identity.enabled),
            timestamp,
            timestamp
        ]], 'companion-identity:create');
        return this.findByKey(identityKey);
    },

    async findByKey(identityKey) {
        const rows = await Database.execute([`SELECT ${COLUMNS} FROM companion_identities
            WHERE identityKey = ? COLLATE NOCASE`, [text(identityKey, 'identityKey')]], 'companion-identity:by-key');
        return hydrate(rows[0]);
    },

    async findByAccountName(account) {
        const rows = await Database.execute([`SELECT ${COLUMNS} FROM companion_identities
            WHERE accountName = ? COLLATE NOCASE`, [text(account, 'accountName')]], 'companion-identity:by-account');
        return hydrate(rows[0]);
    },

    async list({ coreOnly = false, enabledOnly = false } = {}) {
        const filters = [];
        if (coreOnly) filters.push('coreMember = 1');
        if (enabledOnly) filters.push('enabled = 1');
        const rows = await Database.execute([`SELECT ${COLUMNS} FROM companion_identities
            ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
            ORDER BY identityKey COLLATE NOCASE ASC`, []], 'companion-identity:list');
        return rows.map(hydrate);
    },

    // The stable key and the owning account are intentionally immutable: they are
    // the anchor other stages will link characters against.
    async update(identityKey, patch = {}) {
        const key = text(identityKey, 'identityKey');
        const fields = MUTABLE.filter((field) => patch[field] !== undefined);
        if (!fields.length) throw new Error('companion identity: nothing to update');
        const values = fields.map((field) => (field === 'displayName' || field === 'profileKey')
            ? text(patch[field], field, { required: false })
            : flag(patch[field]));
        const result = await Database.execute([`UPDATE companion_identities
            SET ${fields.map((field) => `${field} = ?`).join(', ')}, updatedAt = ?
            WHERE identityKey = ? COLLATE NOCASE`, [...values, Date.now(), key]], 'companion-identity:update');
        if (!result.affectedRows) throw new Error(`companion identity: unknown identity ${key}`);
        return this.findByKey(key);
    },

    // Disabling preserves the record and its history; it never deletes.
    setEnabled(identityKey, enabled) {
        return this.update(identityKey, { enabled: flag(enabled) });
    },

    // True when the account is registered as a companion person, enabled or not.
    // A plain bot account has no record here and stays a plain bot account.
    async isCompanion(account) {
        return !!(await this.findByAccountName(account));
    }
};
