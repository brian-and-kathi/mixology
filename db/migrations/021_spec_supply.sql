-- 021_spec_supply: which bottles make each ingredient available, from the same rule the menu uses.
-- spec_supply() is available_spec_ids()'s recursion unchanged (seed: always-on-hand ingredients and
-- ingredients with a bottle in stock; step: spec_substitutions source -> target, no cycles, paths under
-- 20), but it also keeps where each chain started: one row per (ingredient, source ingredient) with the
-- fewest hops (0 = the ingredient itself), and one row per in-stock bottle of that source (product_id is
-- null when the source is only always-on-hand). available_spec_ids() is redefined as its distinct
-- spec_id, so makeability (recipe_line_status, menu_mixed) and the recipe page's bottle lines can never
-- disagree. Read-only; no data changes. Idempotent; one transaction; recorded once.
BEGIN;

CREATE OR REPLACE FUNCTION spec_supply()
RETURNS TABLE(spec_id uuid, source_spec_id uuid, hops integer, product_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH RECURSIVE avail AS (
    SELECT s.id AS spec_id, s.id AS source_spec_id, ARRAY[s.id] AS path
    FROM specs s
    WHERE s.always_available
       OR EXISTS (
         SELECT 1
         FROM product_specs ps
         JOIN products p ON p.id = ps.product_id
         WHERE ps.spec_id = s.id
           AND p.in_stock
       )
    UNION ALL
    SELECT sub.target_spec_id, avail.source_spec_id, avail.path || sub.target_spec_id
    FROM avail
    JOIN spec_substitutions sub ON sub.source_spec_id = avail.spec_id
    WHERE NOT sub.target_spec_id = ANY (avail.path)
      AND cardinality(avail.path) < 20
  ),
  reach AS (
    SELECT a.spec_id, a.source_spec_id, min(cardinality(a.path)) - 1 AS hops
    FROM avail a
    GROUP BY a.spec_id, a.source_spec_id
  )
  SELECT r.spec_id, r.source_spec_id, r.hops, b.product_id
  FROM reach r
  LEFT JOIN LATERAL (
    SELECT p.id AS product_id
    FROM product_specs ps
    JOIN products p ON p.id = ps.product_id
    WHERE ps.spec_id = r.source_spec_id
      AND p.in_stock
  ) b ON true;
$$;

COMMENT ON FUNCTION spec_supply() IS
  'Available ingredients with where they come from: (ingredient, source ingredient, fewest substitution hops, in-stock bottle of the source or null when it is only always-on-hand). available_spec_ids() is its distinct spec_id.';

CREATE OR REPLACE FUNCTION available_spec_ids()
RETURNS TABLE(spec_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT s.spec_id FROM spec_supply() s;
$$;

INSERT INTO schema_migrations (version) VALUES ('021_spec_supply.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
