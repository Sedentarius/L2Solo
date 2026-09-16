// Keep the worker/coordinator implementation isolated from optional main-thread
// post-commit extensions. The core blob stays unchanged; this wrapper installs
// the Quest Bridge hook before exposing the same public coordinator API.
const core = require('./ColdSimulationCoordinatorCore');

module.exports = require('../Quest/ColdQuestCommitHook').install(core);
