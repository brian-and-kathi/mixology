-- 010_glassware: glassware lookup + recipe glass/service fields (Neon mixology only).
-- Glassware is display-only (a recommendation on a recipe); it is NOT inventory and never
-- affects buildability. Idempotent: safe to re-run; one transaction; recorded once in
-- schema_migrations like the other migrations.
BEGIN;

CREATE TABLE IF NOT EXISTS glassware (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text
);
COMMENT ON TABLE glassware IS 'Glass types recommended by recipes. Display-only; not inventory, never blocks buildability.';

INSERT INTO glassware (name, description) VALUES
  ('martini', NULL),
  ('coupe', NULL),
  ('nick & nora', NULL),
  ('rocks', NULL),
  ('double rocks', NULL),
  ('highball', NULL),
  ('collins', NULL),
  ('copper mug', NULL),
  ('wine glass', NULL),
  ('flute', NULL),
  ('hurricane', NULL),
  ('irish coffee glass', 'footed, heatproof glass mug'),
  ('mug', 'ceramic, for hot drinks')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS glass_id integer REFERENCES glassware (id),
  ADD COLUMN IF NOT EXISTS service_style text
    CHECK (service_style IN ('up', 'on the rocks', 'neat', 'hot')),
  ADD COLUMN IF NOT EXISTS alt_glass_id integer REFERENCES glassware (id),
  ADD COLUMN IF NOT EXISTS alt_service_style text
    CHECK (alt_service_style IN ('up', 'on the rocks', 'neat', 'hot')),
  ADD COLUMN IF NOT EXISTS glass_note text;

COMMENT ON COLUMN recipes.glass_id IS 'Recommended glass (display-only, not inventory).';
COMMENT ON COLUMN recipes.service_style IS 'How it is served: up, on the rocks, neat, or hot (display-only).';
COMMENT ON COLUMN recipes.alt_glass_id IS 'Alternate glass (display-only, not inventory).';
COMMENT ON COLUMN recipes.alt_service_style IS 'Service style when using the alternate glass (display-only).';
COMMENT ON COLUMN recipes.glass_note IS 'Short serving note, e.g. one large cube (display-only).';

DO $$
DECLARE
  r record;
  v_glass integer;
  v_alt integer;
  n integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('Gin Martini',             'martini',            'up',           'nick & nora',        'up',           NULL),
      ('Old Fashioned',           'double rocks',       'on the rocks', NULL,                 NULL,           'one large cube'),
      ('Winter Wonderland',       'coupe',              'up',           'double rocks',       'on the rocks', NULL),
      ('Pecan Pie Old Fashioned', 'double rocks',       'on the rocks', NULL,                 NULL,           'one large cube'),
      ('Black Cherry Manhattan',  'coupe',              'up',           'nick & nora',        'up',           NULL),
      ('Saratoga',                'coupe',              'up',           'nick & nora',        'up',           NULL),
      ('Revolver',                'coupe',              'up',           'nick & nora',        'up',           NULL),
      ('Winter Sidecar',          'coupe',              'up',           NULL,                 NULL,           'optional sugar rim'),
      ('Maple Rye Old Fashioned', 'double rocks',       'on the rocks', NULL,                 NULL,           'one large cube'),
      ('Hot Toddy',               'irish coffee glass', 'hot',          'mug',                'hot',          NULL),
      ('Cranberry Mulled Wine',   'mug',                'hot',          'irish coffee glass', 'hot',          NULL),
      ('Butter Pecan Hot Cider',  'mug',                'hot',          NULL,                 NULL,           NULL),
      ('Spiked Chai',             'mug',                'hot',          NULL,                 NULL,           NULL),
      ('Peppermint Cocoa',        'mug',                'hot',          NULL,                 NULL,           NULL),
      ('Nutty Irish Coffee',      'irish coffee glass', 'hot',          'mug',                'hot',          NULL)
    ) AS a (recipe, glass, service, alt_glass, alt_service, note)
  LOOP
    SELECT id INTO v_glass FROM glassware WHERE name = r.glass;
    IF v_glass IS NULL THEN
      RAISE EXCEPTION '010_glassware: unknown glass % for %', r.glass, r.recipe;
    END IF;
    v_alt := NULL;
    IF r.alt_glass IS NOT NULL THEN
      SELECT id INTO v_alt FROM glassware WHERE name = r.alt_glass;
      IF v_alt IS NULL THEN
        RAISE EXCEPTION '010_glassware: unknown alternate glass % for %', r.alt_glass, r.recipe;
      END IF;
    END IF;

    SELECT count(*) INTO n FROM recipes WHERE name = r.recipe;
    IF n <> 1 THEN
      RAISE EXCEPTION '010_glassware: recipe % matched % rows (expected 1)', r.recipe, n;
    END IF;

    -- Only write when something differs, so a re-run does not bump updated_at.
    UPDATE recipes
    SET glass_id = v_glass, service_style = r.service,
        alt_glass_id = v_alt, alt_service_style = r.alt_service,
        glass_note = r.note
    WHERE name = r.recipe
      AND (glass_id, service_style, alt_glass_id, alt_service_style, glass_note)
          IS DISTINCT FROM (v_glass, r.service, v_alt, r.alt_service, r.note);
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('010_glassware.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
