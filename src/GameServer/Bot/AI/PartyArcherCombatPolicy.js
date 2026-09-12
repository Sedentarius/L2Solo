const PartyCombatState = invoke('GameServer/Bot/AI/PartyCombatState');
const BotRoles = invoke('GameServer/Bot/AI/BotRoles');
const EffectStore = invoke('GameServer/Effects/EffectStore');

const PARTY_RADIUS = 1500;
const VULNERABLE_ROLES = new Set(['archer', 'mage', 'healer', 'buffer']);

function distance(a, b) {
    return Math.hypot(
        Number(a?.fetchLocX?.() || 0) - Number(b?.fetchLocX?.() || 0),
        Number(a?.fetchLocY?.() || 0) - Number(b?.fetchLocY?.() || 0)
    );
}

function conserveSkills(session, bot, target, { pvp = false, role = BotRoles.combatRoleFor(bot) } = {}) {
    if (pvp || role !== 'archer') return false;
    const leader = session?.partyCompanion && session.followPlayerSession
        ? session.followPlayerSession
        : (session?.hotBackgroundPartyId ? session : null);
    if (!leader) return false;

    const members = [...new Set([bot, ...PartyCombatState.partySessions(leader).map(member => member.actor)])]
        .filter(actor => actor && !actor.isDead?.() && !actor.state?.fetchDead?.() && distance(bot, actor) <= PARTY_RADIUS);
    if (members.some(actor => Number(actor.fetchMaxHp?.()) > 0 &&
        Number(actor.fetchHp?.()) / Number(actor.fetchMaxHp()) < 0.5)) return false;

    const memberById = new Map(members.map(actor => [Number(actor.fetchId?.() || 0), actor])
        .filter(([id]) => id > 0));
    const world = invoke('GameServer/World/World');
    const threats = new Set();
    // Ordinary aggro on a healthy frontliner is normal farming. Only active,
    // uncontrolled attackers count as adds; nearby idle mobs do not.
    for (const member of members) {
        for (const npc of [target, ...(world.fetchNpcsInRadius?.(
            member.fetchLocX?.() || 0, member.fetchLocY?.() || 0, PARTY_RADIUS
        ) || [])]) {
            if (!npc?.fetchAttackable?.() || npc.isDead?.() || npc.state?.fetchDead?.() ||
                EffectStore.impairments(npc).disabled) continue;
            const victim = memberById.get(Number(npc.fetchDestId?.() || 0));
            if (!victim || distance(npc, victim) > PARTY_RADIUS) continue;
            if (VULNERABLE_ROLES.has(BotRoles.combatRoleFor(victim))) return false;
            threats.add(npc.fetchId());
            if (threats.size >= 2) return false;
        }
    }
    return true;
}

function reviewAutoAttack(session, bot, target, options = {}) {
    if (!session?.partyCompanion || !session.followPlayerSession ||
        BotRoles.combatRoleFor(bot) !== 'archer' || !bot.state?.fetchHits?.() ||
        bot.state?.fetchCasts?.() || !bot.automation?.abortAll) return false;
    const restrictions = invoke('GameServer/Effects/EffectRestrictions');
    if (!restrictions.canUseBasicAction(bot) || !restrictions.canCast(bot)) return false;
    const now = Date.now();
    if (now - Number(session.partyArcherSkillReviewAt || 0) < 1000) return false;
    session.partyArcherSkillReviewAt = now;
    if (conserveSkills(session, bot, target, options)) return false;
    const raidSafety = invoke('GameServer/Bot/AI/BotRaidSafety');
    const policy = {
        ...invoke('GameServer/Bot/AI/HotBotPolicyOverlay').combatPolicy(session),
        pvp: options.pvp === true,
        avoidAreaDamage: options.avoidAreaDamage === true || (
            raidSafety.isProtectedRaidEntity(target) && raidSafety.hasControlledRaidMinion(target)
        )
    };
    const decision = invoke('GameServer/Bot/AI/BotCombatUtility').select(bot, target, 'archer', policy);
    if (!decision || distance(bot, target) > decision.range) return false;
    // Native auto-attacks never yield an idle following tick. Release them
    // only for an available shot; the caller then uses normal combat dispatch.
    invoke('GameServer/Bot/AI/BotPvpTactics').stop(session, bot);
    return true;
}

module.exports = { conserveSkills, reviewAutoAttack };
