-- Preferences that follow the user from device to device (phase 7): one live
-- row per key. The first is the theme, which used to live in localStorage.
CREATE TABLE core_preferences (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE UNIQUE INDEX core_preferences_key_live ON core_preferences (key) WHERE deleted_at IS NULL;
