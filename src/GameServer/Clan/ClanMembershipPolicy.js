// Membership is authoritative; an old solo plan must not survive joining a clan.
function reconcileState(state, clanId = Number(state?.stats?.clanId || 0)) {
    const current = state.stats || {};
    const plan = current.equipmentPlan;
    const foreignGoal = Number(plan?.clanGoal?.clanId || 0) > 0 && Number(plan.clanGoal.clanId) !== clanId;
    const personalCraft = clanId > 0 && plan?.strategy === 'craft' && Number(plan.clanGoal?.clanId || 0) !== clanId;
    const request = current.partyRequest;
    const invalidRequest = (Number(request?.clanId || 0) > 0 && Number(request.clanId) !== clanId)
        || (clanId > 0 && request?.strategy === 'craft' && !request.clanGoalKey);
    const invalidObjective = current.clanPartyObjective && Number(current.clanPartyObjective.clanId) !== clanId;
    if (Number(current.clanId || 0) === clanId && !foreignGoal && !personalCraft && !invalidRequest && !invalidObjective) return state;
    const stats = { ...current, clanId };
    let activity = state.activity;
    if (personalCraft || foreignGoal) {
        delete stats.equipmentPlan;
        delete stats.craftReturn;
        delete stats.clanMaterialDemand;
        if (/^(equipment_craft|component_craft|dual_sword_combine)/.test(stats.travel?.reason || '')) {
            delete stats.travel;
            if (activity === 'traveling') activity = 'hunting';
        }
        if (activity === 'crafting' && !stats.craftShop && !stats.craftStationId) activity = 'hunting';
    }
    if (invalidRequest) delete stats.partyRequest;
    if (invalidObjective) delete stats.clanPartyObjective;
    return { ...state, activity, stats };
}

function reconcileParty(party, leaderClanId) {
    const objective = party.stats?.objective;
    if (!Number(leaderClanId) || objective?.strategy !== 'craft' || objective.clanGoalKey) return party;
    const stats = { ...party.stats, objective: null, acquisitionGoal: null, lastRequirementRefreshAt: 0 };
    return { ...party, stats };
}

module.exports = { reconcileState, reconcileParty };
