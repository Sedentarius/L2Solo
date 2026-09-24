// UTF-16 text carried by C4 NpcHtml (0x0f), only after explicit UI negotiation.
// Tabs/newlines delimit records; display strings cannot introduce records.
const PREFIX = 'L2SOLO_PARTY_V1\n';
const MAX_MEMBERS = 8;
function text(value, limit = 64) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit);
}
function encode(settings, members, options = {}) {
    const rows = members.slice(0, MAX_MEMBERS);
    const combat = ['assist', 'protect', 'passive'].includes(settings.combatMode) ? settings.combatMode : 'assist';
    const movement = settings.movementMode === 'hold' ? 'hold' : 'follow';
    const pull = ['auto', 'leader', 'off', 'bot'].includes(settings.pullMode) ? settings.pullMode : 'auto';
    const lines = [`state\t${combat}\t${movement}\t${pull}\t${rows.length}\t${options.open === true ? 1 : 0}`];
    for (const member of rows) {
        lines.push([
            'member', member.id, text(member.name, 32), member.level,
            text(member.className, 40), text(member.role, 16), member.stance,
            text(member.order, 64), text(member.note, 64), member.canPull ? 1 : 0
        ].join('\t'));
    }
    const payload = PREFIX + lines.join('\n');
    if (payload.length > 8192) throw new Error('Native party snapshot exceeds C4 HTML capacity');
    return payload;
}
module.exports = { PREFIX, MAX_MEMBERS, encode };
