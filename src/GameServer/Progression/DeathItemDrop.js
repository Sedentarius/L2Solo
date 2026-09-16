const Database = invoke('Database');

// C4 reference defaults. The five-object cap follows the contemporary
// gameplay tip; C4 L2J reference packs expose lower/higher configurable caps.
const MAX_DROPS = 5;
const NORMAL_RATES = Object.freeze({ overall: 5, inventory: 70, equipment: 25, weapon: 5 });
const CHAOTIC_RATES = Object.freeze({ overall: 70, inventory: 50, equipment: 40, weapon: 10 });
const CHAOTIC_PK_THRESHOLD = 6;
const LUCKY_SKILL_ID = 194;
const spawningDropIds = new Set();
const PROTECTED_ITEM_IDS = new Set([
    57, 1147, 425, 1146, 461, 10, 2368, 7, 6, 2370, 2369, 6842,
    6611, 6612, 6613, 6614, 6615, 6616, 6617, 6618, 6619, 6620, 6621,
    2375, 3500, 3501, 3502, 4422, 4423, 4424, 4425, 6648, 6649, 6650
]);

function numberValue(subject, getter, ...keys) {
    if (typeof subject?.[getter] === 'function') return Number(subject[getter]()) || 0;
    for (const key of keys) {
        const value = key.split('.').reduce((current, part) => current?.[part], subject);
        if (value !== undefined && value !== null) return Number(value) || 0;
    }
    return 0;
}

function hasLucky(subject, level) {
    if (level > 4) return false;
    const skills = subject?.skillset?.fetchSkills?.() || subject?.skills || subject?.stats?.skills || [];
    return skills.some((skill) => Number(skill?.fetchSelfId?.() ?? skill?.selfId) === LUCKY_SKILL_ID);
}

function protectedContext(subject, context, chaotic) {
    if (context.noPenalty) return context.reason || 'explicit_no_penalty';
    if (context.arena || context.event || context.duel || context.olympiad) {
        return context.arena ? 'arena' : context.event ? 'event' : context.duel ? 'duel' : 'olympiad';
    }
    if (context.festival) return 'festival';
    const level = Math.max(1, numberValue(subject, 'fetchLevel', 'level'));
    if (context.lucky || hasLucky(subject, level)) return 'lucky';
    if (context.pvpZone && context.killerPlayable && !context.siegeZone) return 'pvp_zone';
    if (context.siegeZone && context.siegeParticipant
        && (context.killerPlayable || context.killerSiegeNpc)) return 'siege_participant';
    if (context.clanWar && !chaotic) return 'clan_war';
    return null;
}

function rulesFor(subject, context = {}) {
    const karma = Math.max(0, numberValue(subject, 'fetchKarma', 'karma', 'stats.karma'));
    const pkCount = Math.max(0, numberValue(subject, 'fetchPk', 'pk', 'pkCount', 'stats.pkCount', 'stats.pk'));
    const chaotic = karma > 0;
    const protectedReason = protectedContext(subject, context, chaotic);
    if (protectedReason) return { eligible: false, reason: protectedReason, karma, pkCount, chaotic };
    if (chaotic && pkCount < CHAOTIC_PK_THRESHOLD) {
        return { eligible: false, reason: 'chaotic_pk_protected', karma, pkCount, chaotic };
    }
    if (!chaotic && context.killerPlayable) {
        return { eligible: false, reason: 'ordinary_world_pvp', karma, pkCount, chaotic };
    }
    const level = Math.max(1, numberValue(subject, 'fetchLevel', 'level'));
    if (!chaotic && level <= 4) {
        return { eligible: false, reason: 'new_character', karma, pkCount, chaotic };
    }
    return {
        eligible: true,
        reason: chaotic ? 'chaotic_pk_risk' : 'ordinary_pve_risk',
        karma,
        pkCount,
        chaotic,
        rates: chaotic ? CHAOTIC_RATES : NORMAL_RATES,
        maxDrops: MAX_DROPS
    };
}

function itemValue(item, method, key, fallback = 0) {
    if (typeof item?.[method] === 'function') return item[method]();
    return item?.[key] ?? fallback;
}

function isProtectedItem(item) {
    const selfId = Number(itemValue(item, 'fetchSelfId', 'selfId'));
    const kind = String(itemValue(item, 'fetchKind', 'kind', ''));
    return !selfId || PROTECTED_ITEM_IDS.has(selfId) || /(^|\.)Quest/i.test(kind)
        || item?.droppable === false || item?.dropable === false
        || item?.model?.droppable === false || item?.model?.dropable === false || item?.petLocked === true
        || item?.fetchPetLocked?.() === true;
}

