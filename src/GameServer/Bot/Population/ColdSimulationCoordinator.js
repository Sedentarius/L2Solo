// Keep the worker/coordinator implementation isolated from optional main-thread
// post-commit extensions. The core blob stays unchanged; install quest kill
// processing first so the autonomous workflow observes the resulting inventory.
const core = require('./ColdSimulationCoordinatorCore');
const questAware = require('../Quest/ColdQuestCommitHook').install(core);

module.exports = require('../Quest/AutonomousQuestHook').install(questAware);
