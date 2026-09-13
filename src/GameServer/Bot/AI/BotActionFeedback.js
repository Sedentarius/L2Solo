// Native execution feedback is ephemeral and bounded. Rejected casts get a
// short retry delay; a legitimate resisted/missed attack is never blacklisted.
const actors = new WeakMap();
const RETRY_MS = 2000;
const LIMIT = 8;
function key(actor, target, skill) {
    return `${target?.fetchId?.() || 0}:${skill?.fetchSelfId?.() || 0}:${skill?.fetchLevel?.() || 1}:${actor.backpack?.fetchTotalWeaponKind?.() || ''}`;
}
function record(session, actor, target, skill, status, detail, now = Date.now()) {
    if (!actor || !(String(session?.accountId || '').startsWith('bot_') || session?.constructor?.name === 'BotSession')) return;
    let state = actors.get(actor);
    if (!state) { state = { failures: new Map(), counts: {} }; actors.set(actor, state); }
    state.counts[status] = Math.min(1000000, (state.counts[status] || 0) + 1);
    const id = key(actor, target, skill);
    for (const [entry, until] of state.failures) if (until <= now) state.failures.delete(entry);
    if (status === 'rejected') {
        state.failures.delete(id);
        state.failures.set(id, now + RETRY_MS);
        if (state.failures.size > LIMIT) state.failures.delete(state.failures.keys().next().value);
    } else state.failures.delete(id);
    session.lastSkillOutcome = { skillId: skill?.fetchSelfId?.(), targetId: target?.fetchId?.(), status, detail, at: now };
    session.combatOutcomeCounts = { ...state.counts };
}
function blocked(actor, target, skill, now = Date.now()) {
    return (actors.get(actor)?.failures.get(key(actor, target, skill)) || 0) > now;
}
function effective(outcome = {}) {
    return ['damage','heal','mpRestore','cpRestore','cpDamage','aggroDamage','aggroReduction','spReward']
        .some(field => Number(outcome[field]) > 0)
        || !!(outcome.effect || outcome.selfEffect || outcome.summon || outcome.resurrected || outcome.pulled || outcome.aggroRemoved)
        || Number(outcome.charges) > 0 || outcome.cancelled?.length > 0 || outcome.createdItems?.length > 0;
}
function result(session, actor, target, skill, outcome = {}) {
    record(session,actor,target,skill,effective(outcome)?'effective':'ineffective',outcome.skillType || null);
}
module.exports = { record, result, effective, blocked, RETRY_MS };
