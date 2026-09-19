'use strict';

// Cold progression owns counts; instances retain the identity and enchant of
// copies already materialized. A purchase/drop can grow the count before a new
// physical row exists. Never copy the old item's enchant onto that new copy.
function completeInstances(item = {}) {
    if (!Array.isArray(item.instances)) return item;
    const amount = Math.max(0, Math.floor(Number(item.amount) || 0));
    const slots = Array.isArray(item.equippedSlots)
        ? [...new Set(item.equippedSlots.map(Number).filter((slot) => slot > 0))].slice(0, amount)
        : item.instances.filter((instance) => instance.equipped && Number(instance.slot) > 0)
            .map((instance) => Number(instance.slot)).slice(0, amount);
    // When selling surplus, keep worn copies even if they are not first in
    // instance order. Preserve the slot of each surviving equipped copy.
    const instances = item.instances.map((instance) => ({
        ...instance, enchant: Math.max(0, Number(instance.enchant ?? item.enchant ?? 0) || 0)
    }))
        .sort((a, b) => Number(b.equipped && slots.includes(Number(b.slot)))
            - Number(a.equipped && slots.includes(Number(a.slot))))
        .slice(0, amount);
    while (instances.length < amount) instances.push({ id: null, amount: 1, enchant: 0, equipped: false, slot: 0 });
    const remaining = new Set(slots);
    for (const instance of instances) {
        const slot = Number(instance.slot);
        instance.equipped = !!instance.equipped && remaining.delete(slot);
        instance.slot = instance.equipped ? slot : 0;
        instance.amount = 1;
    }
    for (const instance of instances) {
        if (instance.equipped || !remaining.size) continue;
        instance.slot = remaining.values().next().value;
        instance.equipped = true;
        remaining.delete(instance.slot);
    }
    const enchants = [...new Set(instances.map((instance) => Number(instance.enchant || 0)))];
    return { ...item, instances, enchant: enchants.length === 1 ? enchants[0] : null };
}

function itemValue(item, method, field, fallback = null) {
    if (typeof item?.[method] === 'function') return item[method]();
    if (item?.[field] !== undefined) return item[field];
    return fallback;
}

// Build the same lifecycle summary from a materialized Backpack that cold
// simulation uses after a handoff. QuestService remains authoritative for the
// physical item rows; this is only the compact cold projection of those rows.
function fromItems(items = []) {
    return canonicalize((items || []).reduce((summary, item) => {
        const selfId = Number(itemValue(item, 'fetchSelfId', 'selfId', 0));
        const amount = Math.max(0, Number(itemValue(item, 'fetchAmount', 'amount', 0)) || 0);
        if (!selfId || amount <= 0) return summary;
        const key = String(selfId);
        const stackable = !!itemValue(item, 'fetchStackable', 'stackable', false);
        const equipped = !!itemValue(item, 'fetchEquipped', 'equipped', false);
        const slot = Number(itemValue(item, 'fetchSlot', 'slot', 0)) || 0;
        const enchant = Math.max(0, Number(itemValue(item, 'fetchEnchantLevel', 'enchant', 0)) || 0);
        const id = Number(itemValue(item, 'fetchId', 'id', 0)) || null;
        const name = itemValue(item, 'fetchName', 'name', `Item ${selfId}`);
        const rank = itemValue(item, 'fetchRank', 'rank', 'none') || 'none';
        const kind = itemValue(item, 'fetchKind', 'kind', '') || '';

        if (!stackable) {
            const current = summary[key] || {
                selfId, name, amount: 0, equipped: false, equippedCount: 0,
                equippedSlots: [], stackable: false, slot, rank, kind,
                enchant: null, instances: []
            };
            const instance = { id, amount, enchant, equipped, slot: equipped ? slot : 0 };
            const instances = [...current.instances, instance];
            const equippedSlots = [...new Set(instances
                .filter((entry) => entry.equipped && Number(entry.slot) > 0)
                .map((entry) => Number(entry.slot)))].sort((a, b) => a - b);
            const enchants = [...new Set(instances.map((entry) => Number(entry.enchant) || 0))];
            summary[key] = {
                ...current,
                amount: instances.reduce((total, entry) => total + Number(entry.amount || 0), 0),
                equipped: equippedSlots.length > 0,
                equippedCount: equippedSlots.length,
                equippedSlots,
                enchant: enchants.length === 1 ? enchants[0] : null,
                instances
            };
            return summary;
        }

        const current = summary[key];
        const equippedSlots = [...new Set([
            ...(current?.equippedSlots || []),
            ...(equipped && slot > 0 ? [slot] : [])
        ])].sort((a, b) => a - b);
        const currentEnchant = current?.enchant;
        summary[key] = {
            selfId,
            id: Number(current?.id || id) || null,
            name,
            amount: Number(current?.amount || 0) + amount,
            equipped: equippedSlots.length > 0,
            equippedCount: equippedSlots.length,
            equippedSlots,
            stackable: true,
            slot: Number(current?.slot || slot),
            rank,
            kind,
            enchant: current
                ? (currentEnchant !== null && Number(currentEnchant) === enchant ? enchant : null)
                : enchant
        };
        return summary;
    }, {}));
}

function canonicalize(inventory = {}) {
    return Object.entries(inventory || {}).reduce((summary, [key, item]) => {
        if (!item || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) return summary;
        summary[key] = completeInstances(item);
        return summary;
    }, {});
}

module.exports = {
    canonicalize,
    completeInstances,
    fromItems
};
