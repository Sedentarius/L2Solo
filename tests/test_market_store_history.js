const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('../src/Global');
const Database = invoke('Database');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'market-store-history-'));
options.default.Database.path = path.join(directory, 'world.sqlite');

(async () => {
    Database.init();
    await Database.execute(["INSERT INTO accounts (username, password) VALUES ('shop_test', 'unused')"]);
    await Database.execute([`INSERT INTO characters
        (id, username, name, classId, race, maxHp, maxMp, sex, face, hair, hairColor, locX, locY, locZ)
        VALUES (7, 'shop_test', 'ShopTest', 0, 0, 100, 100, 0, 0, 0, 0, 0, 0, 0)`]);
    const timestamp = Date.now();
    const shop = (id, storeType = 1) => ({
        id, storeType, town: 'Giran', openedAt: timestamp,
        items: [{ selfId: 2387, name: 'Tempered Mithril Gaiters', price: 1422000, count: 1, marketReason: 'speculative_demand' }]
    });
    const stats = (store, reason) => JSON.stringify({ marketStore: store, lastReason: reason });
    await Database.execute([`INSERT INTO bot_life_state
        (characterId, characterName, activity, statsJson, updatedAt) VALUES (7, 'ShopTest', 'merchant', ?, ?)`,
    [stats(shop('first'), 'cold_market_listing'), timestamp]]);
    const update = (store, reason, activity = 'merchant') => Database.execute([
        'UPDATE bot_life_state SET activity = ?, statsJson = ?, updatedAt = ? WHERE characterId = 7',
        [activity, stats(store, reason), timestamp + 1000]
    ]);
    await update(shop('first'), 'cold_market_demand_revalidated');
    await Database.execute(["UPDATE bot_life_state SET phase = 'hot' WHERE characterId = 7"]);
    let history = await Database.fetchMarketStoreHistory({ timestamp: timestamp + 2000 });
    assert.strictEqual(history.recent.length, 1, 'reviews and phase changes must not count as new openings');
    await update(null, 'cold_market_expired', 'shopping');
    history = await Database.fetchMarketStoreHistory({ timestamp: timestamp + 2000 });
    assert.strictEqual(history.recent.length, 2);
    assert.strictEqual(history.recent[0].reason, 'cold_market_expired');
    assert.strictEqual(history.recent[0].items[0].selfId, 2387);

    await Database.execute(['BEGIN']);
    await update(shop('rolled-back'), 'cold_market_listing');
    await Database.execute(['ROLLBACK']);
    history = await Database.fetchMarketStoreHistory({ timestamp: timestamp + 2000 });
    assert.strictEqual(history.recent.length, 2, 'failed state transactions must roll back their journal events too');

    await update(shop('second'), 'cold_market_listing');
    await update(shop('third', 3), 'cold_market_buy_store');
    await update(null, 'cold_market_buy_filled', 'hunting');
    history = await Database.fetchMarketStoreHistory({ timestamp: timestamp + 2000, recentLimit: 1 });
    assert.strictEqual(history.recent.length, 1, 'recent history must be bounded independently of totals');
    assert.strictEqual(history.byEvent.reduce((sum, row) => sum + row.events, 0), 6);
    assert.strictEqual(history.byItem.find((row) => row.storeType === 1).openings, 2);
    assert.strictEqual(history.byItem.find((row) => row.storeType === 3).openings, 1);

    await Database.execute([`INSERT INTO market_store_events
        (storeId, characterId, characterName, storeType, eventType, reason, occurredAt, openedAt, itemsJson)
        VALUES ('old', 7, 'ShopTest', 1, 'opened', 'old', ?, ?, '[]')`,
    [timestamp - 91 * 86400000, timestamp - 91 * 86400000]]);
    await update(shop('fourth'), 'cold_market_listing');
    assert.strictEqual((await Database.execute(["SELECT id FROM market_store_events WHERE storeId='old'"])).length, 0,
        'the bounded retention sweep must remove events older than 90 days');
    assert.strictEqual((await Database.execute(['SELECT version FROM schema_migrations WHERE version=43'])).length, 1);
    await Database.close();
    Database.init();
    history = await Database.fetchMarketStoreHistory({ timestamp: timestamp + 2000 });
    assert.strictEqual(history.recent.length, 7, 'opening and closing history must survive a database reopen');
    assert.strictEqual((await Database.execute(['PRAGMA quick_check']))[0].quick_check, 'ok');
    await Database.close();
    fs.rmSync(directory, { recursive: true, force: true });
    console.log('Atomic bot store lifecycle journal, retention and restart checks passed');
})().catch(async (error) => {
    console.error(error);
    await Database.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
    process.exitCode = 1;
});
