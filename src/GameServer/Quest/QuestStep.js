const Database = invoke('Database');
const DataCache = invoke('GameServer/DataCache');
const Response = invoke('GameServer/Network/Response');

// One compare-and-swap transaction for state, hand-in and reward. The caller
// must be a server-authored handler that has validated its NPC and conditions.
async function apply(state, { takes = [], gives = [], variables = state.variables, status = 'started' }) {
    const actor = state.session.actor;
    const next = { state: status, variables: { ...variables } };
    const rewards = gives.map(([selfId, amount]) => {
        const template = DataCache.items.find(item => item.selfId === selfId);
        if (!template) throw new Error(`Missing quest item ${selfId}`);
        return { selfId, amount, name: template.template.name, stackable: template.etc.stackable };
    });
    const rows = await Database.applyQuestStep(actor.fetchId(), state.quest.id,
        { state: state.state, variables: state.variables }, next,
        takes.map(([selfId, amount]) => ({ selfId, amount })), rewards);
    for (const row of rows) {
        const item = actor.backpack.fetchItemRaw(row.id);
        if (!row.amount) {
            // Quest trial weapons may be equipped at the final hand-in.
            if (item?.fetchEquipped?.()) actor.backpack.unequipPaperdoll(item.fetchSlot());
            actor.backpack.items = actor.backpack.items.filter(i => i.fetchId() !== row.id);
        } else if (item) item.setAmount(row.amount);
        else actor.backpack.insertItem(row.id, row.selfId, row);
    }
    state.state = next.state;
    state.variables = next.variables;
    state.session.dataSendToMe(Response.itemsList(actor.backpack.fetchItems()));
    for (const [id, amount] of gives) invoke('GameServer/Quest/QuestService').transmitItemReceived(state.session, id, amount);
    return { ok: true };
}
module.exports = { apply };
