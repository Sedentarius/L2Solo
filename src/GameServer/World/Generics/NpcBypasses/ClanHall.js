module.exports = (session, parts) => invoke('GameServer/ClanHall/Npc').handle(session, parts)
    .catch((error) => utils.infoWarn('ClanHall', 'NPC action failed: %s', error.message));
