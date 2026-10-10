-- Knowledge: collections of notes, links and snippets (see ARCHITECTURE §7b).

CREATE TABLE knowledge_collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    position TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE INDEX knowledge_collections_order
    ON knowledge_collections (position) WHERE deleted_at IS NULL;

-- One table for the three kinds: they share title, body, collection and tags,
-- and differ by one column each. url is required for links and only for them;
-- language is for snippets only.
CREATE TABLE knowledge_entries (
    id TEXT PRIMARY KEY,
    collection_id TEXT REFERENCES knowledge_collections (id),
    kind TEXT NOT NULL CHECK (kind IN ('note', 'link', 'snippet')),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
    body TEXT NOT NULL DEFAULT '',
    url TEXT CHECK ((kind = 'link') = (url IS NOT NULL)),
    language TEXT CHECK (language IS NULL OR (kind = 'snippet' AND length(language) <= 40)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE INDEX knowledge_entries_by_collection
    ON knowledge_entries (collection_id) WHERE deleted_at IS NULL;
