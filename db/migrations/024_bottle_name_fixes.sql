-- 024_bottle_name_fixes: six name fixes found in the short-name review and approved by Brian (2026-09-25).
--   Reviseur VS Cognac   -> Réviseur VS Cognac   (the brand writes Réviseur; brand and packaged name fixed too)
--   Triple Sec           -> DeKuyper Triple Sec  (matches the packaged name; short name stays NULL)
--   creme de menth       -> creme de menthe      (ingredient name and slug; unaccented, like the other cremes)
--   Carolans Irish Crema -> Carolans Irish Cream (packaged name fixed too)
--   Bailey's Irish Cream -> Baileys Irish Cream  (the brand has no apostrophe; brand and packaged name fixed too)
--   Canada Dry           -> Canada Dry Club Soda (matches the packaged name; it stays the soda water bottle)
-- The brand fields matter: the pour page and the TV cast line hide the brand only when the name contains it,
-- so fixing the name alone would make "Reviseur" / "Bailey's" show up beside the corrected name.
-- Rows are matched by id (same ids on production and dev). Each field is changed only if it still holds the
-- reviewed value (or already holds the fix); anything else is left alone with a NOTICE, so a later admin edit is
-- never clobbered. Short names and badges are not touched here (they come from the short-name load).
-- Data-only; requires 023. Idempotent; one transaction; recorded once in schema_migrations.
BEGIN;

DO $mig$
DECLARE
  f record;
  n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '023_bottle_short_names.sql') THEN
    RAISE EXCEPTION '024_bottle_name_fixes: apply 023_bottle_short_names.sql first';
  END IF;
  FOR f IN SELECT * FROM (VALUES
    ('products', 'b20db2b0-eb59-415f-aa81-1fc1133888a4'::uuid, 'display_name',   $t$Reviseur VS Cognac$t$,   $t$Réviseur VS Cognac$t$),
    ('products', 'b20db2b0-eb59-415f-aa81-1fc1133888a4'::uuid, 'packaged_name',  $t$Reviseur VS Cognac$t$,   $t$Réviseur VS Cognac$t$),
    ('products', 'b20db2b0-eb59-415f-aa81-1fc1133888a4'::uuid, 'brand',          $t$Reviseur$t$,             $t$Réviseur$t$),
    ('products', '24bd9bd9-9398-4037-838f-34208579c3aa'::uuid, 'display_name',   $t$Triple Sec$t$,           $t$DeKuyper Triple Sec$t$),
    ('specs',    '38144735-6d7c-40c2-bcb7-bfcdf4f60891'::uuid, 'canonical_name', $t$creme de menth$t$,       $t$creme de menthe$t$),
    ('specs',    '38144735-6d7c-40c2-bcb7-bfcdf4f60891'::uuid, 'slug',           $t$creme-de-menth$t$,       $t$creme-de-menthe$t$),
    ('products', 'ad63b5d1-e820-4800-a081-7154f08d729d'::uuid, 'display_name',   $t$Carolans Irish Crema$t$, $t$Carolans Irish Cream$t$),
    ('products', 'ad63b5d1-e820-4800-a081-7154f08d729d'::uuid, 'packaged_name',  $t$Carolans Irish Crema$t$, $t$Carolans Irish Cream$t$),
    ('products', '0ff3a657-c03f-4e10-ad71-992eba73be9a'::uuid, 'display_name',   $t$Bailey's Irish Cream$t$, $t$Baileys Irish Cream$t$),
    ('products', '0ff3a657-c03f-4e10-ad71-992eba73be9a'::uuid, 'packaged_name',  $t$Bailey's Irish Cream$t$, $t$Baileys Irish Cream$t$),
    ('products', '0ff3a657-c03f-4e10-ad71-992eba73be9a'::uuid, 'brand',          $t$Bailey's$t$,             $t$Baileys$t$),
    ('products', '59bb6956-fc04-4e96-8d4b-35076f8ced49'::uuid, 'display_name',   $t$Canada Dry$t$,           $t$Canada Dry Club Soda$t$)
  ) AS v(tbl, id, col, old_value, new_value)
  LOOP
    EXECUTE format('UPDATE %I SET %I = $1 WHERE id = $2 AND %I = $3', f.tbl, f.col, f.col)
      USING f.new_value, f.id, f.old_value;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
      EXECUTE format('SELECT count(*) FROM %I WHERE id = $1 AND %I IS DISTINCT FROM $2', f.tbl, f.col)
        INTO n USING f.id, f.new_value;
      IF n > 0 THEN
        RAISE NOTICE '024: left %.% on % alone (changed since review)', f.tbl, f.col, f.id;
      END IF;
    END IF;
  END LOOP;
END $mig$;

INSERT INTO schema_migrations (version) VALUES ('024_bottle_name_fixes.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
