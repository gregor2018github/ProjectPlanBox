-- Knowledge entries become pages (ARCHITECTURE §7b): one kind instead of
-- note, link and snippet. A page is a JSON document of freely placed boxes,
-- each holding a rich-text document (Tiptap/ProseMirror JSON). body becomes
-- the page's plain text, derived on every write, for search and previews.
--
-- Every old entry turns into a page with one box at the top left:
--   note    → one paragraph per line of its text
--   link    → the address as a link, then one paragraph per description line
--   snippet → one code block in its language
-- The conversion is deterministic (the box id is the entry id, updated_at is
-- kept), so a PC and a phone that both migrate end up with the same rows.

CREATE TABLE knowledge_entries_new (
    id TEXT PRIMARY KEY,
    collection_id TEXT REFERENCES knowledge_collections (id),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
    content TEXT NOT NULL CHECK (json_valid(content)),
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

WITH RECURSIVE
source AS (
    SELECT id, kind, url, language, replace(body, char(13), '') AS text
    FROM knowledge_entries
),
-- The lines of note texts and link descriptions (a link without one has none).
lines (id, n, line, rest) AS (
    SELECT id, 0, NULL, text || char(10)
    FROM source
    WHERE kind = 'note' OR (kind = 'link' AND text != '')
    UNION ALL
    SELECT id, n + 1,
           substr(rest, 1, instr(rest, char(10)) - 1),
           substr(rest, instr(rest, char(10)) + 1)
    FROM lines
    WHERE rest != ''
),
nodes (id, n, node) AS (
    SELECT id, n, CASE
        WHEN line = '' THEN json_object('type', 'paragraph')
        ELSE json_object(
            'type', 'paragraph',
            'content', json_array(json_object('type', 'text', 'text', line)))
    END
    FROM lines
    WHERE n > 0
    UNION ALL
    SELECT id, 0, json_object(
        'type', 'paragraph',
        'content', json_array(json_object(
            'type', 'text', 'text', url,
            'marks', json_array(json_object('type', 'link', 'attrs', json_object('href', url))))))
    FROM source
    WHERE kind = 'link'
    UNION ALL
    SELECT id, 0, CASE
        WHEN text = '' THEN json_object(
            'type', 'codeBlock', 'attrs', json_object('language', language))
        ELSE json_object(
            'type', 'codeBlock', 'attrs', json_object('language', language),
            'content', json_array(json_object('type', 'text', 'text', text)))
    END
    FROM source
    WHERE kind = 'snippet'
),
docs (id, content) AS (
    SELECT id, json_group_array(json(node) ORDER BY n)
    FROM nodes
    GROUP BY id
)
INSERT INTO knowledge_entries_new
    (id, collection_id, title, content, body, created_at, updated_at, deleted_at)
SELECT e.id, e.collection_id, e.title,
       json_object('boxes', json_array(json_object(
           'id', e.id, 'x', 0, 'y', 0, 'width', 640,
           'doc', json_object('type', 'doc', 'content', json(d.content))))),
       CASE
           WHEN e.kind != 'link' THEN s.text
           WHEN s.text = '' THEN e.url
           ELSE e.url || char(10) || s.text
       END,
       e.created_at, e.updated_at, e.deleted_at
FROM knowledge_entries e
JOIN source s ON s.id = e.id
JOIN docs d ON d.id = e.id;

DROP TABLE knowledge_entries;

ALTER TABLE knowledge_entries_new RENAME TO knowledge_entries;

CREATE INDEX knowledge_entries_by_collection
    ON knowledge_entries (collection_id) WHERE deleted_at IS NULL;
