const Policy = require('./Policy');
const Runtime = require('./Runtime');
const support = require('../../../data/ClanHalls/support.json');
const dateTime = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
    timeZoneName: 'short'
});
const esc = (value) =>
    String(value ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
const messages = {
    clan_ineligible: 'A clan of level 2 or higher is required. Dissolving clans cannot bid.',
    not_leader: 'Only the clan leader can bid or cancel a bid.',
    not_authorized: 'You need clan hall management privileges.',
    auction_closed: 'This auction has ended.',
    already_owns_hall: 'Your clan already owns a hall.',
    already_bidding: 'Your clan is already bidding on another hall.',
    invalid_bid: 'Enter a whole Adena amount at least equal to the minimum and higher than your previous bid.',
    budget_reserved:
        'There is not enough unreserved clan warehouse Adena after protected development and upkeep funds.',
    no_bid: 'Your clan has no active bid.',
    invalid_function: 'This service level is unavailable.',
    manager_needs_mp: 'The manager needs time to recover MP.'
};
const link = (command, label) => `<a action="bypass -h clan-hall ${command}">${esc(label)}</a><br>`;
function hallForNpc(id) {
    return Policy.catalog.halls.find((h) => h.managerIds.includes(Number(id)));
}
function handles(id) {
    return Policy.catalog.auctioneerIds.includes(Number(id)) || !!hallForNpc(id);
}
async function validNpc(session) {
    const active = session.activeNpcTalk,
        actor = session.actor;
    if (!active || !actor || !handles(active.selfId) || actor.isDead?.() || actor.state?.fetchDead?.()) return null;
    const World = invoke('GameServer/World/World');
    const npc = await World.fetchNpc(active.objectId).catch(() => null);
    if (
        !npc ||
        npc.fetchSelfId() !== active.selfId ||
        Math.hypot(
            actor.fetchLocX() - npc.fetchLocX(),
            actor.fetchLocY() - npc.fetchLocY(),
            actor.fetchLocZ() - npc.fetchLocZ()
        ) > 250
    )
        return null;
    return npc;
}
function send(session, body) {
    const response = invoke('GameServer/Network/Response');
    session.dataSendToMe(response.npcHtml(session.activeNpcTalk.objectId, `<html><body>${body}</body></html>`));
    session.dataSendToMe(response.actionFailed());
}
async function render(session, parts = ['clan-hall'], notice = '') {
    const npc = await validNpc(session);
    if (!npc) return;
    const db = invoke('Database'),
        actor = session.actor,
        clanId = Number(actor.fetchClanId?.()) || 0;
    const hall = hallForNpc(npc.fetchSelfId());
    if (!hall) {
        const lots = await db.fetchClanHallAuctions(clanId);
        const selected = parts[1] === 'view' ? lots.find((h) => h.id === Number(parts[2])) : null;
        let body = `Auctioneer<br>${esc(notice)}<br>Bids are paid from your clan warehouse. Other clans cannot see your bid.<br>`;
        if (selected) {
            const def = Policy.definition(selected.id);
            body += `${esc(def.town)}: ${esc(def.name)}<br>Minimum: ${def.minimumBid} Adena<br>Weekly rent: ${def.weeklyRent} Adena<br>`;
            if (!selected.ownerId)
                body +=
                    `Ends: ${esc(dateTime.format(selected.auctionEndsAt))}<br>Your bid: ${selected.ownBid}<br><edit var="amount" width=150><br>` +
                    link(`bid ${def.id} $amount`, 'Place / increase bid');
            else body += 'This hall is owned.<br>';
            body += link('cancel', 'Cancel my bid (10% fee)') + link('list', 'Back');
        } else {
            const page = Math.max(0, Math.min(3, Math.floor(Number(parts[2]) || 0)));
            for (const h of lots.slice(page * 7, page * 7 + 7)) {
                const d = Policy.definition(h.id);
                body += link(`view ${h.id}`, `${d.town}: ${d.name} — ${h.ownerId ? 'Owned' : d.minimumBid + ' Adena'}`);
            }
            if (page > 0) body += link(`list ${page - 1}`, 'Previous');
            if (page < 3) body += link(`list ${page + 1}`, 'Next');
        }
        send(session, body);
        return;
    }
    const owned = Runtime.owned(clanId);
    if (!owned || owned.id !== hall.id) {
        send(session, 'Only members of the owning clan can use this hall.');
        return;
    }
    let body = `${esc(hall.name)}<br>${esc(notice)}<br>Rent: ${hall.weeklyRent} Adena / week<br>Next rent: ${esc(dateTime.format(owned.rentDueAt))}<br>`;
    if (parts[1] === 'support') {
        const buffs = Date.now() < owned.serviceDueAt ? support[owned.functions.support] || [] : [];
        for (const b of buffs) body += link(`buff ${b.id}`, b.name);
        body += link('', 'Back');
    } else {
        body += link('support', 'Support magic');
        body += link('leave', 'Teleport to town');
        for (const [kind, config] of Object.entries(Policy.functions)) {
            if (parts[1] !== 'manage' || parts[2] !== kind) {
                body += link(`manage ${kind}`, `${kind.toUpperCase()}: ${Number(owned.functions[kind]) || 0} — manage`);
                continue;
            }
            body += `<br>${esc(kind.toUpperCase())}: ${Number(owned.functions[kind]) || 0}<br>`;
            body += link(`set ${kind} 0`, 'Disable');
            for (const level of config.levels[hall.grade])
                body += link(`set ${kind} ${level}`, `${level} — ${config.fees[level]} Adena/day`);
        }
    }
    send(session, body);
}
async function handle(session, parts) {
    const npc = await validNpc(session);
    if (!npc) return;
    const db = invoke('Database'),
        actor = session.actor,
        clanId = Number(actor.fetchClanId?.()) || 0,
        actorId = actor.fetchId(),
        isAuctioneer = Policy.catalog.auctioneerIds.includes(npc.fetchSelfId());
    let result;
    if (parts[1] === 'bid' && isAuctioneer)
        result = await db.placeClanHallBid({ clanId, actorId, hallId: Number(parts[2]), amount: Number(parts[3]) });
    if (parts[1] === 'cancel' && isAuctioneer) result = await db.cancelClanHallBid({ clanId, actorId });
    if (parts[1] === 'set' && !isAuctioneer && Runtime.owned(clanId)?.id === hallForNpc(npc.fetchSelfId())?.id)
        result = await db.configureClanHall({ clanId, actorId, kind: parts[2], level: Number(parts[3]) });
    if (parts[1] === 'leave' && !isAuctioneer && Runtime.owned(clanId)?.id === hallForNpc(npc.fetchSelfId())?.id) {
        const coords = invoke('GameServer/World/TownRespawn').getRespawnCoords(
            actor.fetchLocX(),
            actor.fetchLocY(),
            actor.fetchLocZ()
        );
        invoke('GameServer/Actor/Generics/TeleportTo')(session, actor, coords);
        return;
    }
    if (parts[1] === 'buff' && !isAuctioneer) {
        result = require('./Services').cast(session, actor, npc, Number(parts[2]));
    }
    if (result) await Runtime.refresh();
    await render(
        session,
        parts,
        result ? (result.ok ? 'Done.' : messages[result.code] || 'The action is unavailable.') : ''
    );
}
module.exports = { handles, render, handle, validNpc };
