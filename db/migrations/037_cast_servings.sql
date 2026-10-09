-- 037_cast_servings: a guest recipe can be cast for 1–4 servings (Brian, 2026-10-08).
-- tv_cast.servings is how many times to scale that recipe's measured lines on the TV.
-- Pours and wines stay 1. The phone scales its own list as the slider moves; this column
-- is what the TV rebuilds from, so a poll shows the same amounts. It does not change the recipe.
-- Idempotent; one transaction; recorded once.
-- Undo, in one transaction:
--   ALTER TABLE tv_cast DROP CONSTRAINT IF EXISTS tv_cast_servings_check;
--   ALTER TABLE tv_cast DROP COLUMN IF EXISTS servings;
--   DELETE FROM schema_migrations WHERE version = '037_cast_servings.sql';
BEGIN;
SET LOCAL client_min_messages = warning;

ALTER TABLE tv_cast ADD COLUMN IF NOT EXISTS servings smallint NOT NULL DEFAULT 1;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tv_cast_servings_check' AND conrelid = 'tv_cast'::regclass) THEN
    ALTER TABLE tv_cast ADD CONSTRAINT tv_cast_servings_check CHECK (servings BETWEEN 1 AND 4);
  END IF;
END $$;

COMMENT ON COLUMN tv_cast.servings IS
  'Recipe casts only: 1–4. The TV multiplies measured lines by this. Pours and wines are 1.';

INSERT INTO schema_migrations (version) VALUES ('037_cast_servings.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
