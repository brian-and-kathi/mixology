-- 023_bottle_short_names: an optional short name and badge text per bottle. The short name is for places where the bottle's category is
-- already said next to it: under a recipe ingredient ("Rye": "Bowright Recurve · Willett") and on Pours and
-- the pour page, where the category is shown as a badge after the name ("Bowright Recurve [Rye]").
-- The full name (display_name) stays stored and required and is still used everywhere else (admin, search,
-- change log, casting); NULL short_name means "use the full name". A short name, when set, is never blank.
-- The badge is the bottle's primary ingredient (product_specs.is_primary, the same link recipes match on),
-- sentence-cased in code (lib/spec-label.ts), unless spec_label overrides it for display ("London dry gin" for a
-- bottle whose ingredient is gin). spec_label is display only: recipe matching, buildability, stand-ins and
-- shopping still use product_specs. Both columns are NULL by default and never blank or padded when set.
-- Cellar wines keep their full names for now (the app ignores short_name for is_cellar_wine() bottles).
-- Schema only: no names or labels are filled in here.
-- Admin edits go through saveProduct(), whose change_log rows already capture the whole row (to_jsonb).
-- Idempotent; one transaction; recorded once.
BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS short_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS spec_label text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_short_name_check' AND conrelid = 'products'::regclass) THEN
    ALTER TABLE products ADD CONSTRAINT products_short_name_check
      CHECK (short_name IS NULL OR (char_length(btrim(short_name)) > 0 AND short_name = btrim(short_name)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_spec_label_check' AND conrelid = 'products'::regclass) THEN
    ALTER TABLE products ADD CONSTRAINT products_spec_label_check
      CHECK (spec_label IS NULL OR (char_length(btrim(spec_label)) > 0 AND spec_label = btrim(spec_label)));
  END IF;
END $$;

COMMENT ON COLUMN products.short_name IS
  'Optional guest-facing name without the category (e.g. "Bowright Recurve" for Bowright Recurve Rye); NULL = use display_name. Not used for Cellar wines.';
COMMENT ON COLUMN products.spec_label IS
  'Optional badge text (e.g. "London dry gin"); NULL = the primary ingredient, sentence-cased. Display only: recipes still match on product_specs.';

INSERT INTO schema_migrations (version) VALUES ('023_bottle_short_names.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
