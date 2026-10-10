-- 038_cast_servings_six: a guest recipe can be cast for 1–6 servings (Brian, 2026-10-10).
-- 037 allowed 1–4. The phone slider and tv_cast.servings now share the wider range.
-- Pours and wines stay 1. Existing rows are already inside 1–6.
-- Idempotent; one transaction; recorded once.
-- Undo, in one transaction:
--   ALTER TABLE tv_cast DROP CONSTRAINT IF EXISTS tv_cast_servings_check;
--   ALTER TABLE tv_cast ADD CONSTRAINT tv_cast_servings_check CHECK (servings BETWEEN 1 AND 4);
--   COMMENT ON COLUMN tv_cast.servings IS
--     'Recipe casts only: 1–4. The TV multiplies measured lines by this. Pours and wines are 1.';
--   DELETE FROM schema_migrations WHERE version = '038_cast_servings_six.sql';
BEGIN;
SET LOCAL client_min_messages = warning;

ALTER TABLE tv_cast DROP CONSTRAINT IF EXISTS tv_cast_servings_check;
ALTER TABLE tv_cast ADD CONSTRAINT tv_cast_servings_check CHECK (servings BETWEEN 1 AND 6);

COMMENT ON COLUMN tv_cast.servings IS
  'Recipe casts only: 1–6. The TV multiplies measured lines by this. Pours and wines are 1.';

INSERT INTO schema_migrations (version) VALUES ('038_cast_servings_six.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
