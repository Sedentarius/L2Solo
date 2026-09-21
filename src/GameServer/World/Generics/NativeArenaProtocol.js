const PREFIX = 'L2SOLO_ARENA_V1\n';
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
function encode(state, rows, classes) {
    const records = [[ 'state', text(state.query, 16), state.level, state.classKey, state.page, state.pages,
        state.total, state.open ? 1 : 0, rows.length, classes.length, state.canSelect ? 1 : 0,
        state.canBuff ? 1 : 0, state.canHeal ? 1 : 0, state.buffMode, text(state.opponent, 32), text(state.message, 96)
    ].join('\t')];
    for (const c of rows) records.push(['candidate', c.id, text(c.name, 32), c.level, c.classId,
        text(c.className, 40), c.phase].join('\t'));
    for (const c of classes) records.push(['class', c.id, text(c.name, 40)].join('\t'));
    const payload = PREFIX + records.join('\n');
    if (rows.length > 8 || classes.length > 137 || payload.length > 8192) throw new Error('Native arena snapshot exceeds C4 bounds');
    return payload;
}
module.exports = { PREFIX, encode };
