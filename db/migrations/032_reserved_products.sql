-- 032_reserved_products: Brian's "Reserved" bottles (relayed by Vincent, 2026-10-04). A reserved bottle is kept
-- for an occasion: it stays on the shelf and on the menu, but anything that needs it is LOCKED for guests
-- ("Ask the host"), with an optional short note ("Kathi's 50th").
--   products.reserved       manual switch on the admin bottle page; independent of in_stock.
--   products.reserved_note  optional occasion, trimmed, never blank, at most 40 characters.
--   Reserved and featured are never both on (CHECK; the admin form and saveProduct enforce it too).
-- Reserved only matters while the bottle is in stock: an out-of-stock bottle is off the menu as before, and so
-- is a cocktail that can't be built without it. What is locked is worked out at read time, never stored:
--   free_spec_ids()     like available_spec_ids() (spec_supply(), migration 021) but counting only in-stock
--                       bottles that are NOT reserved (plus always-available specs and stand-ins).
--   menu_neat / menu_wines   + reserved, reserved_note: the bottle's own flag (its pour or Cellar entry is locked).
--   menu_mixed               + reserved: buildable tonight, but only with a reserved bottle (a required line is
--                            available yet not free). + reserved_note: the note of a reserved bottle behind such a
--                            line, if any. A cocktail with a free bottle for every line is NOT locked.
-- New columns go at the END of each view, so every existing column keeps its position.
-- The change signal needs nothing new: the 028 products UPDATE trigger compares whole rows, so flipping
-- reserved or editing the note bumps menu_version and cast_version like any other board edit.
-- Idempotent; one transaction; recorded once.
BEGIN;
SET LOCAL client_min_messages = warning;

ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_reserved_note_check' AND conrelid = 'products'::regclass) THEN
    ALTER TABLE products ADD CONSTRAINT products_reserved_note_check
      CHECK (reserved_note IS NULL OR (char_length(btrim(reserved_note)) > 0 AND reserved_note = btrim(reserved_note) AND char_length(reserved_note) <= 40));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_reserved_not_featured' AND conrelid = 'products'::regclass) THEN
    ALTER TABLE products ADD CONSTRAINT products_reserved_not_featured CHECK (NOT (reserved AND featured));
  END IF;
END $$;

COMMENT ON COLUMN products.reserved IS
  'Manual "Reserved" switch (admin bottle page): kept for an occasion. While in stock, its pour and any cocktail that needs it are locked for guests ("Ask the host"). Never with featured.';
COMMENT ON COLUMN products.reserved_note IS
  'Optional occasion for a reserved bottle (e.g. "Kathi''s 50th"), at most 40 characters; guests see "Saved for …".';

CREATE OR REPLACE FUNCTION free_spec_ids() RETURNS TABLE(spec_id uuid)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH RECURSIVE avail AS (
    SELECT s.id AS spec_id, ARRAY[s.id] AS path
      FROM specs s
     WHERE s.always_available
        OR EXISTS (SELECT 1 FROM product_specs ps JOIN products p ON p.id = ps.product_id
                    WHERE ps.spec_id = s.id AND p.in_stock AND NOT p.reserved)
    UNION ALL
    SELECT sub.target_spec_id, avail.path || sub.target_spec_id
      FROM avail
      JOIN spec_substitutions sub ON sub.source_spec_id = avail.spec_id
     WHERE NOT sub.target_spec_id = ANY (avail.path)
       AND cardinality(avail.path) < 20
  )
  SELECT DISTINCT a.spec_id FROM avail a;
$$;

COMMENT ON FUNCTION free_spec_ids() IS
  'Specs available tonight without a reserved bottle (available_spec_ids() minus reserved bottles). A buildable cocktail with a required line outside this set is locked.';

CREATE OR REPLACE VIEW menu_neat AS
 SELECT p.id, p.display_name, p.description, p.rating, p.origin, p.serve_note,
        p.serves_neat, p.serves_rocks, p.serves_chilled, p.serves_glass, p.serves_bottle, p.brand, p.abv,
        s.canonical_name AS primary_spec_name,
        p.reserved, p.reserved_note
   FROM products p
     LEFT JOIN families pf ON pf.id = p.family_id
     LEFT JOIN LATERAL ( SELECT ps.spec_id
           FROM product_specs ps
          WHERE ps.product_id = p.id AND (ps.is_primary OR (( SELECT count(*) AS count
                   FROM product_specs c
                  WHERE c.product_id = p.id)) = 1)
          ORDER BY ps.is_primary DESC
         LIMIT 1) prim ON true
     LEFT JOIN specs s ON s.id = prim.spec_id
     LEFT JOIN spec_families ssf ON ssf.spec_id = s.id AND ssf.is_primary
     LEFT JOIN families sf ON sf.id = ssf.family_id
  WHERE p.in_stock AND NOT p.mix_only AND (COALESCE(pf.kind, sf.kind, 'spirit'::text) = ANY (ARRAY['spirit'::text, 'modifier'::text, 'wine'::text])) AND (p.serves_neat OR p.serves_rocks OR COALESCE(s.as_neat, false)) AND NOT COALESCE(s.ingredient_only, false);

CREATE OR REPLACE VIEW menu_wines AS
SELECT id, display_name, description, rating, origin, serve_note, pairing_notes,
       wine_color, wine_effervescence, fortified,
       wine_style_group(wine_color, wine_effervescence) AS style_group,
       grape, reserved, reserved_note
  FROM products p
 WHERE in_stock AND is_cellar_wine(p.id);

CREATE OR REPLACE VIEW menu_mixed AS
 WITH avail AS MATERIALIZED (
         SELECT available_spec_ids.spec_id FROM available_spec_ids() available_spec_ids(spec_id)
        ), free AS MATERIALIZED (
         SELECT free_spec_ids.spec_id FROM free_spec_ids() free_spec_ids(spec_id)
        )
 SELECT id, name, description, rating, section,
        EXISTS (SELECT 1 FROM recipe_lines rl
                 WHERE rl.recipe_id = r.id AND rl.required
                   AND NOT EXISTS (SELECT 1 FROM free WHERE free.spec_id = rl.spec_id)) AS reserved,
        (SELECT p.reserved_note
           FROM recipe_lines rl
           JOIN spec_supply() x ON x.spec_id = rl.spec_id
           JOIN products p ON p.id = x.product_id
          WHERE rl.recipe_id = r.id AND rl.required
            AND NOT EXISTS (SELECT 1 FROM free WHERE free.spec_id = rl.spec_id)
            AND p.reserved AND p.reserved_note IS NOT NULL
          ORDER BY lower(p.display_name)
          LIMIT 1) AS reserved_note
   FROM recipes r
  WHERE section = 'mixed'::text AND NOT (EXISTS ( SELECT 1
           FROM recipe_lines rl
          WHERE rl.recipe_id = r.id AND rl.required AND NOT (EXISTS ( SELECT 1
                   FROM avail
                  WHERE avail.spec_id = rl.spec_id))));

INSERT INTO schema_migrations (version) VALUES ('032_reserved_products.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
