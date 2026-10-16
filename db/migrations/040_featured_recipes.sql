-- 040_featured_recipes: Brian can feature a cocktail directly, the way he features a bottle (Brian via Vincent,
-- 2026-10-16). recipes.featured is a manual switch on the admin recipe page, no end date.
-- featured_recipe_ids() now returns recipes that are flagged OR (as before, 034) whose offered bottle for a
-- required line is a featured, in-stock product. Everything downstream (phone menu sort and copper tag, TV
-- flourish and pinning, recipe page, cast) already reads that function, so nothing else changes.
-- Exclusivity mirrors bottles: a cocktail that needs a reserved bottle is locked and never shown as featured
-- (lib/menu.ts lock()). Recipes have no manual Reserved switch, so no CHECK constraint is needed.
-- The change signal needs nothing new: the recipes UPDATE trigger compares whole rows, so flipping featured
-- bumps menu_version and cast_version.
-- Idempotent; one transaction; recorded once.
-- Undo, in one transaction: re-run the featured_recipe_ids() body from 034; ALTER TABLE recipes DROP COLUMN featured;
--   DELETE FROM schema_migrations WHERE version = '040_featured_recipes.sql';
BEGIN;
SET LOCAL client_min_messages = warning;

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN recipes.featured IS
  'Manual "Featured" switch (admin recipe page). Shown only while the drink is on the menu and not locked; see featured_recipe_ids().';

CREATE OR REPLACE FUNCTION featured_recipe_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH free_shelf AS (
    SELECT sp.id FROM specs sp
     WHERE sp.always_available
        OR EXISTS (SELECT 1 FROM product_specs ps JOIN products p ON p.id = ps.product_id
                    WHERE ps.spec_id = sp.id AND p.in_stock AND NOT p.reserved)),
  lead AS (
    SELECT rl.recipe_id,
           COALESCE((SELECT o.spec_id FROM recipe_line_options o JOIN free_shelf f ON f.id = o.spec_id
                      WHERE o.recipe_line_id = rl.id ORDER BY o.rank LIMIT 1), rl.spec_id) AS spec_id
      FROM recipe_lines rl
     WHERE rl.required)
  SELECT l.recipe_id
    FROM lead l
    JOIN product_specs ps ON ps.spec_id = l.spec_id
    JOIN products p ON p.id = ps.product_id
   WHERE p.featured AND p.in_stock
  UNION
  SELECT r.id FROM recipes r WHERE r.featured;
$$;

INSERT INTO schema_migrations (version) VALUES ('040_featured_recipes.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
