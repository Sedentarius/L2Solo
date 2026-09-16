const Runtime = require('./ColdQuestRuntime');

const INSTALL_MARK = Symbol.for('l2solo.botQuestBridge.coldCommitHook');

function patchPrototype(Coordinator) {
    const prototype = Coordinator?.prototype;
    if (!prototype || prototype[INSTALL_MARK]) return;
    const original = prototype.afterCommit;
    if (typeof original !== 'function') return;

    Object.defineProperty(prototype, INSTALL_MARK, { value: true });
    prototype.afterCommit = async function questAwareAfterCommit(entry, result) {
        const state = await original.call(this, entry, result);
        try {
            const questResult = await Runtime.processCommittedKills(entry, state);
            return questResult?.state || state;
        } catch (error) {
            // The cold state commit already succeeded. Quest post-processing is
            // deliberately fail-closed and must never turn that commit into a
            // failed ACK/retry that could duplicate economic consequences.
            utils.infoWarn('BotQuest', 'post-commit quest processing failed for %s: %s',
                entry?.nextState?.characterId || 'unknown', error?.message || error);
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
