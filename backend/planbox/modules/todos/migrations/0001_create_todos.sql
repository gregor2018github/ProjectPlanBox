-- Todos: Area -> List -> Section -> Todo -> Subtask (see ARCHITECTURE §7).

CREATE TABLE todos_areas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    position TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE TABLE todos_lists (
    id TEXT PRIMARY KEY,
    area_id TEXT REFERENCES todos_areas (id),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    position TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE INDEX todos_lists_by_area ON todos_lists (area_id, position) WHERE deleted_at IS NULL;

CREATE TABLE todos_sections (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES todos_lists (id),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    position TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE INDEX todos_sections_by_list ON todos_sections (list_id, position) WHERE deleted_at IS NULL;

CREATE TABLE todos (
    id TEXT PRIMARY KEY,
    list_id TEXT REFERENCES todos_lists (id),
    section_id TEXT REFERENCES todos_sections (id),
    parent_id TEXT REFERENCES todos (id),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
    notes TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
    due_date TEXT CHECK (
        due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    position TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK (section_id IS NULL OR list_id IS NOT NULL),
    CHECK (parent_id IS NULL OR parent_id <> id)
) STRICT;

CREATE INDEX todos_siblings
    ON todos (list_id, section_id, parent_id, position) WHERE deleted_at IS NULL;
CREATE INDEX todos_by_parent
    ON todos (parent_id) WHERE deleted_at IS NULL AND parent_id IS NOT NULL;
CREATE INDEX todos_by_section
    ON todos (section_id) WHERE deleted_at IS NULL AND section_id IS NOT NULL;
CREATE INDEX todos_open_by_due
    ON todos (due_date) WHERE deleted_at IS NULL AND completed_at IS NULL;
CREATE INDEX todos_completed
    ON todos (completed_at, id) WHERE deleted_at IS NULL AND completed_at IS NOT NULL;
