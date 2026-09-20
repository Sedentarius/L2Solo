// Compatibility entry point; gameplay uses shared atomic quest steps.
module.exports = require('../DeclarativeQuest').create(require('../VillageQuestDefinitions').find(d => d.id === 162));
