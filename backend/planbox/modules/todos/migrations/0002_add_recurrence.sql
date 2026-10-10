-- Recurring todos (ARCHITECTURE §7). A repeating todo keeps its RRULE
-- (without DTSTART) and the floating date the series is anchored on.
-- Completing it inserts the next occurrence as a new row whose
-- recurs_from_id points back, so reopening can take that row away again.

ALTER TABLE todos ADD COLUMN recurrence_anchor TEXT CHECK (
    recurrence_anchor IS NULL
    OR recurrence_anchor GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
);

ALTER TABLE todos ADD COLUMN rrule TEXT CHECK (
    rrule IS NULL
    OR (
        length(rrule) BETWEEN 1 AND 500
        AND due_date IS NOT NULL
        AND recurrence_anchor IS NOT NULL
        AND parent_id IS NULL
    )
);

ALTER TABLE todos ADD COLUMN recurs_from_id TEXT REFERENCES todos (id);

CREATE INDEX todos_by_recurs_from ON todos (recurs_from_id)
WHERE recurs_from_id IS NOT NULL;
