const assert=require('assert');
require('../src/Global');
const Position=invoke('GameServer/Bot/AI/BotPvpPositioning');
const Retreat=invoke('GameServer/Bot/AI/BotRetreatPlanner');
const actual=Retreat.plan;
let safe=true,preview;
const moves=[];
const bot={fetchId:()=>1,fetchClassId:()=>9,fetchLocX:()=>0,fetchLocY:()=>0,
    backpack:{fetchTotalWeaponKind:()=> 'Weapon.Bow'},moveTo:data=>{moves.push(data);return {routeUsable:true};}};
const melee={fetchId:()=>2,fetchClassId:()=>8,fetchLocX:()=>100,fetchLocY:()=>0,fetchDestId:()=>1};
const anchor={fetchLocX:()=>0,fetchLocY:()=>0};
const session={actor:bot,partyCompanion:true,followPlayerSession:{actor:anchor}};
const context={members:[session,session.followPlayerSession],owner:session.followPlayerSession,threats:[{actor:melee}]};
try {
    Retreat.plan=(_bot,_target,options)=>{preview=options.previewRoute;return {safe,from:{locX:0,locY:0},requestedTo:{locX:-500,locY:0}};};
    assert(Position.reposition(session,bot,context,10000));
    assert.strictEqual(session.lastCombatDecision.action,'pvp_kite');
    assert.strictEqual(moves.length,1,'restoring range dispatches actual movement');
    assert(!Position.reposition(session,bot,context,11000),'movement retries are bounded');
    assert.strictEqual(preview({locX:0,locY:0},{locX:1000,locY:0}).routeUsable,false,'companion stays within support range');
    safe=false;
    assert(!Position.reposition(session,bot,context,14000),'failed positioning yields to normal attacks');
    assert.strictEqual(moves.length,1);
    bot.backpack.fetchTotalWeaponKind=()=> 'Weapon.Blunt';
    assert(!Position.reposition(session,bot,context,18000),'class name alone does not imply a ranged loadout');
} finally {Retreat.plan=actual;}
console.log('PvP archer movement, companion range, retries and failed-route fallback passed');
