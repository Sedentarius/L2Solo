const assert = require('assert');
require('../src/Global');
const Efficiency = invoke('GameServer/Bot/AI/BotHuntEfficiency');
const Routes = invoke('GameServer/Bot/AI/LevelingRoutes');
const at = Date.now();
let state = { level:40,stats:{classId:9},inventory:{1:{selfId:1,equipped:true}} };
function sample(spotId,exp,combatMs,recoveryMs=0) {
    state={...state,stats:{...state.stats,huntEfficiency:Efficiency.record(state,{spotId,exp,combatMs,recoveryMs,timestamp:at})}};
}
for(let i=0;i<3;i++) {sample('sustainable',100,10000);sample('costly',200,10000,90000);}
const scores=Efficiency.scores(state,at);
assert(scores.get('sustainable')>scores.get('costly'),'useful XP includes recovery cost rather than raw kill rewards');
const spot=id=>({id,avgLevel:40,minLevel:39,maxLevel:41,density:1,tagsAuthoritative:true,tags:[],center:{locX:50000,locY:15000}});
assert(Routes.scoreSpot(spot('sustainable'),state,{timestamp:at}).score>Routes.scoreSpot(spot('costly'),state,{timestamp:at}).score);
assert.strictEqual(Routes.scoreSpot(spot('unknown'),state,{timestamp:at}).efficiencyAdjustment,0,'unknown hunts remain available');
assert.strictEqual(Efficiency.scores({...state,party:{partyId:'new'}},at).size,0,'party change invalidates solo results');
assert.strictEqual(Routes.scoreSpot(spot('sustainable'),state,{timestamp:at,mode:'party'}).efficiencyAdjustment,0,'explicit party planning does not reuse solo cycle samples');
assert.strictEqual(Efficiency.scores({...state,inventory:{2:{selfId:2,equipped:true}}},at).size,0,'new equipment invalidates old cycle costs');
assert.strictEqual(Efficiency.scores({...state,stats:{...state.stats,classId:24}},at).size,0,'profession change invalidates old results');
assert.strictEqual(Efficiency.scores(state,at+Efficiency.MAX_AGE_MS).size,0,'old samples expire');
for(let i=0;i<20;i++)sample(`spot-${i}`,10,1000);
assert.strictEqual(state.stats.huntEfficiency.length,Efficiency.MAX_SPOTS,'persisted memory stays bounded');
assert.deepStrictEqual(Efficiency.scores(JSON.parse(JSON.stringify(state)),at),Efficiency.scores(state,at));
console.log('Recovery-aware hunt ranking, build/mode invalidation, exploration and bounded persistence passed');
