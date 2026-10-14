-- "My order" in All todos (ARCHITECTURE §7, My order). One manual ranking
-- over every open todo and subtask, kept for talking priorities through
-- with someone. A todo without a key is "unsorted": new todos start there
-- and a todo taken out of the ranking goes back there.

ALTER TABLE todos ADD COLUMN rank_position TEXT;
