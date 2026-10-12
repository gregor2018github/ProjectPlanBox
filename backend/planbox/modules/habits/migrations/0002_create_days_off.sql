-- Days off: single dates on which a habit is not due (a holiday, a sick day).
-- The schedule skips them, so they neither count for nor break a streak.
-- Taking a day off back soft-deletes the row; taking it off again adds a new one.

CREATE TABLE habits_days_off (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL REFERENCES habits (id),
    day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE UNIQUE INDEX habits_days_off_live
    ON habits_days_off (habit_id, day) WHERE deleted_at IS NULL;
