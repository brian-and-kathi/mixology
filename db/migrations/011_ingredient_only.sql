-- 011_ingredient_only: specs.ingredient_only hides a spec's products from the sipping
-- menus (Cellar = menu_wines, Pours = menu_neat). The spec still counts for buildability
-- and substitutions: available_spec_ids(), spec_availability, recipe_line_status,
-- menu_mixed and menu_mixed_lines are NOT touched.
-- Flags exactly two specs: dry-vermouth and sweet-vermouth (fails if either is missing).
-- Idempotent: safe to re-run; one transaction; recorded once in schema_migrations.
BEGIN;

ALTER TABLE specs
  ADD COLUMN IF NOT EXISTS ingredient_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN specs.ingredient_only IS
  'Hidden from sipping menus (Cellar and Pours) but still counts for buildability and substitutions.';

DO $$
DECLARE
  v_missing text;
  n integer;
BEGIN
  SELECT string_agg(want, ', ') INTO v_missing
  FROM unnest(ARRAY['dry-vermouth', 'sweet-vermouth']) AS want
  WHERE NOT EXISTS (SELECT 1 FROM specs WHERE slug = want);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '011_ingredient_only: spec(s) not found: %', v_missing;
  END IF;

  UPDATE specs SET ingredient_only = true
  WHERE slug IN ('dry-vermouth', 'sweet-vermouth') AND NOT ingredient_only;

  SELECT count(*) INTO n FROM specs WHERE ingredient_only;
  IF n <> 2 OR EXISTS (SELECT 1 FROM specs WHERE ingredient_only
                       AND slug NOT IN ('dry-vermouth', 'sweet-vermouth')) THEN
    RAISE EXCEPTION '011_ingredient_only: expected exactly dry-vermouth and sweet-vermouth flagged, found % flagged', n;
  END IF;
END $$;

-- Pours: same definition as before plus "primary spec is not ingredient_only".
CREATE OR REPLACE VIEW menu_neat AS
 SELECT p.id,
    p.display_name,
    p.description,
    p.rating,
    p.origin,
    p.serve_note,
    p.serves_neat,
    p.serves_rocks,
    p.serves_chilled,
    p.serves_glass,
    p.serves_bottle,
    p.brand,
    p.abv,
    s.canonical_name AS primary_spec_name
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
  WHERE p.in_stock AND NOT p.mix_only
    AND COALESCE(pf.kind, sf.kind, 'spirit'::text) = ANY (ARRAY['spirit'::text, 'modifier'::text, 'wine'::text])
    AND (p.serves_neat OR p.serves_rocks OR COALESCE(s.as_neat, false))
    AND NOT COALESCE(s.ingredient_only, false);

-- Cellar: same definition as before plus "primary (or only) spec is not ingredient_only".
CREATE OR REPLACE VIEW menu_wines AS
 SELECT id,
    display_name,
    description,
    rating,
    origin,
    serve_note,
    pairing_notes,
    wine_color,
    wine_effervescence,
    fortified,
    wine_style_group(wine_color, wine_effervescence) AS style_group
   FROM products p
  WHERE in_stock
    AND (EXISTS ( SELECT 1
           FROM families f
          WHERE f.id = p.family_id AND f.kind = 'wine'::text)
      OR EXISTS ( SELECT 1
           FROM product_specs ps
             JOIN spec_families sf ON sf.spec_id = ps.spec_id
             JOIN families f ON f.id = sf.family_id
          WHERE ps.product_id = p.id AND f.kind = 'wine'::text))
    AND NOT EXISTS ( SELECT 1
           FROM product_specs ps
             JOIN specs s ON s.id = ps.spec_id
          WHERE ps.product_id = p.id AND s.ingredient_only
            AND (ps.is_primary OR (( SELECT count(*) AS count
                   FROM product_specs c
                  WHERE c.product_id = p.id)) = 1));

INSERT INTO schema_migrations (version) VALUES ('011_ingredient_only.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
