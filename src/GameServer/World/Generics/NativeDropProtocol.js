const PREFIX = 'L2SOLO_DROP_V1\n';
const text = (value, limit) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit);
function encode(s) {
    const rows = s.rows || [];
    const lines = [['state', s.request, s.objectId, s.npcId || 0, s.status, text(s.name, 64), rows.length].join('\t')];
    for (const r of rows) lines.push([r.kind, r.group, r.itemId, text(r.name, 64), r.amount, r.chance].join('\t'));
    const result = PREFIX + lines.join('\n');
    if (rows.length > 64 || result.length > 8192) throw new Error('Native drop tooltip exceeds C4 bounds');
    return result;
}
module.exports = { PREFIX, encode };
