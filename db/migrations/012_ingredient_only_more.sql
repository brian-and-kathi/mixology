-- 012_ingredient_only_more: also flag absinthe-verte (Nain Rouge Absinthe) and
-- vanilla-vodka (Smirnoff Vanilla Vodka) as ingredient_only, so they leave Pours
-- (menu_neat) but still count for buildability and substitutions. Requires 011.
-- Fails if either spec is missing, or if any other in-stock product shares either spec.
-- Idempotent: safe to re-run; one transaction; recorded once in schema_migrations.
BEGIN;

DO $$
DECLARE
  v_missing text;
  v_shared text;
  v_flagged text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '011_ingredient_only.sql') THEN
    RAISE EXCEPTION '012_ingredient_only_more: apply 011_ingredient_only.sql first';
  END IF;

  SELECT string_agg(want, ', ') INTO v_missing
  FROM unnest(ARRAY['absinthe-verte', 'vanilla-vodka']) AS want
  WHERE NOT EXISTS (SELECT 1 FROM specs WHERE slug = want);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '012_ingredient_only_more: spec(s) not found: %', v_missing;
  END IF;

  SELECT string_agg(s.slug || ' <- ' || p.display_name, '; ') INTO v_shared
  FROM specs s
  JOIN product_specs ps ON ps.spec_id = s.id
  JOIN products p ON p.id = ps.product_id
  WHERE p.in_stock
    AND ((s.slug = 'absinthe-verte' AND p.display_name <> 'Nain Rouge Absinthe')
      OR (s.slug = 'vanilla-vodka' AND p.display_name <> 'Smirnoff Vanilla Vodka'));
  IF v_shared IS NOT NULL THEN
    RAISE EXCEPTION '012_ingredient_only_more: other in-stock products share these specs: %', v_shared;
  END IF;

  UPDATE specs SET ingredient_only = true
  WHERE slug IN ('absinthe-verte', 'vanilla-vodka') AND NOT ingredient_only;

  SELECT string_agg(slug, ',' ORDER BY slug) INTO v_flagged FROM specs WHERE ingredient_only;
  IF v_flagged IS DISTINCT FROM 'absinthe-verte,dry-vermouth,sweet-vermouth,vanilla-vodka' THEN
    RAISE EXCEPTION '012_ingredient_only_more: unexpected ingredient_only set: %', v_flagged;
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('012_ingredient_only_more.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
