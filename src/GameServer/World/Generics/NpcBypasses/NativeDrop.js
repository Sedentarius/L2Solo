const service = invoke('GameServer/World/Generics/NativeKnowledgeBase');
const NpcIndex = invoke('GameServer/World/NpcObjectIndex');
const Protocol = invoke('GameServer/World/Generics/NativeDropProtocol');
const Response = invoke('GameServer/Network/Response');
// Preserve the observer's individual reward rolls, including duplicate items in
// different groups. Summing their percentages would change their meaning.
function rewardRows(detail) {
    return [['drop', detail.drops], ['spoil', detail.spoils]].flatMap(([kind, groups]) =>
        (groups || []).flatMap((g) => g.items.map((item) => ({
            kind, group: g.groupIndex, itemId: item.itemId, name: item.name,
            amount: item.minAmount === item.maxAmount ? String(item.minAmount) : `${item.minAmount}-${item.maxAmount}`,
            chance: Number(item.chancePercent).toFixed(8).replace(/\.?0+$/, '') || '0'
        }))));
}
function handler(session, parts) {
    if (!session?.actor || parts.length !== 4 || parts[1] !== '1') return;
    if (!parts.slice(2).every((v) => /^[1-9]\d{0,9}$/.test(v) && Number(v) <= 2147483647)) return;
    const request = Number(parts[2]), objectId = Number(parts[3]);
    // This endpoint describes only the current target; it does not expose
    // arbitrary world objects or trust a client-supplied display template ID.
    if (Number(session.actor.fetchDestId()) !== objectId) return;
    const now = Date.now();
    if (session.nativeDropAt && now - session.nativeDropAt < 200) return;
    session.nativeDropAt = now;
    const World = invoke('GameServer/World/World');
    const npc = NpcIndex.find(World, objectId);
    const result = { request, objectId, status: 'unavailable', name: '', rows: [] };
    if (npc?.fetchAttackable?.()) {
        const detail = service().npcDetail(npc.fetchSelfId());
        if (detail) {
            result.npcId = Number(npc.fetchSelfId()); result.name = detail.name;
            result.rows = rewardRows(detail); result.status = result.rows.length ? 'ok' : 'empty';
        }
    }
    let body;
    try { body = Protocol.encode(result); }
    catch (_) { body = Protocol.encode({ ...result, status: 'unavailable', rows: [] }); }
    session.dataSendToMe(Response.npcHtml(objectId, body));
}
handler.rewardRows = rewardRows;
module.exports = handler;
