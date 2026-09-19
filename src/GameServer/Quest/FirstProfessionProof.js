// Reviewed server contract. The evidence inventory is never executable input.
const paths = Object.freeze([
    Object.freeze({ questId: 401, fromClassId: 0, toClassId: 1, itemId: 1145 }),
    Object.freeze({ questId: 402, fromClassId: 0, toClassId: 4, itemId: 1161 }),
    Object.freeze({ questId: 403, fromClassId: 0, toClassId: 7, itemId: 1190 }),
    Object.freeze({ questId: 404, fromClassId: 10, toClassId: 11, itemId: 1292 }),
    Object.freeze({ questId: 405, fromClassId: 10, toClassId: 15, itemId: 1201 }),
    Object.freeze({ questId: 406, fromClassId: 18, toClassId: 19, itemId: 1204 }),
    Object.freeze({ questId: 407, fromClassId: 18, toClassId: 22, itemId: 1217 }),
    Object.freeze({ questId: 408, fromClassId: 25, toClassId: 26, itemId: 1230 }),
    Object.freeze({ questId: 409, fromClassId: 25, toClassId: 29, itemId: 1235 }),
    Object.freeze({ questId: 410, fromClassId: 31, toClassId: 32, itemId: 1244 }),
    Object.freeze({ questId: 411, fromClassId: 31, toClassId: 35, itemId: 1252 }),
    Object.freeze({ questId: 412, fromClassId: 38, toClassId: 39, itemId: 1261 }),
    Object.freeze({ questId: 413, fromClassId: 38, toClassId: 42, itemId: 1270 }),
    Object.freeze({ questId: 414, fromClassId: 44, toClassId: 45, itemId: 1592 }),
    Object.freeze({ questId: 415, fromClassId: 44, toClassId: 47, itemId: 1615 }),
    Object.freeze({ questId: 416, fromClassId: 49, toClassId: 50, itemId: 1631 }),
    Object.freeze({ questId: 417, fromClassId: 53, toClassId: 54, itemId: 1642 }),
    Object.freeze({ questId: 418, fromClassId: 53, toClassId: 56, itemId: 1635 }),
]);
const forTarget = id => paths.find(p => p.toClassId === Number(id));
const forQuest = id => paths.find(p => p.questId === Number(id));
// Completion reward values from the supplied normalized C4 evidence. These
// reviewed constants are independent of the level-20 class transfer.
const spRewards = Object.freeze([1500,7260,1500,2020,5610,2280,1000,1890,1130,1500,3930,1650,3120,2360,1500,2600,7080,3490]);
const rewardFor = questId => ({ exp: 3200, sp: spRewards[questId - 401] });
module.exports = { paths, forTarget, forQuest, rewardFor };
