// Existing L2Solo quest mechanics, moved onto atomic QuestService steps.
module.exports = [
    { id:155, name:'Find Sir Windawood', minLevel:3, startNpc:7042, repeatable:false,
        startItems:[[1019,1]],stages:[{type:'COMPLETE',npc:7311,takes:[[1019,1]]}],reward:{items:[[734,1]]} },
    { id:156, name:'Millennium Love', minLevel:15, startNpc:7368, repeatable:false,
        startItems:[[1022,1]],stages:[{type:'DELIVER',npc:7369,takes:[[1022,1]],gives:[[1023,1]]},
            {type:'COMPLETE',npc:7368,takes:[[1023,1]]}],reward:{items:[[5250,1]],exp:3000} },
    { id:151, name:'Cure for Fever Disease', minLevel:15, startNpc:7050, repeatable:false,
        stages:[{type:'KILL_COLLECT',item:1006,count:1,drops:[{npc:106,chance:.2}]},
            {type:'DELIVER',npc:7032,takes:[[1006,1]],gives:[[1007,1]]},
            {type:'COMPLETE',npc:7050,takes:[[1007,1]]}], reward:{items:[[102,1]]} },
    { id:161, name:'Fruit of the Mothertree', minLevel:3, race:1, startNpc:7362, repeatable:false,
        startItems:[[1036,1]], stages:[{type:'DELIVER',npc:7371,takes:[[1036,1]],gives:[[1037,1]]},
            {type:'COMPLETE',npc:7362,takes:[[1037,1]]}], reward:{adena:1000,exp:1000} }
];
