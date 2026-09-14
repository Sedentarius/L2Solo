const { recipes } = require('../../../data/Items/c4_unseal.json');
const bySource = new Map();
for (const recipe of recipes) {
    if (!bySource.has(recipe.sourceId)) bySource.set(recipe.sourceId, []);
    bySource.get(recipe.sourceId).push(recipe);
}
module.exports = {
    recipes,
    options: id => bySource.get(Number(id)) || [],
    resolve: (source, product) => (bySource.get(Number(source)) || []).find(r => r.productId === Number(product)) || null
};
