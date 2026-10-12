-- Done marks: whether one occurrence of an event was done, set by hand.
-- Without a mark an occurrence counts as done once it has ended; a mark
-- overrides that either way (ticked early, or "did not happen"). Clearing a
-- mark soft-deletes it, and a new one is a new row.

CREATE TABLE calendar_done_marks (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES calendar_events (id),
    -- Local start date of the occurrence, like calendar_exceptions.
    occurrence_date TEXT NOT NULL CHECK (
        occurrence_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    done INTEGER NOT NULL CHECK (done IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE UNIQUE INDEX calendar_done_marks_live
    ON calendar_done_marks (event_id, occurrence_date) WHERE deleted_at IS NULL;
