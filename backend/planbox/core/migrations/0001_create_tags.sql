-- Global, flat tags and their attachments to entities of any module.
CREATE TABLE core_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE UNIQUE INDEX core_tags_name_live ON core_tags (lower(name)) WHERE deleted_at IS NULL;

-- entity_type/entity_id point into a module's table, so there is no foreign key
-- on that side (see ARCHITECTURE §6.1).
CREATE TABLE core_taggings (
    id TEXT PRIMARY KEY,
    tag_id TEXT NOT NULL REFERENCES core_tags (id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE UNIQUE INDEX core_taggings_live
    ON core_taggings (tag_id, entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX core_taggings_entity
    ON core_taggings (entity_type, entity_id) WHERE deleted_at IS NULL;
