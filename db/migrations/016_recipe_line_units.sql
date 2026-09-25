-- 016_recipe_line_units: "top" and "rinse" recipe lines may have no amount
-- ("Top with soda", "Absinthe rinse"). Every other line keeps the old rule: either no amount
-- and no unit, or an amount > 0 with a unit. top/rinse never take an amount.
-- (The old check let an amount-less line with a unit through, because NULL > 0 is NULL; this one
-- spells out the NULLs.) The unit list itself (oz, dash, barspoon, tsp, …) is enforced by the admin app, not here.
-- Idempotent: safe to re-run; one transaction; recorded once in schema_migrations.
BEGIN;

ALTER TABLE recipe_lines DROP CONSTRAINT IF EXISTS recipe_lines_check;
ALTER TABLE recipe_lines ADD CONSTRAINT recipe_lines_check CHECK (
     (amount IS NULL AND unit IS NULL)
  OR (amount IS NULL AND unit IN ('top', 'rinse'))
  OR (amount IS NOT NULL AND amount > 0 AND unit IS NOT NULL AND char_length(btrim(unit)) > 0
      AND unit NOT IN ('top', 'rinse'))
);

INSERT INTO schema_migrations (version) VALUES ('016_recipe_line_units.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
