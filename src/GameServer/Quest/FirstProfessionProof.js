// Reviewed server contract. The evidence inventory is never executable input.
const paths = Object.freeze([
    { questId: 401, fromClassId: 0, toClassId: 1, itemId: 1145 },
]);
const forTarget = id => paths.find(p => p.toClassId === Number(id));
const forQuest = id => paths.find(p => p.questId === Number(id));
module.exports = { paths, forTarget, forQuest };
