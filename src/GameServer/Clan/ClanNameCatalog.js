const catalog = require('../../../data/clan-names.json');

const entries = Object.freeze(catalog.entries.map((entry) => Object.freeze({ ...entry })));
const VERSION = catalog.version;

function hash(value) {
    let result = 2166136261;
    for (const char of String(value)) {
        result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    }
    return result >>> 0;
}

// Identity, not the leader's display name, determines a stable preference order.
// Every occupied name (including player clans) must be supplied by the caller.
function select(seed, occupiedNames = []) {
    const occupied = new Set(Array.from(occupiedNames, (name) => String(name).toLowerCase()));
    return entries
        .filter((entry) => !occupied.has(entry.name.toLowerCase()))
        .map((entry) => ({ entry, score: hash(`${seed}:${entry.name}`) }))
        .sort((left, right) => right.score - left.score
            || left.entry.name.localeCompare(right.entry.name))[0]?.entry || null;
}

function isLegacyName(name) {
    return /^[A-Za-z0-9]{1,10}Pledge$/.test(String(name || ''));
}

module.exports = { VERSION, entries, sources: catalog.sources, select, isLegacyName };
