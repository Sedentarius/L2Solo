const ServerResponse = invoke('GameServer/Network/Response');
const EffectStore = invoke('GameServer/Effects/EffectStore');
const EffectTicker = invoke('GameServer/Effects/EffectTicker');
const calculateStats = invoke('GameServer/Actor/Generics/CalculateStats');
const ChargeLifecycle = invoke('GameServer/Skills/ChargeLifecycle');

function clearEffectsOnDeath(session, actor) {
    EffectTicker.clearAll(actor);
    // Death removes abnormal effects in C4. Clear both the authoritative store
    // and legacy/UI bookkeeping so a later support pass sees the revived member
    // as genuinely unbuffed.
    actor.effects = {};
    actor.activeBuffs = {};
    actor.supportReservations = {};
    EffectStore.prune(actor);
    calculateStats(session, actor);
    EffectTicker.refreshEffects(session, actor);
}

function resolveDeathCause(context = {}, fallbackActor = null) {
    const source = context.source || context.killer || fallbackActor;
    const resolvedKiller = context.killer || null;
    const killerPlayable = !!source && !source.fetchKind;
    return {
        source,
        killerPlayable,
        // A pet/servitor can remain a non-playable damage source for EXP while
        // still being recognized as player-caused for death-item-drop rules.
        playerControlledKiller: killerPlayable || (!!resolvedKiller && !resolvedKiller.fetchKind)
    };
}

function die(session, actor, context = {}) {
    if (actor.isDead()) {
        return;
    }

    const victimSession = actor.session || session;
    const ArenaDuelService = invoke('GameServer/World/ArenaDuelService');
    if (typeof actor.fetchExp === 'function' && typeof actor.setExpSp === 'function' && !actor.fetchKind) {
        const cause = resolveDeathCause(context, session?.actor);
        const deathContext = {
            timestamp: Number(context.timestamp || Date.now()),
            arena: victimSession?.arenaEphemeral === true || !!victimSession?.arenaDuelId
                || !!ArenaDuelService.duelForActor?.(actor),
            // Keep the existing DeathExperience classification unchanged: a
            // pet/servitor source remains non-playable here until its EXP rule
            // is independently established for C4.
            killerPlayable: cause.killerPlayable,
            // Item-drop rules must still recognize a player-owned pet/servitor
            // as a PvP cause. ReceivedHit supplies the resolved owning character
            // through context.killer when one exists.
            playerControlledKiller: cause.playerControlledKiller,
            clanWar: context.clanWar === true,
            festival: context.festival === true,
            event: context.event === true,
            duel: context.duel === true,
            olympiad: context.olympiad === true,
            lucky: context.lucky === true,
            pvpZone: context.pvpZone === true,
            siegeZone: context.siegeZone === true,
            siegeParticipant: context.siegeParticipant === true,
            killerSiegeNpc: context.killerSiegeNpc === true,
            ...(context.deathKey ? { deathKey: context.deathKey } : {})
        };
        invoke('GameServer/Progression/DeathExperience').applyDeathPenalty(victimSession, actor, deathContext);
        invoke('GameServer/Progression/DeathItemDrop').applyHotDeath(
            victimSession,
            actor,
            deathContext,
            typeof context.rng === 'function' ? context.rng : Math.random
        );
    }

    if ((actor.fetchMounted?.() || actor.mounted) && actor.pet?.petData) invoke('GameServer/Pets/PetRuntime').die(actor.pet);
    actor.destructor();
    ChargeLifecycle.clear(session, actor);
    clearEffectsOnDeath(session, actor);
    // Death cancels the timers that normally release transient action flags
    // (cast, hit, sit animation, pickup). Reset them explicitly so a town
    // restart cannot leave the actor permanently blocked after those timers
    // have been cancelled.
    actor.state.destructor();
    actor.state.setDead(true);
    session.dataSendToMeAndOthers(ServerResponse.die(actor.fetchId()), actor);
    invoke('GameServer/Clan/ClanAllianceService').onDeath(victimSession);
    // ReceivedHit is invoked with the attacker's session, while the actor
    // being killed owns the authoritative victim session. Arena death must
    // therefore be routed through actor.session or the player death branch
    // is missed whenever the ephemeral clone lands the final hit.
    if (ArenaDuelService.onPlayerDeath?.(victimSession)) return;
    if (session?.accountId?.startsWith?.('bot_') && session.arenaEphemeral !== true) {
        Promise.resolve(invoke('GameServer/Bot/AI/BotEventJournal').record({
            botId: actor.fetchId(),
            eventType: 'death',
            summary: `${actor.fetchName?.() || 'Bot'} died.`,
            weight: 5,
            dedupeKey: `death:${actor.fetchId()}`,
            coalesceWindowMs: 5000
        })).catch(() => {});
    }
}

module.exports = die;
module.exports.resolveDeathCause = resolveDeathCause;
