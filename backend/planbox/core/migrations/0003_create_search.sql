-- Full-text search (see ARCHITECTURE §6.3). The index is a derived cache: it
-- is filled from the modules' tables and can be rebuilt from them at any time.
CREATE VIRTUAL TABLE core_search USING fts5(
    entity_type UNINDEXED,
    entity_id UNINDEXED,
    title,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
);

-- Per entity type: the newest updated_at already copied into core_search.
CREATE TABLE core_search_sync (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    synced_through TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE UNIQUE INDEX core_search_sync_type
    ON core_search_sync (entity_type) WHERE deleted_at IS NULL;
