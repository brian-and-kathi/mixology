-- 020_cellar_wine_rule: one shared "is this a Cellar wine?" rule for the guest Cellar and the admin
-- Spirits | Wines split. is_cellar_wine() is exactly the category test menu_wines has used since 011
-- (a wine family on the bottle or on any of its types, and not a drinks-only primary/sole type, so
-- vermouth stays with the spirits), minus the in-stock filter. menu_wines is redefined on top of it
-- with the same columns, so the guest Cellar is unchanged; admin calls the same function, so the two
-- can never disagree. is_cellar_wine_spec() applies it to an ingredient (for "To buy": wine outs are
-- never shopping items). Read-only helpers; no data changes. Idempotent; one transaction; recorded once.
-- (019 is reserved by the admin-pin branch.)
BEGIN;

CREATE OR REPLACE FUNCTION is_cellar_wine(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT (EXISTS (SELECT 1 FROM products p JOIN families f ON f.id = p.family_id
                   WHERE p.id = p_product_id AND f.kind = 'wine')
          OR EXISTS (SELECT 1 FROM product_specs ps
                       JOIN spec_families sf ON sf.spec_id = ps.spec_id
                       JOIN families f ON f.id = sf.family_id
                      WHERE ps.product_id = p_product_id AND f.kind = 'wine'))
     AND NOT EXISTS (SELECT 1 FROM product_specs ps JOIN specs s ON s.id = ps.spec_id
                      WHERE ps.product_id = p_product_id AND s.ingredient_only
                        AND (ps.is_primary OR (SELECT count(*) FROM product_specs c WHERE c.product_id = p_product_id) = 1));
$$;

COMMENT ON FUNCTION is_cellar_wine(uuid) IS
  'True when a bottle belongs in the guest Cellar (ignoring stock): wine family on the bottle or a type, and not a drinks-only primary type. Shared by menu_wines and the admin Spirits | Wines split.';

CREATE OR REPLACE VIEW menu_wines AS
SELECT id, display_name, description, rating, origin, serve_note, pairing_notes,
       wine_color, wine_effervescence, fortified,
       wine_style_group(wine_color, wine_effervescence) AS style_group
  FROM products p
 WHERE in_stock AND is_cellar_wine(p.id);

-- An ingredient is a wine when every bottle of it is a Cellar wine; with no bottles yet, when its own
-- family is a wine family and it isn't drinks-only (what is_cellar_wine would say for its first bottle).
CREATE OR REPLACE FUNCTION is_cellar_wine_spec(p_spec_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM product_specs ps WHERE ps.spec_id = p_spec_id)
      THEN NOT EXISTS (SELECT 1 FROM product_specs ps WHERE ps.spec_id = p_spec_id AND NOT is_cellar_wine(ps.product_id))
    ELSE EXISTS (SELECT 1 FROM spec_families sf JOIN families f ON f.id = sf.family_id
                  WHERE sf.spec_id = p_spec_id AND f.kind = 'wine')
         AND NOT (SELECT s.ingredient_only FROM specs s WHERE s.id = p_spec_id)
  END;
$$;

COMMENT ON FUNCTION is_cellar_wine_spec(uuid) IS
  'True when an ingredient is a Cellar wine (all its bottles are, or with no bottles its family is wine and it is not drinks-only). Wine outs are never shopping items.';

INSERT INTO schema_migrations (version) VALUES ('020_cellar_wine_rule.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
