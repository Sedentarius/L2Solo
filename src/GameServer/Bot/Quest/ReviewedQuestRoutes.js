// Scheduling hints only. QuestService revalidates every event, kill and hand-in.
// Conditions and native IDs follow the local, authoritative quest handlers.
module.exports = {
    401: { questId:401,name:'Path to Warrior',minLevel:19,race:0,fromClassId:0,toClassId:1,
        startNpcId:7010,startEvent:'start',priority:70,route:{
            0:{npc:7010,event:'start'},1:{npc:7253,event:'guild'},
            2:{collectItemId:1140,collectAmount:10,killNpcIds:[35,42],returnNpcId:7253},
            3:{npc:7253},4:{npc:7010,event:'forge'},
            5:{collectItemId:1144,collectAmount:20,killNpcIds:[38,43],returnNpcId:7010,equipItem:1142},
            6:{npc:7010}
        } }
};
