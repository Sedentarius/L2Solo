// Compatibility entry point; gameplay uses shared atomic quest steps.
module.exports = require('../DeclarativeQuest').create(require('../StarterQuestDefinitions').find(d => d.id === 7));
