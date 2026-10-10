-- Manual order inside Today (ARCHITECTURE §7). Today mixes todos from every
-- list, so `position` (order among siblings) cannot order it. A todo gets a
-- key once Today is reordered; changing its due date clears the key, so a
-- todo arriving in Today lands at the end of the manual order.

ALTER TABLE todos ADD COLUMN today_position TEXT;
