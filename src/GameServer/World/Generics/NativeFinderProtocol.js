const PREFIX = 'L2SOLO_FINDER_V1\n';
function text(value, length) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, length);
}
function encode(state, candidates) {
    const rows = candidates.slice(0, 8);
    const records = [
        ['state', text(state.query, 16), state.level, state.role, state.page, state.pages,
            state.total, state.open ? 1 : 0, rows.length, text(state.message, 64)].join('\t')
    ];
    for (const c of rows) records.push([
        'candidate', text(c.name, 32), c.level, c.classId, text(c.className, 40),
        text(c.role, 16), c.available ? 1 : 0, text(c.reason, 64), c.phase
    ].join('\t'));
    const result = PREFIX + records.join('\n');
    if (result.length > 8192) throw new Error('Native finder snapshot exceeds C4 HTML capacity');
    return result;
}
module.exports = { PREFIX, encode };
