// Existing L2Solo quest mechanics, moved onto atomic QuestService steps.
module.exports = [
    { id:151, name:'Cure for Fever Disease', minLevel:15, startNpc:7050, repeatable:false,
        stages:[{type:'KILL_COLLECT',item:1006,count:1,drops:[{npc:106,chance:.2}]},
            {type:'DELIVER',npc:7032,takes:[[1006,1]],gives:[[1007,1]]},
            {type:'COMPLETE',npc:7050,takes:[[1007,1]]}], reward:{items:[[102,1]]} },
    { id:161, name:'Fruit of the Mothertree', minLevel:3, race:1, startNpc:7362, repeatable:false,
        startItems:[[1036,1]], stages:[{type:'DELIVER',npc:7371,takes:[[1036,1]],gives:[[1037,1]]},
            {type:'COMPLETE',npc:7362,takes:[[1037,1]]}], reward:{adena:1000,exp:1000} }
];
