-- The day plan (ARCHITECTURE §7, Day plan): todos picked for one day, in a
-- hand-sorted order. `plan_date` is the local day a todo was planned for and
-- `plan_position` its place that day. A todo is in the plan only while
-- `plan_date` is today, so the plan empties itself at midnight without any
-- job clearing it.

ALTER TABLE todos ADD COLUMN plan_date TEXT;
ALTER TABLE todos ADD COLUMN plan_position TEXT;
