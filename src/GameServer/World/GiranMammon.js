// Permanent custom service, independent of the Seven Signs cycle.
// C4 NPC 8126: Lisvus datapack/sql/npc.sql.
const npcId = 8126;
const loc = { locX: 83482, locY: 149266, locZ: -3405 };
const template = structuredClone(require('./C4LateTownGatekeepers').npcs[0]);
template.selfId = npcId;
template.template = { ...template.template, kind: 'Npc', name: 'Blacksmith of Mammon', title: 'Free Unsealing' };
template.collision = { radius: 8, size: 16.5 };
const spawns = [{ selfId: 'giran_mammon', bounds: [{locX:loc.locX,locY:loc.locY,minZ:-3600,maxZ:-3300}],
    spawns: [{ selfId:npcId,name:template.template.name,coords:[{...loc,head:32768}],total:1,respawn:60,bias:0 }] }];
module.exports = { npcId, loc, npcs:[template], spawns };
