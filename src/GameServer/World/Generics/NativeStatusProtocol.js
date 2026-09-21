const PREFIX = 'L2SOLO_STATUS_V1\n';
const text = (value, limit) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit);
function encode(s, rows) {
    const records = [['state', s.tab, s.page, s.pages, s.total, s.open ? 1 : 0, rows.length,
        text(s.name, 32), s.level, s.classId, text(s.className, 40), s.phase, s.hp, s.mp, text(s.message, 96)].join('\t')];
    for (const r of rows) records.push(s.tab === 'list'
        ? ['bot', text(r.name, 32), r.level, r.classId, text(r.className, 40), text(r.summary, 96)].join('\t')
        : ['field', text(r.label, 32), text(r.value, 64)].join('\t'));
    const result = PREFIX + records.join('\n');
    if (rows.length > 8 || result.length > 8192) throw new Error('Native status exceeds C4 bounds');
    return result;
}
module.exports = { PREFIX, encode, text };
