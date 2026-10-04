-- 031_wine_grape: an optional grape per bottle, the Cellar's category (Brian via Rachel, 2026-10-04).
-- products.grape is display text ("Cabernet Sauvignon", "Merlot"): NULL = no grape on record, and never blank
-- or padded when set. It is NOT an ingredient: recipes keep matching on product_specs (Harvester Cabernet
-- and the Merlot stay "red wine", so a recipe that calls for red wine still finds them).
-- The guest Cellar (lib/menu.ts) shows the grape as the wine's category, or the main ingredient's label when
-- there is none (Sangria, Sake, Cranberry wine), and groups by color, then category.
-- menu_wines gets grape as its LAST column, so every existing column keeps its position.
-- Backfill (by id, or the exact name when that id isn't on the branch; dev doesn't have the Merlot); only rows
-- whose grape is still NULL, so re-running never overwrites an edit. Sangria, sake and cranberry wine stay NULL.
-- The backfill bumps bar_versions.menu_version through the 028 trigger; run `npm run notify` afterwards.
-- Idempotent; one transaction; recorded once.
-- Undo (this repo has no down scripts; a view column can't be removed with CREATE OR REPLACE): in one transaction,
--   DROP VIEW menu_wines; recreate it as in 020_cellar_wine_rule.sql; ALTER TABLE products DROP COLUMN grape;
--   DELETE FROM schema_migrations WHERE version = '031_wine_grape.sql'; (roll the app back first). Or restore
--   main from its pre-wine-grape-* backup branch (README, Backup branches).
BEGIN;
SET LOCAL client_min_messages = warning;

ALTER TABLE products ADD COLUMN IF NOT EXISTS grape text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_grape_check' AND conrelid = 'products'::regclass) THEN
    ALTER TABLE products ADD CONSTRAINT products_grape_check
      CHECK (grape IS NULL OR (char_length(btrim(grape)) > 0 AND grape = btrim(grape)));
  END IF;
END $$;

COMMENT ON COLUMN products.grape IS
  'Optional grape (e.g. "Cabernet Sauvignon"), the guest Cellar category; NULL = none (the main ingredient''s label is shown). Display only: not an ingredient, recipes still match on product_specs.';

CREATE OR REPLACE VIEW menu_wines AS
SELECT id, display_name, description, rating, origin, serve_note, pairing_notes,
       wine_color, wine_effervescence, fortified,
       wine_style_group(wine_color, wine_effervescence) AS style_group,
       grape
  FROM products p
 WHERE in_stock AND is_cellar_wine(p.id);

UPDATE products p
   SET grape = v.grape
  FROM (VALUES
    ('c4143de8-c240-4168-a928-2b5ad60255cf'::uuid, 'Harvester Cabernet',                 'Cabernet Sauvignon'),
    ('be6fa124-f80b-4628-81c0-03621bad67e4'::uuid, 'Chateau Grand Traverse Merlot 2020', 'Merlot'),
    ('3b7a3beb-f29e-4f58-97ec-08ea2e0784a4'::uuid, 'Woodbridge Pinot Grigio',            'Pinot Grigio'),
    ('8fac61fa-a95e-4645-afd2-8b42e54d9dd1'::uuid, 'Barefoot Moscato',                   'Moscato')
  ) AS v(id, name, grape)
 WHERE p.grape IS NULL
   AND (p.id = v.id
        OR (p.display_name = v.name AND NOT EXISTS (SELECT 1 FROM products x WHERE x.id = v.id)));

INSERT INTO schema_migrations (version) VALUES ('031_wine_grape.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