function candidate(item, instance = null) {
    const equipped = !!(instance ? instance.equipped : itemValue(item, 'fetchEquipped', 'equipped', false));
    const kind = String(itemValue(item, 'fetchKind', 'kind', ''));
    const stackable = !!(item?.stackable === true || item?.model?.stackable === true);
    return {
        id: Number(instance?.id ?? itemValue(item, 'fetchId', 'id')) || null,
        selfId: Number(itemValue(item, 'fetchSelfId', 'selfId')),
        name: String(itemValue(item, 'fetchName', 'name', '')),
        amount: Number(instance?.amount ?? itemValue(item, 'fetchAmount', 'amount', 1)) || 1,
        enchant: Number(instance?.enchant ?? itemValue(item, 'fetchEnchantLevel', 'enchant')) || 0,
        equipped,
        slot: Number(instance?.slot ?? itemValue(item, 'fetchSlot', 'slot')) || 0,
        kind,
        stackable,
        category: equipped ? (kind.startsWith('Weapon.') ? 'weapon' : 'equipment') : 'inventory'
    };
}

function buildEligiblePool(subject) {
    const source = subject?.backpack?.fetchItems?.() || Object.values(subject?.inventory || {});
    const sorted = source.flatMap((item) => {
        if (!item || isProtectedItem(item) || Number(itemValue(item, 'fetchAmount', 'amount')) <= 0) return [];
        if (Array.isArray(item.instances) && item.instances.length) {
            return item.instances.filter((instance) => Number(instance?.amount || 0) > 0)
                .map((instance) => candidate(item, instance));
        }
        return [candidate(item)];
    }).sort((left, right) => {
        const leftId = left.id === null ? Number.MAX_SAFE_INTEGER : left.id;
        const rightId = right.id === null ? Number.MAX_SAFE_INTEGER : right.id;
        return leftId - rightId || left.selfId - right.selfId;
    });
    return sorted.reduce((pool, item) => {
        const existing = item.stackable && pool.find((entry) => entry.stackable && entry.selfId === item.selfId);
        if (existing) existing.amount += item.amount;
        else pool.push({ ...item });
        return pool;
    }, []);
}

function rollPercent(rng, percent) {
    return Math.floor(Math.max(0, Math.min(0.999999999, Number(rng()))) * 100) < percent;
}

function calculateDropPlan(subject, context = {}, rng = Math.random) {
    const rules = rulesFor(subject, context);
    const candidates = buildEligiblePool(subject);
    if (!rules.eligible) return { ...rules, candidates, selected: [] };
    if (!candidates.length) return { ...rules, eligible: false, reason: 'no_candidates', candidates, selected: [] };
    if (!rollPercent(rng, rules.rates.overall)) {
        return { ...rules, reason: 'overall_roll_failed', candidates, selected: [] };
    }
    const selected = [];
    for (const item of candidates) {
        if (selected.length >= rules.maxDrops) break;
        if (rollPercent(rng, rules.rates[item.category])) selected.push(item);
    }
    return { ...rules, reason: selected.length ? rules.reason : 'item_rolls_failed', candidates, selected };
}

function compactContext(context = {}) {
    return Object.fromEntries(Object.entries(context).filter(([, value]) =>
        value === null || ['string', 'number', 'boolean'].includes(typeof value)));
}

function deathKeyFor(subject, context = {}, mode = 'hot') {
    const characterId = Number(subject?.fetchId?.() || subject?.characterId || 0);
    const timestamp = Number(context.timestamp || Date.now());
    const deaths = Number(context.deathCount ?? subject?.stats?.deaths ?? 0);
    return String(context.deathKey || `${mode}:${characterId}:${deaths || timestamp}`);
}

function persistenceRecord(subject, plan, context, mode) {
    const characterId = Number(subject?.fetchId?.() || subject?.characterId || 0);
    const timestamp = Number(context.timestamp || Date.now());
    const loc = subject?.loc || {};
    return {
        characterId,
        deathKey: deathKeyFor(subject, context, mode),
        mode,
        reason: plan.reason,
        karma: plan.karma,
        pkCount: plan.pkCount,
        candidateCount: plan.candidates.length,
        selected: plan.selected,
        context: compactContext(context),
        createdAt: timestamp,
        locX: numberValue(subject, 'fetchLocX', 'locX', 'loc.locX'),
        locY: numberValue(subject, 'fetchLocY', 'locY', 'loc.locY'),
        locZ: numberValue(subject, 'fetchLocZ', 'locZ', 'loc.locZ'),
        ...loc
    };
}

function removeColdSelected(inventory, selected) {
    const next = Object.fromEntries(Object.entries(inventory || {}).map(([key, value]) => [key, {
        ...value,
        ...(Array.isArray(value?.instances) ? { instances: value.instances.map((entry) => ({ ...entry })) } : {})
    }]));
    for (const dropped of selected) {
        const key = String(dropped.selfId);
        const item = next[key];
        if (!item) continue;
        if (dropped.stackable || !Array.isArray(item.instances)) {
            delete next[key];
            continue;
        }
        item.instances = item.instances.filter((instance) => Number(instance.id) !== Number(dropped.id));
        item.amount = item.instances.reduce((sum, instance) => sum + Number(instance.amount || 0), 0);
        if (item.amount <= 0) {
            delete next[key];
            continue;
        }
        item.equippedSlots = [...new Set(item.instances.filter((instance) => instance.equipped)
            .map((instance) => Number(instance.slot)).filter((slot) => slot > 0))].sort((a, b) => a - b);
        item.equipped = item.equippedSlots.length > 0;
        item.equippedCount = item.equippedSlots.length;
        const enchants = [...new Set(item.instances.map((instance) => Number(instance.enchant || 0)))];
        item.enchant = enchants.length === 1 ? enchants[0] : null;
    }
    return next;
}

