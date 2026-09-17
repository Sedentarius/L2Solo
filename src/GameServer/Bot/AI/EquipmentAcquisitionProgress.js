// A purchased blade is a completed acquisition step, not wearable final gear.
function componentRequirement(plan, targetId = Number(plan?.target?.selfId)) {
    const resultId = Number(plan?.combine?.resultId || 0);
    if (!targetId || !resultId || targetId === resultId) return null;
    const required = (plan.combine.requirements || []).filter(item => Number(item.selfId) === targetId)
        .reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0)), 0);
    return required > 0 ? { resultId, amount: required } : null;
}
function componentAcquired(state, plan = state?.stats?.equipmentPlan) {
    const required = componentRequirement(plan);
    return !!required && Number(state?.inventory?.[String(plan.target.selfId)]?.amount || 0) >= required.amount;
}
module.exports = { componentRequirement, componentAcquired };
