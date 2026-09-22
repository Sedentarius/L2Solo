const assert = require('node:assert/strict');
require('../src/Global');
invoke('GameServer/DataCache').init();
const Warehouse = invoke('GameServer/Bot/Economy/BotWarehouseService');
const Recipes = invoke('GameServer/Items/C4RecipeItems');
const originalId = Recipes.resolveByRecipeId, originalProduct = Recipes.resolveByProductId;
const root = { recipeId: 99001, productId: 9999, productCount: 1,
    materials: [{ selfId: 9001, amount: 2 }, { selfId: 9002, amount: 3 }] };
const component = { recipeId: 99002, productId: 9001, productCount: 1, materials: [{ selfId: 9002, amount: 10 }] };
Recipes.resolveByRecipeId = id => Number(id) === root.recipeId ? root : Number(id) === component.recipeId ? component : originalId(id);
Recipes.resolveByProductId = id => Number(id) === component.productId ? component : originalProduct(id);
try {
    const state = { stats: { equipmentPlan: { strategy: 'craft', status: 'active', recipeId: root.recipeId,
        materials: root.materials, componentRecipes: { 9001: component.recipeId } } },
        inventory: { 9002: { selfId: 9002, amount: 5 } } };
    const requests = stock => Warehouse.craftRequests(state, stock);
    assert.deepEqual(requests([{ selfId: 9001, amount: 2 }, { selfId: 9002, amount: 100 }]),
        [{ selfId: 9001, amount: 2, reason: 'craft' }], 'finished components prevent redundant raw material withdrawals');
    assert.deepEqual(requests([{ selfId: 9001, amount: 1 }, { selfId: 9002, amount: 100 }]),
        [{ selfId: 9001, amount: 1, reason: 'craft' }, { selfId: 9002, amount: 8, reason: 'craft' }],
        'shared ingredients are allocated across direct and nested demand exactly once');
    assert.deepEqual(requests([{ selfId: 9002, amount: 10, reservedAmount: 4 }]),
        [{ selfId: 9002, amount: 6, reason: 'craft' }]);
    const dual = { stats: { equipmentPlan: { strategy: 'craft', status: 'active', recipeId: 902566 } }, inventory: {} };
    assert(Warehouse.craftRequests(dual, [{ selfId: 1870, amount: 431 }]).some(r => r.selfId === 1870 && r.amount > 0),
        'real Stormbringer*Caliburs chain can withdraw stored Coal');
    assert.deepEqual(Warehouse.craftRequests(dual, [{ selfId: 72, amount: 1 }, { selfId: 75, amount: 1 }, { selfId: 1870, amount: 431 }]),
        [{ selfId: 72, amount: 1, reason: 'craft' }, { selfId: 75, amount: 1, reason: 'craft' }],
        'stored sword components suppress their whole manufacturing trees');
    assert.deepEqual(Warehouse.craftRequests({ ...dual, stats: { ...dual.stats, clanId: 7 } }, [{ selfId: 1870, amount: 431 }]), [],
        'clan members do not resume unauthorized personal crafting');
    console.log('Nested warehouse crafting, shared stock and stored dual components passed');
} finally { Recipes.resolveByRecipeId = originalId; Recipes.resolveByProductId = originalProduct; }
