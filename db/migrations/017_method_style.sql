-- 017_method_style: recipes.method_style holds how a drink is made (stirred, shaken, …) as data,
-- so the Method label ("METHOD · STIRRED") no longer depends on the description starting with
-- that word. Backfilled from the current leading word of each description; rows whose text has
-- no leading style stay NULL. Display-only: never affects buildability.
-- Idempotent: safe to re-run; one transaction; recorded once in schema_migrations.
BEGIN;

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS method_style text;
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_method_style_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_method_style_check CHECK (
  method_style IS NULL OR method_style IN
    ('stirred', 'shaken', 'built', 'blended', 'rolled', 'thrown', 'swizzled', 'warm', 'warm, in a mug', 'warm, batch')
);
COMMENT ON COLUMN recipes.method_style IS
  'How the drink is made, shown in the Method label (e.g. METHOD · STIRRED). Display-only.';

-- Backfill from a leading "Stirred." / "Shaken." / "Warm, in a mug." in the description.
UPDATE recipes r
   SET method_style = m.style
  FROM (
    SELECT id, lower(substring(btrim(description) FROM
             '^((?:[Ss]tirred|[Ss]haken|[Bb]uilt|[Bb]lended|[Rr]olled|[Tt]hrown|[Ss]wizzled|[Ww]arm(?:, ?[a-z ]{1,24})?))\.\s')) AS style
      FROM recipes
  ) m
 WHERE m.id = r.id
   AND r.method_style IS NULL
   AND m.style IN ('stirred', 'shaken', 'built', 'blended', 'rolled', 'thrown', 'swizzled', 'warm', 'warm, in a mug', 'warm, batch');

INSERT INTO schema_migrations (version) VALUES ('017_method_style.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
