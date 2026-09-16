const Runtime = require('./AutonomousQuestRuntime');

const INSTALL_MARK = Symbol.for('l2solo.botQuestBridge.autonomousHook');

function patchPrototype(Coordinator) {
    const prototype = Coordinator?.prototype;
    if (!prototype || prototype[INSTALL_MARK]) return;
    const originalAfterCommit = prototype.afterCommit;
    const originalContextFor = prototype.contextFor;
    if (typeof originalAfterCommit !== 'function' || typeof originalContextFor !== 'function') return;

    Object.defineProperty(prototype, INSTALL_MARK, { value: true });

    prototype.contextFor = function autonomousQuestContext(state, index) {
        const context = originalContextFor.call(this, state, index);
        if (!context || context.isPartyLeader) return context;
        const targetNpcId = Runtime.targetNpcId(state, context);
        return targetNpcId > 0 ? { ...context, targetNpcId } : context;
    };

    prototype.afterCommit = async function autonomousQuestAfterCommit(entry, result) {
        const state = await originalAfterCommit.call(this, entry, result);
        try {
            const advanced = await Runtime.advance(state, {
                timestamp: Number(entry?.proposal?.enqueuedAt || Date.now())
            });
            return advanced || state;
        } catch (error) {
            // The cold CAS and any quest kill callbacks have already committed.
            // Autonomous planning must never make their ACK retryable.
            utils.infoWarn('BotQuest', 'autonomous quest advance failed for %s: %s',
                state?.characterId || entry?.nextState?.characterId || 'unknown',
                error?.message || error);
            return state;
        }
    };
}

function install(coordinatorModule) {
    if (!coordinatorModule) return coordinatorModule;
    patchPrototype(coordinatorModule.ColdSimulationCoordinator);
    return coordinatorModule;
}

module.exports = {
    INSTALL_MARK,
    install,
    patchPrototype
};
