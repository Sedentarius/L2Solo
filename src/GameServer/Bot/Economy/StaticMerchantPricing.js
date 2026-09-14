const ItemTemplateIndex = require('../../Item/ItemTemplateIndex');
const DataCache = invoke('GameServer/DataCache');
const BotEconomyPricing = invoke('GameServer/Bot/Economy/BotEconomyPricing');
const MerchantStoreConfigs = invoke('GameServer/Bot/MerchantStoreConfigs');
const NpcShopBuyLists = invoke('GameServer/World/Generics/NpcShopBuyLists');

const BUYBACK_RATIO = 0.9;
const npcOffers = new Map();
for (const line of NpcShopBuyLists.allOffers()) {
    const id = Number(line.selfId);
    if (!npcOffers.has(id)) npcOffers.set(id, []);
    npcOffers.get(id).push(line);
}

function basePrice(selfId) {
    return Number(ItemTemplateIndex.find(DataCache.items, selfId)?.template?.price || 0);
}

function configuredPrice(line) {
    if (line.price !== undefined) return Number(line.price);
    const base = basePrice(line.selfId);
    return BotEconomyPricing.scalePrice(base > 0 ? base * (line.priceRate ?? 1) : 1);
}

function cheapestPurchase(selfId) {
    const id = Number(selfId);
    let minimum = Infinity;
    for (const line of npcOffers.get(id) || []) {
        minimum = Math.min(minimum, Number(line.price ?? basePrice(id)));
    }
    for (const store of Object.values(MerchantStoreConfigs)) {
        if (store.storeType !== 1) continue;
        for (const line of store.items || []) {
            if (Number(line.selfId) === id && Number(line.count ?? 1) > 0) {
                minimum = Math.min(minimum, configuredPrice(line));
            }
        }
    }
    return minimum;
}

function priceFor(store, line) {
    const price = configuredPrice(line);
    if (store.storeType !== 3) return price;
    // NPC prices do not scale with Adena rates. A fixed buyer must never
    // turn repeatable NPC or fixed-store supply into newly minted Adena.
    const ceiling = Math.floor(cheapestPurchase(line.selfId) * BUYBACK_RATIO);
    return Math.min(price, ceiling);
}

module.exports = { BUYBACK_RATIO, cheapestPurchase, priceFor };
