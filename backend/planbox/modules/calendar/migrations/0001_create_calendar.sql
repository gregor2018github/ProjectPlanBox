-- Calendar: events (timed or all-day, optionally recurring) and skipped occurrences.

CREATE TABLE calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
    notes TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 500),
    all_day INTEGER NOT NULL CHECK (all_day IN (0, 1)),
    -- Timed events: UTC instants.
    start_at TEXT,
    end_at TEXT,
    -- All-day events: floating dates; end_date is the last day (inclusive).
    start_date TEXT CHECK (
        start_date IS NULL OR start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    end_date TEXT CHECK (
        end_date IS NULL OR end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    -- iCalendar RRULE without DTSTART; the event's start anchors the series.
    rrule TEXT CHECK (rrule IS NULL OR length(rrule) BETWEEN 1 AND 500),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK (
        (
            all_day = 0
            AND start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at
            AND start_date IS NULL AND end_date IS NULL
        )
        OR (
            all_day = 1
            AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date
            AND start_at IS NULL AND end_at IS NULL
        )
    )
) STRICT;

CREATE INDEX calendar_events_timed
    ON calendar_events (start_at) WHERE deleted_at IS NULL AND all_day = 0;
CREATE INDEX calendar_events_all_day
    ON calendar_events (start_date) WHERE deleted_at IS NULL AND all_day = 1;
CREATE INDEX calendar_events_recurring
    ON calendar_events (id) WHERE deleted_at IS NULL AND rrule IS NOT NULL;

CREATE TABLE calendar_exceptions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES calendar_events (id),
    -- Local start date of the occurrence that is skipped.
    occurrence_date TEXT NOT NULL CHECK (
        occurrence_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE UNIQUE INDEX calendar_exceptions_live
    ON calendar_exceptions (event_id, occurrence_date) WHERE deleted_at IS NULL;
