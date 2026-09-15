// Pure equipment calculation shared by the main-thread harnesses and the worker.
const GearAcquisitionPlanner = invoke('GameServer/Bot/AI/GearAcquisitionPlanner');
const DataCache = invoke('GameServer/DataCache');
const Policy = require('./ClanEquipmentPolicy');
const Config = require('./ClanSimulationConfig');
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function plannerState(member) {
    return {
        ...member,
        characterId: number(member.characterId ?? member.id),
        name: member.name || member.memberName || '',
        stats: { ...(member.stats || {}) },
        inventory: { ...(member.inventory || {}) },
        adena: number(member.adena || member.inventory?.['57']?.amount),
        currentRegion: member.currentRegion || null,
        party: { partyId: member.partyId || null }
    };
}

function existingPlanFor(member) {
    const plan = member?.stats?.equipmentPlan;
    return Policy.isAcquisitionPlan(plan) ? plan : null;
}

function warehouseAvailable(rows = [], selfId) {
    return (rows || [])
        .filter((row) => number(row.selfId) === number(selfId))
        .reduce((sum, row) => sum + Math.max(0, number(row.amount) - number(row.reservedAmount)), 0);
}

function overlayWarehouseMaterials(state, plan, warehouseRows = []) {
    if (plan?.strategy !== 'craft' || !number(plan.recipeId)) return { state, materials: [] };
    const inventory = { ...(state.inventory || {}) };
    const materials = [];
    (plan.materials || []).forEach((material) => {
        const selfId = number(material.selfId);
        const missing = Math.max(0, number(material.missing));
        if (!selfId || missing <= 0) return;
        const available = warehouseAvailable(warehouseRows, selfId);
        const amount = Math.min(missing, available);
        if (amount <= 0) return;
        const current = inventory[String(selfId)] || {};
        inventory[String(selfId)] = {
            ...current,
            selfId,
            name: current.name || (warehouseRows.find((row) => number(row.selfId) === selfId)?.name || `Item ${selfId}`),
            amount: number(current.amount) + amount
        };
        materials.push({ selfId, amount });
    });
    return {
        state: materials.length ? { ...state, inventory } : state,
        materials
    };
}

function planForMember(member, spots = [], warehouseRows = [], options = {}) {
    const planningMember = options.ignoreExistingPlan ? {
        ...member,
        stats: { ...(member?.stats || {}), equipmentPlan: undefined }
    } : member;
    const existing = existingPlanFor(planningMember);
    const state = plannerState(planningMember);
    const plannerOptions = {
        spots,
        maxExpectedKills: number(options.maxExpectedKills, Config.equipmentMaxExpectedKills),
        spoilCapable: options.spoilCapable === true,
        ...(options.occupancy ? { occupancy: options.occupancy } : {}),
        ...(options.capacityUnits ? { capacityUnits: options.capacityUnits } : {}),
        ...(options.reservationKey ? { reservationKey: options.reservationKey } : {}),
        ...(options.maxReservationGroups ? { maxReservationGroups: options.maxReservationGroups } : {}),
        ...(options.excludedTargetIds ? { excludedTargetIds: options.excludedTargetIds } : {})
    };
    try {
        const rateProfileCurrent = !existing
            || Number(existing.rateModelVersion || 0) >= GearAcquisitionPlanner.RATE_MODEL_VERSION
                && String(existing.rateProfileSignature || '') === GearAcquisitionPlanner.rateProfileSignature();
        if (existing?.strategy === 'market' && !rateProfileCurrent) {
            const refreshed = GearAcquisitionPlanner.planFor(state, {
                ...plannerOptions,
                forceMarketTargetId: existing.strategy === 'market' ? number(existing.target?.selfId) : null
            });
            if (Policy.isAcquisitionPlan(refreshed)) return refreshed;
        }
        if (existing?.status === 'blocked') {
            const targetId = number(existing.target?.selfId);
            return GearAcquisitionPlanner.planFor(state, {
                ...plannerOptions,
                excludedTargetIds: [...new Set([
                    ...(options.excludedTargetIds || []).map(number).filter(Boolean),
                    targetId
                ].filter(Boolean))]
            });
        }
        if (existing && existing.status === 'active' && ['direct_drop', 'craft'].includes(existing.strategy)) {
            const excluded = new Set((options.excludedTargetIds || []).map(number).filter(Boolean));
            const targetExcluded = excluded.has(number(existing.target?.selfId));
            const source = targetExcluded
                ? null
                : GearAcquisitionPlanner.bestSourceForPlan(state, existing, spots, plannerOptions);
            if (source) {
                const routed = GearAcquisitionPlanner.retargetPlanSource(state, existing, source);
                if (!GearAcquisitionPlanner.withinExpectedKillLimit(routed, plannerOptions.maxExpectedKills)) {
                    const targetId = number(existing.target?.selfId);
                    return GearAcquisitionPlanner.planFor(state, {
                        ...plannerOptions,
                        excludedTargetIds: [...new Set([
                            ...(options.excludedTargetIds || []).map(number).filter(Boolean),
                            targetId
                        ].filter(Boolean))]
                    });
                }
                if (existing.strategy !== 'craft') return routed;
                const overlay = overlayWarehouseMaterials(state, routed, warehouseRows);
                return overlay.materials.length ? { ...routed, warehouseMaterials: overlay.materials } : routed;
            }
            if (!targetExcluded && existing.strategy === 'craft' && number(existing.recipeId)) {
                const overlay = overlayWarehouseMaterials(state, existing, warehouseRows);
                const refreshed = GearAcquisitionPlanner.planFor(overlay.state, {
                    ...plannerOptions,
                    recipeId: number(existing.recipeId)
                });
                if (['active', 'ready_to_craft', 'component_ready'].includes(refreshed?.status)) {
                    return overlay.materials.length
                        ? { ...refreshed, warehouseMaterials: overlay.materials }
                        : refreshed;
                }
            }
            const targetId = number(existing.target?.selfId);
            return GearAcquisitionPlanner.planFor(state, {
                ...plannerOptions,
                excludedTargetIds: [...new Set([
                    ...(options.excludedTargetIds || []).map(number).filter(Boolean),
                    targetId
                ])]
            });
        }
        if (existing && GearAcquisitionPlanner.clanGoalPlanLocked(planningMember, existing)) return existing;
        if (existing && existing.strategy !== 'craft') return existing;
        const initial = existing || GearAcquisitionPlanner.planFor(state, plannerOptions);
        if (initial?.strategy !== 'craft' || !number(initial.recipeId)) return initial;
        const overlay = overlayWarehouseMaterials(state, initial, warehouseRows);
        if (!overlay.materials.length) return initial;
        const refreshed = GearAcquisitionPlanner.planFor(overlay.state, {
            ...plannerOptions,
            recipeId: number(initial.recipeId)
        });
        return {
            ...refreshed,
            warehouseMaterials: overlay.materials
        };
    } catch (error) {
        if (options.throwOnError) throw error;
        return { status: 'blocked', reason: 'gear_planner_unavailable', strategy: 'none', target: null };
    }
}

module.exports = { planForMember };