function applyColdDeath(state, context = {}, rng = Math.random) {
    const deathKey = deathKeyFor(state, context, 'cold');
    const previous = state?.stats?.deathItemDrop;
    if (previous?.deathKey === deathKey) {
        return {
            state,
            plan: { ...previous, candidates: [], selected: previous.selected || [], duplicate: true },
            record: previous
        };
    }
    const plan = calculateDropPlan(state, context, rng);
    const record = persistenceRecord(state, plan, context, 'cold');
    const inventory = removeColdSelected(state.inventory, plan.selected);
    return {
        state: {
            ...state,
            inventory,
            stats: {
                ...(state.stats || {}),
                deathItemDrop: record,
                equipment: Object.values(inventory).flatMap((item) => (item.instances || [])
                    .filter((instance) => instance.equipped)
                    .map((instance) => ({ selfId: item.selfId, name: item.name, slot: instance.slot,
                        rank: item.rank || 'none', kind: item.kind || '', enchant: instance.enchant || 0 })))
            }
        },
        plan,
        record
    };
}

function spawnRows(session, rows = []) {
    const World = invoke('GameServer/World/World');
    for (const row of rows) {
        const dropId = Number(row.id);
        if (row.status && row.status !== 'ground') continue;
        if (spawningDropIds.has(dropId)
            || World.items?.spawns?.some((item) => Number(item.fetchDeathDropId?.()) === dropId)) continue;
        spawningDropIds.add(dropId);
        World.spawnItem(session, Number(row.selfId), Number(row.amount), {
            locX: Number(row.locX), locY: Number(row.locY), locZ: Number(row.locZ),
            deathDropId: dropId, sourceItemId: Number(row.sourceItemId),
            enchant: Number(row.enchant || 0), slot: Number(row.slot || 0),
            stackable: Number(row.stackable) === 1,
            petData: row.petData || null
        }, () => {
            spawningDropIds.delete(dropId);
        });
    }
}

function applyHotMemory(session, actor, drops) {
    const backpack = actor?.backpack;
    if (!backpack) return;
    const ids = new Set(drops.map((drop) => Number(drop.sourceItemId)));
    const stackableSelfIds = new Set(drops.filter((drop) => Number(drop.stackable) === 1)
        .map((drop) => Number(drop.selfId)));
    backpack.transferDeathDropItems?.(session, [...ids], [...stackableSelfIds]);
}

function applyHotDeath(session, actor, context = {}, rng = Math.random) {
    const deathKey = deathKeyFor(actor, context, 'hot');
    const previous = actor?.deathItemDrop;
    if (previous?.record?.deathKey === deathKey && !previous.failed) return previous;
    const plan = previous?.record?.deathKey === deathKey
        ? previous.plan
        : calculateDropPlan(actor, context, rng);
    const record = previous?.record?.deathKey === deathKey
        ? previous.record
        : persistenceRecord(actor, plan, context, 'hot');
    if (typeof Database.isReady === 'function' && !Database.isReady()) {
        actor.deathItemDrop = {
            plan,
            record,
            failed: true,
            persistence: Promise.resolve(null)
        };
        return actor.deathItemDrop;
    }
    const persistence = Database.applyCharacterDeathItemDrop(record).then((stored) => {
        if (!stored) return null;
        applyHotMemory(session, actor, stored.drops || []);
        spawnRows(session, stored.drops || []);
        actor.deathItemDrop = { plan, record, stored, persistence: Promise.resolve(stored) };
        utils.infoSuccess('DeathDrop', 'character=%s sequence=%s mode=hot reason=%s karma=%s pk=%s candidates=%s selected=%s',
            record.characterId, stored.deathSequence, plan.reason, plan.karma, plan.pkCount,
            plan.candidates.length, stored.drops?.length || 0);
        return stored;
    }).catch((error) => {
        utils.infoWarn('DeathDrop', 'failed character=%s: %s', record.characterId, error.message);
        if (actor?.deathItemDrop?.record?.deathKey === record.deathKey) actor.deathItemDrop.failed = true;
        return null;
    });
    actor.deathItemDrop = { plan, record, persistence };
    return actor.deathItemDrop;
}

function restoreWorldDrops(world = invoke('GameServer/World/World')) {
    return Database.recoverPendingColdDeathItemDrops().then(() => Database.fetchPendingDeathWorldItems()).then((rows) => {
        spawnRows(null, rows);
        return rows.length;
    });
}

module.exports = {
    MAX_DROPS,
    NORMAL_RATES,
    CHAOTIC_RATES,
    CHAOTIC_PK_THRESHOLD,
    PROTECTED_ITEM_IDS,
    rulesFor,
    buildEligiblePool,
    calculateDropPlan,
    applyColdDeath,
    applyHotDeath,
    restoreWorldDrops,
    spawnRows,
    removeColdSelected,
    persistenceRecord,
    deathKeyFor,
    applyHotMemory
};
