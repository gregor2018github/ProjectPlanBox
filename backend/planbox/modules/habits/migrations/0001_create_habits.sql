-- Habits: a schedule (RRULE on floating dates) and daily check-ins (see ARCHITECTURE §7c).

CREATE TABLE habits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    notes TEXT NOT NULL DEFAULT '',
    rrule TEXT NOT NULL,
    start_date TEXT NOT NULL CHECK (
        start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    position TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE INDEX habits_order ON habits (position) WHERE deleted_at IS NULL;

-- One live check-in per habit and day. Unchecking soft-deletes it; checking
-- the day again adds a new row.
CREATE TABLE habits_checkins (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL REFERENCES habits (id),
    day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE UNIQUE INDEX habits_checkins_live
    ON habits_checkins (habit_id, day) WHERE deleted_at IS NULL;
