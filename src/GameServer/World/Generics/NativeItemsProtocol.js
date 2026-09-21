const PREFIX = 'L2SOLO_ITEMS_V1\n';
const text = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
function encode(s) {
    const rows = s.rows || [];
    const lines = [['state', s.epoch, s.revision, s.open ? 1 : 0, s.tab, text(s.query, 48), s.category, s.grade,
        s.page, s.pages, s.total, s.itemId || 0, text(s.name, 96), text(s.itemGrade, 12), text(s.kind, 64),
        s.drops || 0, s.spoils || 0, text(s.message, 96), rows.length].join('\t')];
    if (s.tab === 'map') lines.push(['map', s.mobId, text(s.mobName, 64), s.selected || 0, s.tracked || 0].join('\t'));
    for (const r of rows) lines.push(s.tab === 'list'
        ? ['item', r.id, text(r.name, 96), r.grade, r.category, r.drops ? 1 : 0, r.spoils ? 1 : 0].join('\t')
        : s.tab === 'map' ? ['place', r.id, text(r.name, 64), r.x, r.y, r.z, r.period, r.kind].join('\t')
        : ['source', r.id, text(r.name, 64), r.level, r.raid ? 1 : 0, r.reachable ? 1 : 0, text(r.amount, 32), r.chance].join('\t'));
    const result = PREFIX + lines.join('\n');
    if (rows.length > 8 || result.length > 8192) throw new Error('Native items exceeds C4 bounds');
    return result;
}
module.exports = { PREFIX, text, encode };
