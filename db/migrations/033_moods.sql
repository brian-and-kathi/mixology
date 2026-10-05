-- 033_moods: mood tags on guest items, for the phone menu's mood chips (Brian via Rachel, 2026-10-04).
-- products.moods (Pours and Cellar wines) and recipes.moods (Cocktails): text[], empty = untagged.
-- A CHECK keeps them to Brian's 8 moods, at most 3 per item, no repeats. The phone shows the chips in a fixed
-- order (MOODS in src/lib/moods.ts, the same 8 values); the TV ignores moods.
-- Adding or renaming a mood means a new migration changing both CHECKs and MOODS.
-- The tags themselves are data: db/loads/033_moods.sql (from Trinity's moods.csv), run after this file.
-- Any later edit bumps bar_versions.menu_version through the 028 triggers (whole-row diff), so phones refresh.
-- Idempotent; one transaction; recorded once.
-- Undo (no down scripts): in one transaction, ALTER TABLE products DROP COLUMN moods; ALTER TABLE recipes DROP
--   COLUMN moods; DELETE FROM schema_migrations WHERE version = '033_moods.sql'; (roll the app back first). Leaving
--   the columns in place is harmless to older app builds, which never read them. Or restore main from its
--   pre-menu-search-* backup branch (README, Backup branches).
BEGIN;
SET LOCAL client_min_messages = warning;

CREATE OR REPLACE FUNCTION moods_ok(m text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT m IS NOT NULL
     AND array_position(m, NULL) IS NULL
     AND m <@ ARRAY['Cozy','Night-Out','Smoky','Tropical','Bitter','Indulgent','Clean','Nostalgic']::text[]
     AND cardinality(m) <= 3
     AND cardinality(m) = (SELECT count(DISTINCT x) FROM unnest(m) x)
$$;
COMMENT ON FUNCTION moods_ok(text[]) IS
  'Mood tags rule (033): only Cozy, Night-Out, Smoky, Tropical, Bitter, Indulgent, Clean, Nostalgic; at most 3; no repeats.';

ALTER TABLE products ADD COLUMN IF NOT EXISTS moods text[] NOT NULL DEFAULT '{}';
ALTER TABLE recipes  ADD COLUMN IF NOT EXISTS moods text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_moods_check' AND conrelid = 'products'::regclass) THEN
    ALTER TABLE products ADD CONSTRAINT products_moods_check CHECK (moods_ok(moods));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_moods_check' AND conrelid = 'recipes'::regclass) THEN
    ALTER TABLE recipes ADD CONSTRAINT recipes_moods_check CHECK (moods_ok(moods));
  END IF;
END $$;

COMMENT ON COLUMN products.moods IS
  'Guest mood tags (033): up to 3 of Cozy, Night-Out, Smoky, Tropical, Bitter, Indulgent, Clean, Nostalgic. Phone menu chips only.';
COMMENT ON COLUMN recipes.moods IS
  'Guest mood tags (033): up to 3 of Cozy, Night-Out, Smoky, Tropical, Bitter, Indulgent, Clean, Nostalgic. Phone menu chips only.';

INSERT INTO schema_migrations (version) VALUES ('033_moods.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
