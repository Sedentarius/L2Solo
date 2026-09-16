const ServerResponse = invoke('GameServer/Network/Response');
module.exports = function skillCoolTime(session) {
    if (session.actor) session.dataSendToMe(ServerResponse.skillCoolTime(session.actor));
};
