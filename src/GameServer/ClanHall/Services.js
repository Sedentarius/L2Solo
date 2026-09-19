const Runtime = require('./Runtime');
const support = require('../../../data/ClanHalls/support.json');
const Effects = invoke('GameServer/Effects/EffectStore');
const Loadout = invoke('GameServer/Bot/AI/PartyBuffLoadout');
const REFRESH_MS = 120000;
const skills = new Map();
let cachedSpawns,
    managers = new Map();

function skillFor(entry) {
    const key = `${entry.id}:${entry.level}`;
    if (skills.has(key)) return skills.get(key);
    const data = invoke('GameServer/DataCache').skills.find((s) => s.selfId === entry.id);
    const level = data?.levels.find((l) => l.level === entry.level);
    if (!level) return null;
    const skill = new (invoke('GameServer/Model/Skill'))({ ...utils.crushOb(data), ...level });
    skills.set(key, skill);
    return skill;
}
function available(hall, timestamp = Date.now()) {
    return hall && hall.ownerId > 0 && timestamp < hall.serviceDueAt;
}
function manager(hall) {
    if (!hall) return null;
    const spawns = invoke('GameServer/World/World').npc?.spawns || [];
    if (spawns !== cachedSpawns) {
        cachedSpawns = spawns;
        managers = new Map();
    }
    const known = managers.get(hall.id);
    if (known && !known.isDead?.()) return known;
    const npc = spawns.find((n) => hall.managerIds.includes(Number(n.fetchSelfId?.())));
    if (npc) managers.set(hall.id, npc);
    return npc || null;
}
function point(actor) {
    return { locX: actor.fetchLocX(), locY: actor.fetchLocY(), locZ: actor.fetchLocZ() };
}
function near(actor, npc) {
    if (!actor || !npc) return false;
    const a = point(actor),
        b = point(npc);
    return (
        Math.hypot(a.locX - b.locX, a.locY - b.locY, a.locZ - b.locZ) <= 250 &&
        invoke('GameServer/Bot/AI/TownNpcApproach').hasLineOfSight(a, b)
    );
}
function effectFor(skill, timestamp = Date.now()) {
    const s = skill.fetchSemantic();
    return {
        key: s.effect,
        id: skill.fetchSelfId(),
        level: skill.fetchLevel(),
        name: skill.fetchName(),
        type: s.effectType || 'buff',
        negateType: 'BUFF',
        magicLevel: s.magicLevel,
        category: s.effectTrait || s.trait || s.effect,
        stackFamily: s.stackFamily,
        stackOrder: s.stackOrder,
        dispellable: s.dispellable,
        stats: s.stats || {},
        conditionalStats: s.conditionalStats || [],
        situationalStats: s.situationalStats || [],
        expiresAt: timestamp + Number(s.durationMs ?? skill.fetchBuffTime())
    };
}
function missing(actor, hall, timestamp = Date.now(), threshold = REFRESH_MS) {
    if (!available(hall, timestamp)) return [];
    const effects = Effects.list(actor).filter((e) => !e.expiresAt || e.expiresAt > timestamp);
    const count = effects.filter(Effects.includedInBuffCount).length;
    let slots = Math.max(
        0,
        Effects.BUFF_LIMIT -
            Math.max(0, effects.filter((e) => e.type === 'debuff').length - Effects.DEBUFF_RESERVED_SLOTS) -
            count
    );
    return (support[hall.functions.support] || [])
        .map(skillFor)
        .filter(Boolean)
        .filter((skill) => {
            if (!Loadout.useful(actor, skill)) return false;
            const desired = effectFor(skill, timestamp);
            const matching = effects.filter(
                (e) => e.key === desired.key || (desired.stackFamily && e.stackFamily === desired.stackFamily)
            );
            const strength = (e) => Number(e.stackFamily ? e.stackOrder || 0 : e.level || 0);
            if (
                matching.some(
                    (e) =>
                        strength(e) > strength(desired) ||
                        (strength(e) === strength(desired) && (!e.expiresAt || e.expiresAt - timestamp > threshold))
                )
            )
                return false;
            if (!matching.length && slots-- <= 0) return false;
            return true;
        });
}
function authorized(actor, npc, hall, timestamp = Date.now()) {
    return (
        available(hall, timestamp) &&
        hall.ownerId === Number(actor.fetchClanId?.()) &&
        hall.managerIds.includes(Number(npc?.fetchSelfId?.())) &&
        !npc?.isDead?.() &&
        !actor.isDead?.() &&
        !actor.state?.fetchDead?.() &&
        near(actor, npc)
    );
}
function cast(session, actor, npc, id, timestamp = Date.now(), cold = false) {
    const hall = Runtime.forActor(actor);
    if (!authorized(actor, npc, hall, timestamp)) return { ok: false, code: 'not_authorized' };
    const entry = support[hall.functions.support]?.find((b) => b.id === Number(id));
    const skill = entry && skillFor(entry);
    if (!skill) return { ok: false, code: 'invalid_function' };
    const mp = Number(skill.fetchConsumedMp()) || 0;
    if (npc.fetchMp() < mp) return { ok: false, code: 'manager_needs_mp' };
    const effect = cold
        ? Effects.apply(actor, effectFor(skill, timestamp))
        : invoke('GameServer/Skills/C4SkillEffects').execute(session, npc, actor, skill, { magicSkill: true })?.effect;
    if (!effect && cold) return { ok: false, code: 'stronger_effect' };
    npc.setMp(npc.fetchMp() - mp);
    npc.automation?.replenishVitals(npc);
    if (!cold && session?.dataSendToMeAndOthers)
        session.dataSendToMeAndOthers(
            invoke('GameServer/Network/Response').skillStarted(npc, actor.fetchId(), skill),
            npc
        );
    return { ok: true, effect, skill };
}
function recovery(actor, hall) {
    if (!available(hall)) return false;
    return (
        (hall.functions.hp > 0 && actor.fetchHp() < actor.fetchMaxHp() * 0.95) ||
        (hall.functions.mp > 0 &&
            invoke('GameServer/Bot/AI/BotRoles').shouldRestForMana(actor) &&
            actor.fetchMp() < actor.fetchMaxMp() * 0.95)
    );
}
module.exports = {
    REFRESH_MS,
    skillFor,
    available,
    manager,
    point,
    near,
    effectFor,
    missing,
    authorized,
    cast,
    recovery
};
