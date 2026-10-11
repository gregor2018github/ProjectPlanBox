-- Area colours (ARCHITECTURE §7, Area colours). An area stores only a hue
-- (0-359 degrees on the OKLCH wheel); lightness and chroma come from theme
-- tokens, so every hue stays quiet and readable in both themes. Existing
-- areas get the default palette in sidebar order, so they start distinct.

ALTER TABLE todos_areas ADD COLUMN hue INTEGER NOT NULL DEFAULT 264 CHECK (hue BETWEEN 0 AND 359);

UPDATE todos_areas
SET hue = (
    SELECT CASE ranked.n % 8
        WHEN 0 THEN 264
        WHEN 1 THEN 155
        WHEN 2 THEN 30
        WHEN 3 THEN 210
        WHEN 4 THEN 310
        WHEN 5 THEN 80
        WHEN 6 THEN 350
        ELSE 185
    END
    FROM (
        SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS n
        FROM todos_areas
        WHERE deleted_at IS NULL
    ) AS ranked
    WHERE ranked.id = todos_areas.id
)
WHERE deleted_at IS NULL;
