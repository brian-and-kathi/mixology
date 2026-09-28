-- 030_featured_products: Brian's "Featured" flag (DESIGN §5.4 / §5.5). Only products can be featured (bottles,
-- and product items such as Apple Cider, which are rows in the same products table); specs cannot.
--
-- products.featured is a manual switch on the admin bottle page, no end date. What it features is worked
-- out at read time, never stored, so an out-of-stock featured product features nothing:
--   featured_product_ids()  the products that count right now: featured AND in stock. Their pour (Pours)
--                           or Cellar entry is featured, and so is their name in a recipe's bottle line.
--   featured_recipe_ids()   recipes with a line whose ingredient (spec) is one of those products' specs
--                           (product_specs, the same match the bottle line uses).
-- The change signal needs nothing new: the products UPDATE trigger from 028 compares whole rows, so
-- flipping featured bumps menu_version and cast_version like any other edit the board shows.
-- Idempotent; one transaction; recorded once.
BEGIN;
SET LOCAL client_min_messages = warning;

ALTER TABLE products ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN products.featured IS
  'Manual "Featured" switch (admin bottle page). Counts only while in_stock; see featured_product_ids() and featured_recipe_ids().';

CREATE OR REPLACE FUNCTION featured_product_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.id FROM products p WHERE p.featured AND p.in_stock;
$$;

CREATE OR REPLACE FUNCTION featured_recipe_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT DISTINCT rl.recipe_id
    FROM recipe_lines rl
    JOIN product_specs ps ON ps.spec_id = rl.spec_id
    JOIN products p ON p.id = ps.product_id
   WHERE p.featured AND p.in_stock;
$$;

INSERT INTO schema_migrations (version) VALUES ('030_featured_products.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
