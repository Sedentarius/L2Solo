// Absolute deadlines remain authoritative; metadata preserves the original UI duration.
function entries(actor, now = Date.now()) {
    const rows = [];
    for (const [id, until] of actor?.skillReuseUntil || []) {
        if (!Number.isFinite(until) || until <= now) continue;
        const metadata = actor.skillReuseDetails?.get(id);
        rows.push({ id, until, level: metadata?.level || actor.skillset?.fetchSkill(id)?.fetchLevel() || 1,
            duration: Math.max(until - now, Number(metadata?.duration) || 0) });
    }
    return rows;
}

function restore(actor, value, now = Date.now()) {
    let rows = value;
    if (typeof rows === 'string') {
        try { rows = JSON.parse(rows); } catch (_) { rows = []; }
    }
    actor.skillReuseUntil = new Map();
    actor.skillReuseDetails = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        if (!Number.isInteger(row?.id) || row.id <= 0 || !Number.isFinite(row.until) || row.until <= now) continue;
        actor.skillReuseUntil.set(row.id, row.until);
        actor.skillReuseDetails.set(row.id, { level: Math.max(1, Number(row.level) || 1),
            duration: Math.max(row.until - now, Number(row.duration) || 0) });
    }
}

module.exports = { entries, restore };
