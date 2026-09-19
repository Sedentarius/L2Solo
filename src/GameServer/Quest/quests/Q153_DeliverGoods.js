// Compatibility entry point; gameplay uses shared atomic quest steps.
module.exports = require('../DeclarativeQuest').create(require('../RecoveredLowLevelDefinitions').find(d => d.id === 153));
