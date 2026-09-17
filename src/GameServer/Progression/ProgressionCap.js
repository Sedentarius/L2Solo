const DataCache = invoke('GameServer/DataCache');

const C4_MAX_LEVEL = 78;

function configValue(config, section, key) {
    return config?.[section]?.[key];
}

function positiveInteger(value, label) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${label} must be an integer greater than zero`);
    }
    return parsed;
}

function validate(config = options.default) {
    const maxLevel = positiveInteger(configValue(config, 'General', 'maxLevel'), 'General.maxLevel');
    const configuredContentCap = configValue(config, 'Progression', 'contentCap');
    const contentCap = configuredContentCap === undefined
        ? maxLevel
        : positiveInteger(configuredContentCap, 'Progression.contentCap');
    if (maxLevel > C4_MAX_LEVEL) {
        throw new Error(`General.maxLevel cannot exceed the Chronicle 4 limit of ${C4_MAX_LEVEL}`);
    }
    if (contentCap > maxLevel) {
        throw new Error('Progression.contentCap cannot exceed General.maxLevel');
    }
    return { maxLevel, contentCap };
}

function maxLevel(config = options.default) {
    return validate(config).maxLevel;
}

function contentCap(config = options.default) {
    return validate(config).contentCap;
}

function effectiveLevelCap(config = options.default) {
    const limits = validate(config);
    return Math.min(limits.maxLevel, limits.contentCap);
}

function clampLevel(level, config = options.default) {
    return Math.max(1, Math.min(Number(level) || 1, effectiveLevelCap(config)));
}

function experienceTable(table = DataCache.experience) {
    if (!Array.isArray(table) || table.length < 2) {
        throw new Error('Experience table is unavailable');
    }
    return table;
}

function maximumAllowedExperience(config = options.default, table = DataCache.experience) {
    const experience = experienceTable(table);
    const levelCap = effectiveLevelCap(config);
    if (levelCap >= experience.length) {
        throw new Error(`Experience table has no upper boundary for level ${levelCap}`);
    }
    return Math.max(0, Number(experience[levelCap]) - 1);
}

function clampTotalExperience(totalExp, config = options.default, table = DataCache.experience) {
    return Math.max(0, Math.min(Number(totalExp) || 0, maximumAllowedExperience(config, table)));
}

function applyAward(currentExp, requestedExp, config = options.default, table = DataCache.experience) {
    const current = Math.max(0, Number(currentExp) || 0);
    const requested = Math.max(0, Number(requestedExp) || 0);
    const totalExp = clampTotalExperience(current + requested, config, table);
    const accepted = Math.max(0, totalExp - Math.min(current, totalExp));
    return {
        requested,
        accepted,
        discarded: Math.max(0, requested - accepted),
        totalExp
    };
}

function levelForExperience(totalExp, fallback = 1, config = options.default, table = DataCache.experience) {
    const experience = experienceTable(table);
    const cap = effectiveLevelCap(config);
    const value = clampTotalExperience(totalExp, config, experience);
    for (let level = cap; level >= 1; level--) {
        if (value >= Number(experience[level - 1] || 0)) return level;
    }
    return Math.max(1, Math.min(cap, Number(fallback) || 1));
}

function isAtContentCap(subject, config = options.default, table = DataCache.experience) {
    const level = typeof subject?.fetchLevel === 'function' ? subject.fetchLevel() : subject?.level;
    const exp = typeof subject?.fetchExp === 'function' ? subject.fetchExp() : subject?.exp;
    return Number(level || 1) >= effectiveLevelCap(config)
        && Number(exp || 0) >= maximumAllowedExperience(config, table);
}

module.exports = {
    C4_MAX_LEVEL,
    validate,
    maxLevel,
    contentCap,
    effectiveLevelCap,
    clampLevel,
    maximumAllowedExperience,
    clampTotalExperience,
    applyAward,
    levelForExperience,
    isAtContentCap
};
