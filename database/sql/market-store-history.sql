CREATE TABLE IF NOT EXISTS market_store_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storeId TEXT NOT NULL,
    characterId INTEGER NOT NULL,
    characterName TEXT NOT NULL,
    storeType INTEGER NOT NULL,
    eventType TEXT NOT NULL CHECK(eventType IN ('opened', 'closed')),
    reason TEXT NOT NULL,
    occurredAt INTEGER NOT NULL,
    openedAt INTEGER NOT NULL,
    town TEXT,
    itemsJson TEXT NOT NULL,
    UNIQUE(storeId, eventType)
);
CREATE INDEX IF NOT EXISTS market_store_events_recent ON market_store_events(occurredAt, id);
CREATE INDEX IF NOT EXISTS market_store_events_owner ON market_store_events(characterId, occurredAt);

-- Journal the persisted transition in the same transaction as the bot state.
-- Store identity survives intermediate purchase writes in shopping activity.
-- Only removing/replacing that identity closes a store, including partial WTBs.
CREATE TRIGGER IF NOT EXISTS market_store_insert AFTER INSERT ON bot_life_state
WHEN NEW.activity = 'merchant' AND COALESCE(json_extract(NEW.statsJson, '$.marketStore.id'), '') <> ''
BEGIN
    INSERT OR IGNORE INTO market_store_events
        (storeId, characterId, characterName, storeType, eventType, reason, occurredAt, openedAt, town, itemsJson)
    VALUES (json_extract(NEW.statsJson, '$.marketStore.id'), NEW.characterId, NEW.characterName,
        COALESCE(json_extract(NEW.statsJson, '$.marketStore.storeType'), 1), 'opened',
        COALESCE(json_extract(NEW.statsJson, '$.lastReason'), 'state_transition'), NEW.updatedAt,
        COALESCE(json_extract(NEW.statsJson, '$.marketStore.openedAt'), NEW.updatedAt),
        json_extract(NEW.statsJson, '$.marketStore.town'),
        COALESCE(json_extract(NEW.statsJson, '$.marketStore.items'), '[]'));
    DELETE FROM market_store_events WHERE id IN (
        SELECT id FROM market_store_events WHERE occurredAt < NEW.updatedAt - 7776000000
        ORDER BY occurredAt, id LIMIT 1000
    );
END;

CREATE TRIGGER IF NOT EXISTS market_store_update AFTER UPDATE OF activity, statsJson ON bot_life_state
WHEN COALESCE(json_extract(OLD.statsJson, '$.marketStore.id'), '') <> '' OR NEW.activity = 'merchant'
BEGIN
    INSERT OR IGNORE INTO market_store_events
        (storeId, characterId, characterName, storeType, eventType, reason, occurredAt, openedAt, town, itemsJson)
    SELECT json_extract(OLD.statsJson, '$.marketStore.id'), OLD.characterId, OLD.characterName,
        COALESCE(json_extract(OLD.statsJson, '$.marketStore.storeType'), 1), 'closed',
        COALESCE(json_extract(NEW.statsJson, '$.lastReason'), 'state_transition'), NEW.updatedAt,
        COALESCE(json_extract(OLD.statsJson, '$.marketStore.openedAt'), OLD.updatedAt),
        json_extract(OLD.statsJson, '$.marketStore.town'),
        COALESCE(json_extract(OLD.statsJson, '$.marketStore.items'), '[]')
    WHERE COALESCE(json_extract(OLD.statsJson, '$.marketStore.id'), '') <> ''
        AND COALESCE(json_extract(NEW.statsJson, '$.marketStore.id'), '') <> json_extract(OLD.statsJson, '$.marketStore.id');

    INSERT OR IGNORE INTO market_store_events
        (storeId, characterId, characterName, storeType, eventType, reason, occurredAt, openedAt, town, itemsJson)
    SELECT json_extract(NEW.statsJson, '$.marketStore.id'), NEW.characterId, NEW.characterName,
        COALESCE(json_extract(NEW.statsJson, '$.marketStore.storeType'), 1), 'opened',
        COALESCE(json_extract(NEW.statsJson, '$.lastReason'), 'state_transition'), NEW.updatedAt,
        COALESCE(json_extract(NEW.statsJson, '$.marketStore.openedAt'), NEW.updatedAt),
        json_extract(NEW.statsJson, '$.marketStore.town'),
        COALESCE(json_extract(NEW.statsJson, '$.marketStore.items'), '[]')
    WHERE NEW.activity = 'merchant'
        AND COALESCE(json_extract(NEW.statsJson, '$.marketStore.id'), '') <> ''
        AND COALESCE(json_extract(OLD.statsJson, '$.marketStore.id'), '') <> json_extract(NEW.statsJson, '$.marketStore.id');

    DELETE FROM market_store_events WHERE id IN (
        SELECT id FROM market_store_events WHERE occurredAt < NEW.updatedAt - 7776000000
        ORDER BY occurredAt, id LIMIT 1000
    );
END;
