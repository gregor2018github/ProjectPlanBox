-- Directed links between entities of any modules (see ARCHITECTURE §6.2).
-- Both ends are entity references, so there is no foreign key on either side.
CREATE TABLE core_links (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK (NOT (source_type = target_type AND source_id = target_id))
) STRICT;

CREATE UNIQUE INDEX core_links_live
    ON core_links (source_type, source_id, target_type, target_id) WHERE deleted_at IS NULL;
CREATE INDEX core_links_by_target
    ON core_links (target_type, target_id) WHERE deleted_at IS NULL;
