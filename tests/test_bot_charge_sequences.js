const assert = require('assert');
require('../src/Global');
const Utility = invoke('GameServer/Bot/AI/BotCombatUtility');
const AI = invoke('GameServer/Bot/BotAI');
const Skill = invoke('GameServer/Model/Skill');
const Charges = invoke('GameServer/Skills/ChargeLifecycle');

function skill(id, level = 1, mp = 7, power = 100) {
    return new Skill({ selfId:id, name:`skill_${id}`, level, passive:false, spell:false,
        mp, hp:0, power, distance:600, hitTime:0, reuse:0, buff:0 });
}
const focus = skill(50, 1, 7);
const force = skill(54, 1, 21, 200);
const hurricane = skill(284, 1, 60, 300);
const area = skill(35, 1, 21, 200);
function actor(skills) {
    return { charges:0, mp:100, tick:0, reuse:new Map(),
        fetchId:()=>2000001, fetchClassId:()=>47, fetchHp:()=>500, fetchMaxHp:()=>500,
        fetchMp(){return this.mp;}, fetchMaxMp:()=>100,
        fetchCharges(){return this.charges;}, setCharges(n){this.charges=n;},
        fetchLocX:()=>0, fetchLocY:()=>0,
        canUseSkill(s){return (this.reuse.get(s.fetchSelfId())||0)<=this.tick;},
        skillset:{skills,fetchSkills:()=>skills,fetchSkill:id=>skills.find(s=>s.fetchSelfId()===id)},
        backpack:{fetchTotalWeaponKind:()=> 'Weapon.DualFist',fetchEquippedArmors:()=>[]}
    };
}
const target={fetchId:()=>1000001,fetchHp:()=>100000,fetchLocX:()=>200,fetchLocY:()=>0};
const incompatible = actor([focus,hurricane]);
assert.strictEqual(Utility.selectChargeSkill(incompatible,'dps',{},target),null,
    'Focus Force rank 1 cannot prepare a two-charge spender: repeating it at cap never progresses');
const poor = actor([focus,force]); poor.mp=30;
assert.strictEqual(Utility.selectChargeSkill(poor,'dps',{},target),null,
    'reserve enough MP for both preparation and its intended attack');
const unsafe = actor([focus,area]);
assert.strictEqual(Utility.selectChargeSkill(unsafe,'dps',{avoidAreaDamage:true},target),null,
    'a forbidden area attack must not create a charge plan');

// Exercise the actual BotAI dispatch repeatedly. A deterministic clock and
// charge/reuse transitions make an infinite preparation loop fail immediately.
const bot=actor([focus,force]), session={}, events=[];
const generics={
    skillExec(_session,_actor,data){
        const s=bot.skillset.fetchSkill(data.selfId);
        bot.mp-=s.fetchConsumedMp();
        if(data.selfId===50){
            const next=Math.min(focus.fetchSemantic().maxCharges,bot.charges+1);
            assert.ok(next>bot.charges,'every preparation must increase available charges');
            bot.charges=next;
        }else{
            assert.ok(Charges.consume(null,bot,s.fetchSemantic().requires.charges).ok);
            bot.reuse.set(data.selfId,bot.tick+3);
        }
        events.push({tick:bot.tick,action:session.lastCombatDecision.action,skill:data.selfId});
    },
    attackExec(){events.push({tick:bot.tick,action:'basic_attack'});}
};
for(bot.tick=0;bot.tick<40;bot.tick++){
    // Deliberate resource recovery models a new affordable opportunity.
    if(bot.tick%8===0)bot.mp=100;
    AI.executeCombat(session,bot,target,generics);
}
assert.ok(events.filter(e=>e.skill===54).length>=5,'repeated fights must spend prepared charges');
assert.ok(events.some(e=>e.action==='basic_attack'),'cooldown/MP gaps retain ordinary combat');
assert.ok(events.every((e,i)=>e.skill!==50||events[i+1]?.skill===54),'one-charge plan must immediately advance to its spender');
assert.strictEqual(events.length,40);
const eventCount=events.length;
assert.strictEqual(AI.executeCombat(session,bot,{...target,fetchHp:()=>0},generics),false);
assert.strictEqual(events.length,eventCount,'a dead target must not restart preparation or ordinary attacks');
assert.strictEqual(session.lastCombatDecision.reason,'target_dead_or_missing');
const changed=actor([focus,force,area]);
changed.charges=1;
assert.strictEqual(Utility.selectChargeSkill(changed,'dps',{avoidAreaDamage:true},target),null,
    'an already usable single-target attack does not need another charge');
changed.reuse.set(54,100);
assert.strictEqual(Utility.selectChargeSkill(changed,'dps',{avoidAreaDamage:true},target),null,
    'cooldown change must not divert preparation into a forbidden area attack');
console.log('Charge sequences passed: cap, full MP budget, area safety, and 40 combat dispatches');
