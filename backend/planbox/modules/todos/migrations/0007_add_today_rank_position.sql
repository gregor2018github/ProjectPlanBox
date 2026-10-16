-- "My order" in Today (ARCHITECTURE §7, My order). One manual order over
-- everything in Today, overdue and due today mixed, separate from the
-- per-group order of `today_position`. A todo without a key is "unsorted":
-- todos arriving in Today start there.

ALTER TABLE todos ADD COLUMN today_rank_position TEXT;
