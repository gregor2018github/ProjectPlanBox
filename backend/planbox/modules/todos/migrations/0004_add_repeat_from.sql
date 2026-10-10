-- Repeat after completion (ARCHITECTURE §7, Recurrence). 'due' keeps the
-- schedule (the next date follows the rule); 'completion' counts the next
-- date from the day the todo was done, for plain interval rules only.

ALTER TABLE todos ADD COLUMN repeat_from TEXT NOT NULL DEFAULT 'due' CHECK (
    repeat_from IN ('due', 'completion')
);
