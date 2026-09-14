const assert = require('assert');
require('../src/Global');
const Threats = invoke('GameServer/Bot/AI/BotPvpThreats');
const actor = (id,classId=0) => ({hp:100,dest:0,effects:{},fetchId:()=>id,fetchClassId:()=>classId,
    fetchHp(){return this.hp;},fetchMaxHp:()=>100,fetchDestId(){return this.dest;}});
const healer = actor(1,16), tank=actor(2,5), primary=actor(3,9), diver=actor(4,8);
const session={actor:tank}, context={owner:session,members:[session,{actor:healer}],threats:[{actor:primary},{actor:diver}]};
assert.strictEqual(Threats.focus(session,context),primary);
healer.hp=20; diver.dest=1;
assert.strictEqual(Threats.focus(session,context),diver,'an actual attack on a wounded healer preempts ordinary focus');
healer.hp=100;
context.threats.reverse();
assert.strictEqual(Threats.focus(session,context),diver,'healing/reordered threat rows do not oscillate focus');
diver.effects.sleep={key:'sleep',type:'debuff',expiresAt:Date.now()+10000};
assert.strictEqual(Threats.focus(session,context),primary,'control still protects a disabled aggressor');
context.threats=[];
assert.strictEqual(Threats.focus(session,context),null,'focus never invents an unauthorized opponent');
console.log('Party PvP protection, stable focus, control and target loss passed');
