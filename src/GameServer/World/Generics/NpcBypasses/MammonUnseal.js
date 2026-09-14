const Service = invoke('GameServer/Items/MammonUnsealService');
module.exports = async function(session, parts) {
    try {
        if (parts[1] === 'exchange') {
            await Service.exchange(session,Number(parts[2]),Number(parts[3]));
            Service.menu(session,0,'Your item has been unsealed.');
        } else Service.menu(session,parts[1] === 'page' ? Number(parts[2]) : 0);
    } catch (error) {
        session.dataSendToMe(invoke('GameServer/Network/Response').actionFailed());
    }
};
