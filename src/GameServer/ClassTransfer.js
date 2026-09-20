const Database = invoke('Database');
const CalculateStats = invoke('GameServer/Actor/Generics/CalculateStats');
const ServerResponse = invoke('GameServer/Network/Response');
const ClassProgression = invoke('GameServer/ClassProgression');
const Proof = require('./Quest/FirstProfessionProof');

function statusParams(actor) {
    const d = (value) => Math.round(Number(value) || 0);

    return [
        { id: 0x01, value: d(actor.fetchLevel()) },
        { id: 0x09, value: d(actor.fetchHp()) },
        { id: 0x0a, value: d(actor.fetchMaxHp()) },
        { id: 0x0b, value: d(actor.fetchMp()) },
        { id: 0x0c, value: d(actor.fetchMaxMp()) },
        { id: 0x11, value: d(actor.fetchCollectivePAtk()) },
        { id: 0x12, value: d(actor.fetchCollectiveAtkSpd()) },
        { id: 0x13, value: d(actor.fetchCollectivePDef()) },
        { id: 0x14, value: d(actor.fetchCollectiveEvasion()) },
        { id: 0x15, value: d(actor.fetchCollectiveAccur()) },
        { id: 0x16, value: d(actor.fetchCollectiveCritical()) },
        { id: 0x17, value: d(actor.fetchCollectiveMAtk()) },
        { id: 0x18, value: d(actor.fetchCollectiveCastSpd()) },
        { id: 0x19, value: d(actor.fetchCollectiveMDef()) }
    ];
}

function eligibility(actor, targetClassId, { firstProfessionOnly = false } = {}) {
    if (!actor || actor.isDead?.()) return { ok: false, reason: 'unavailable' };
    const currentClassId = Number(actor.fetchClassId());
    const target = Number(targetClassId);
    const { firstProfMap, secondProfMap } = ClassProgression;

    if (firstProfMap[currentClassId]?.includes(target)) {
        return { ok: true, requiredLevel: 20, currentClassId, targetClassId: target };
    }
    if (firstProfessionOnly) return { ok: false, reason: 'wrong_profession' };
    if (secondProfMap[currentClassId]?.includes(target)) {
        return { ok: true, requiredLevel: 40, currentClassId, targetClassId: target };
    }
    if (ClassProgression.getThirdClass(target)?.parentClassId === currentClassId) {
        return { ok: true, requiredLevel: 76, currentClassId, targetClassId: target };
    }
    return { ok: false, reason: 'wrong_profession' };
}

// The transferable unit is shared by the legacy Sylvain bypass and quest
// endings. It persists first, then refreshes skills, stats and every client
// view; callers therefore never leave a completed quest with a stale class.
async function transfer(session, targetClassId, options = {}) {
    const actor = session?.actor;
    const spec = Proof.forTarget(targetClassId);
    if (spec && actor && !actor.isDead?.() && [spec.fromClassId, spec.toClassId].includes(Number(actor.fetchClassId()))) {
        const result = await transferPersisted(actor.fetchId(), targetClassId);
        if (!result.ok) return result;
        actor.setClassId(result.targetClassId);
        if (result.consumedItemId && actor.backpack) {
            const item = actor.backpack.fetchItemRaw(result.consumedItemId);
            if (result.remaining) item?.setAmount(result.remaining);
            else actor.backpack.items = actor.backpack.items.filter(i => i.fetchId() !== result.consumedItemId);
            session.dataSendToMe?.(ServerResponse.itemsList(actor.backpack.fetchItems()));
        }
        // The proof/class transaction is committed. A failed UI refresh must
        // never roll the class back or make the spent proof reusable.
        try {
            await actor.skillset.awardSkills(actor.fetchId(), result.targetClassId, actor.fetchLevel());
            CalculateStats(session, actor);
            actor.fillupVitals();
            session.dataSendToMe?.(ServerResponse.skillsList(actor.skillset.fetchSkills()));
            await invoke('GameServer/Shortcuts').refreshSkills(session, actor);
            session.dataSendToMe?.(ServerResponse.userInfo(actor));
            session.dataSendToMe?.(ServerResponse.statusUpdate(actor.fetchId(), statusParams(actor)));
            session.dataSendToOthers?.(ServerResponse.charInfo(actor), actor);
        } catch (error) {
            utils.infoWarn('Character', 'class committed; refresh deferred for %s: %s', actor.fetchId(), error.message);
        }
        return result;
    }
    const check = eligibility(actor, targetClassId, options);
    if (!check.ok) return check;
    if (ClassProgression.firstProfMap[check.currentClassId]) return { ok: false, reason: 'proof' };
    const currentLevel = Number(actor.fetchLevel());
    if (currentLevel < check.requiredLevel) {
        return { ok: false, reason: 'level', requiredLevel: check.requiredLevel };
    }

    actor.setClassId(check.targetClassId);
    try {
        await Database.updateCharacterClassId(actor.fetchId(), check.targetClassId);
        await actor.skillset.awardSkills(actor.fetchId(), check.targetClassId, currentLevel);
        CalculateStats(session, actor);
        actor.fillupVitals();

        session.dataSendToMeAndOthers?.(ServerResponse.socialAction(actor.fetchId(), 15), actor);
        session.dataSendToMe?.(ServerResponse.skillsList(actor.skillset.fetchSkills()));
        await invoke('GameServer/Shortcuts').refreshSkills(session, actor);
        session.dataSendToMe?.(ServerResponse.exStorageMaxCount(actor));
        session.dataSendToMe?.(ServerResponse.userInfo(actor));
        session.dataSendToMe?.(ServerResponse.statusUpdate(actor.fetchId(), statusParams(actor)));
        session.dataSendToOthers?.(ServerResponse.charInfo(actor), actor);
        return { ok: true, targetClassId: check.targetClassId, requiredLevel: check.requiredLevel };
    } catch (error) {
        actor.setClassId(check.currentClassId);
        await Database.updateCharacterClassId(actor.fetchId(), check.currentClassId).catch(() => {});
        utils.infoWarn('Character', 'class change failed for %s: %s', actor.fetchName(), error.message);
        return { ok: false, reason: 'persistence', error };
    }
}

// Cold actors use the same authority and database checks without requiring a
// materialized client session. Skill reconciliation follows durable transfer.
function transferPersisted(characterId, targetClassId) {
    return Database.transferFirstProfession(Number(characterId), Number(targetClassId));
}
module.exports = { eligibility, transfer, transferPersisted, statusParams };
