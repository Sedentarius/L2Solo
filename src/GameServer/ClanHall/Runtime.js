const Policy = require('./Policy');
let halls = [],
    timer = null,
    running = false,
    clanOffset = 0;
const memberOffsets = new Map();
function applyRows(rows) {
    halls = rows.map((h) => ({ ...Policy.definition(h.id), ...h, functions: JSON.parse(h.functionsJson || '{}') }));
}
function owned(clanId) {
    return Number(clanId) > 0 ? halls.find((h) => h.ownerId === Number(clanId)) || null : null;
}
function forActor(actor) {
    return owned(actor?.fetchClanId?.());
}
function refresh(rows) {
    const before = new Map(halls.map((h) => [h.id, h.ownerId]));
    applyRows(rows);
    const World = invoke('GameServer/World/World'),
        response = invoke('GameServer/Network/Response');
    for (const h of halls) {
        if (before.get(h.id) === h.ownerId) continue;
        require('./Doors').change(h.id, false);
        for (const session of World.user?.sessions || []) {
            const actor = session.actor,
                id = actor?.fetchClanId?.();
            if (id && (id === h.ownerId || id === before.get(h.id))) {
                const clan = invoke('GameServer/Clan/ClanService').findById(id);
                if (clan) {
                    session.dataSendToMe(response.pledgeShowInfoUpdate(clan));
                    // Lisvus Auction.removeBids / ClanHall.RentTask: notify online clan members.
                    session.dataSendToMe(id === h.ownerId
                        ? response.systemMessage(776, clan.name)
                        : response.systemMessage(1052));
                }
            }
            if (before.get(h.id) > 0 && Policy.inside(h, actor || {}) && id !== h.ownerId) {
                const coords = invoke('GameServer/World/TownRespawn').getRespawnCoords(
                    actor.fetchLocX(),
                    actor.fetchLocY(),
                    actor.fetchLocZ()
                );
                invoke('GameServer/Actor/Generics/TeleportTo')(session, actor, coords);
            }
        }
    }
}
async function tick() {
    if (running) return;
    running = true;
    try {
        const db = invoke('Database');
        refresh(await db.tickClanHalls());
        if (!invoke('GameServer/Clan/ClanSimulationConfig').enabled) return;
        const clans = await db.execute(
            [
                `SELECT c.id FROM clans c JOIN clan_simulation_clans s ON s.clanId=c.id
            WHERE c.level>=2 AND s.mode='autonomous' ORDER BY c.id`,
                []
            ],
            'clan-hall:bot-clans'
        );
        const deadline = Date.now() + 40;
        let count = 0;
        while (clans.length && count < clans.length && Date.now() < deadline) {
            const id = clans[clanOffset % clans.length].id;
            clanOffset++;
            count++;
            await db.planClanHallFinance(id);
            const members = await db.execute(
                [
                    `SELECT c.id FROM characters c JOIN bot_life_state l ON l.characterId=c.id
                WHERE c.clanId=? AND l.phase='cold' AND c.username NOT LIKE 'bot_craft_%' ORDER BY c.id`,
                    [id]
                ],
                'clan-hall:contributors'
            );
            const start = memberOffsets.get(id) || 0;
            for (let i = 0; i < Math.min(4, members.length); i++) {
                const characterId = members[(start + i) % members.length].id;
                const life = invoke('GameServer/Bot/Population/BotLifeState');
                await life.settleWrites([characterId]);
                const result = await db.contributeClanHall({ clanId: id, characterId });
                const current = life.cachedState(characterId);
                if (
                    result.row &&
                    (!current ||
                        (current.phase === 'cold' &&
                            Number(current.simulation?.revision || 0) <= result.row.simulationRevision))
                )
                    life.acceptLifecycleRow(result.row);
            }
            memberOffsets.set(id, start + Math.min(4, members.length));
        }
        refresh(await db.fetchClanHallAuctions());
    } finally {
        running = false;
    }
}
module.exports = {
    Policy,
    applyRows,
    owned,
    forActor,
    tick,
    all: () => halls,
    async start() {
        this.stop();
        applyRows(await invoke('Database').initClanHalls());
        require('./Doors').start(invoke('GameServer/World/World'));
        timer = setInterval(
            () => tick().catch((e) => utils.infoWarn('ClanHall', 'finance tick: %s', e.message)),
            10000
        );
        timer.unref?.();
    },
    stop() {
        if (timer) clearInterval(timer);
        timer = null;
    },
    async refresh() {
        refresh(await invoke('Database').fetchClanHallAuctions());
    },
    destination(actor) {
        return forActor(actor)?.spawn || null;
    },
    regen(actor, kind) {
        const hall = forActor(actor);
        return hall && Date.now() < hall.serviceDueAt && Policy.inside(hall, actor)
            ? 1 + (Number(hall.functions[kind]) || 0) / 100
            : 1;
    },
    expRestore(actor) {
        const h = forActor(actor);
        return h && Date.now() < h.serviceDueAt ? Number(h.functions.exp) || 0 : 0;
    }
};
