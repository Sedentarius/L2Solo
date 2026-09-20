const Policy = require('./ClanMembershipPolicy');

module.exports = ({ all, write, inTransaction, now }) => {
    function repairUnsafe(characterIds = null) {
        const ids = characterIds && [...new Set(characterIds.map(Number).filter(Boolean))];
        if (ids && !ids.length) return { members: [], parties: [] };
        const filter = ids ? ` AND members.id IN (${ids.map(() => '?').join(',')})` : '';
        const rows = all(`SELECT life.*, members.clanId AS actualClanId FROM bot_life_state life
            JOIN characters members ON members.id = life.characterId WHERE 1=1${filter}`, ids || []);
        const members = [];
        for (const row of rows) {
            const previous = { activity: row.activity, stats: JSON.parse(row.statsJson || '{}') };
            const repaired = Policy.reconcileState(previous, Number(row.actualClanId || 0));
            if (repaired === previous) continue;
            repaired.stats.clanMembershipVersion = Math.max(now(), Number(previous.stats.clanMembershipVersion || 0) + 1);
            const next = { ...row, activity: repaired.activity, statsJson: JSON.stringify(repaired.stats),
                simulationRevision: Number(row.simulationRevision || 0) + 1, updatedAt: now() };
            write(`UPDATE bot_life_state SET activity = ?, statsJson = ?, simulationRevision = ?, updatedAt = ?
                WHERE characterId = ?`, [next.activity, next.statsJson, next.simulationRevision, next.updatedAt, row.characterId]);
            members.push(next);
        }
        const parties = [];
        for (const row of all(`SELECT parties.*, members.clanId AS actualClanId FROM bot_background_parties parties
            JOIN characters members ON members.id = parties.leaderId
            WHERE parties.status IN ('active', 'hot') AND members.clanId > 0
              AND json_extract(parties.statsJson, '$.objective.strategy') = 'craft'
              AND COALESCE(json_extract(parties.statsJson, '$.objective.clanGoalKey'), '') = ''${filter}`, ids || [])) {
            const repaired = Policy.reconcileParty({ stats: JSON.parse(row.statsJson || '{}') }, row.actualClanId);
            const next = { ...row, statsJson: JSON.stringify(repaired.stats), updatedAt: now() };
            write('UPDATE bot_background_parties SET statsJson = ?, updatedAt = ? WHERE partyId = ?',
                [next.statsJson, next.updatedAt, next.partyId]);
            parties.push(next);
        }
        return { members, parties };
    }

    function publish(result) {
        if (!result?.membershipRepair) return result;
        const { membershipRepair, ...value } = result;
        if (!membershipRepair.members.length && !membershipRepair.parties.length) return value;
        const life = invoke('GameServer/Bot/Population/BotLifeState');
        for (const row of membershipRepair.members) life.acceptClanMembershipState(row);
        const parties = invoke('GameServer/Bot/Population/BackgroundPartyState');
        for (const row of membershipRepair.parties) parties.acceptRow(row);
        return value;
    }

    function reconcile(characterIds = null) {
        return inTransaction(() => {
            const membershipRepair = repairUnsafe(characterIds);
            return { repairedMembers: membershipRepair.members.length, repairedParties: membershipRepair.parties.length, membershipRepair };
        }, 'clan-membership:reconcile').then(publish);
    }
    return { repairUnsafe, publish, reconcile };
};
