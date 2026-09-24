const PREFIX = 'L2SOLO_FRIENDS_V1\n';
const text = (value, length) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, length);
function encode(state, bots) {
    const rows = bots.slice(0, 8);
    const records = [[
        'state', state.mode, state.page, state.hasNext ? 1 : 0, state.selectedCount,
        state.threshold, state.open ? 1 : 0, rows.length, text(state.message, 96)
    ].join('\t')];
    for (const b of rows) records.push([
        'friend', b.botId, text(b.name, 32), b.level, b.classId ?? 0,
        text(b.className || 'Unknown class', 40), text(b.role, 16),
        text(b.trust, 16), text(b.familiarity, 16), b.selected ? 1 : 0,
        text(b.activity || 'hunting', 32), text(b.currentRegion || 'unknown', 48),
        Number(b.trust) >= state.threshold ? 1 : 0
    ].join('\t'));
    const payload = PREFIX + records.join('\n');
    if (payload.length > 8192) throw new Error('Native friends snapshot exceeds C4 HTML capacity');
    return payload;
}
module.exports = { PREFIX, encode };
