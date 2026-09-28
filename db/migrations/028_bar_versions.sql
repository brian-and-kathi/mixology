-- 028_bar_versions: the database says when the guest board or a cast pop-up may have changed,
-- so edits made directly in SQL reach the TV and phones too (DESIGN §4.6, "Database change signal").
--
-- bar_versions is one row with two counters:
--   menu_version  anything the TV board or the phone /menu shows (stock, names, badges, ABV, serve
--                 flags, ingredients and stand-ins, recipes and their lines and glass, ratings).
--   cast_version  anything a Show on TV pop-up shows. Every menu change counts, plus text that only the
--                 pop-up shows (products.description / serve_note / pairing_notes, recipe method text,
--                 glass notes).
-- Statement-level triggers bump them: one bump per statement, however many rows, and an UPDATE that
-- changes nothing (same values) bumps nothing. Neon has no pg_net / http, so a trigger can't call the
-- relay; the app's publish step (and `npm run notify` after direct SQL) calls claim_bar_versions() and
-- publishes whichever topics moved since the last publish.
-- Idempotent; one transaction; recorded once.
BEGIN;
SET LOCAL client_min_messages = warning;

CREATE TABLE IF NOT EXISTS bar_versions (
  id              smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  menu_version    bigint      NOT NULL DEFAULT 0,
  cast_version    bigint      NOT NULL DEFAULT 0,
  menu_published  bigint      NOT NULL DEFAULT 0,
  cast_published  bigint      NOT NULL DEFAULT 0,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz
);
INSERT INTO bar_versions (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE bar_versions IS
  'Change counters for the guest board (menu_version) and Show on TV pop-ups (cast_version), bumped by statement triggers. *_published is what the relay was last told (claim_bar_versions()).';

-- Bump: menu changes always bump cast too (a pop-up shows names, glass and ingredients as well).
CREATE OR REPLACE FUNCTION bump_bar_versions(p_menu boolean) RETURNS void
LANGUAGE sql SET search_path = public AS $$
  UPDATE bar_versions
     SET menu_version = menu_version + CASE WHEN p_menu THEN 1 ELSE 0 END,
         cast_version = cast_version + 1,
         changed_at = now()
   WHERE id = 1;
$$;

-- INSERT / DELETE: the board may have changed, if the statement touched any row. bar_rows is the
-- inserted or deleted rows (each trigger names its transition table that).
CREATE OR REPLACE FUNCTION bar_rows_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM bar_rows) THEN
    PERFORM bump_bar_versions(true);
  END IF;
  RETURN NULL;
END $$;

-- TRUNCATE has no transition table: always a change.
CREATE OR REPLACE FUNCTION bar_truncated() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM bump_bar_versions(true);
  RETURN NULL;
END $$;

-- UPDATE: compare the old and new rows as sets. TG_ARGV lists the columns only a pop-up or detail page
-- shows (updated_at is always ignored). Any other column moving bumps the menu; only those moving
-- bumps the cast alone; nothing moving (an UPDATE to the same values) bumps nothing.
CREATE OR REPLACE FUNCTION bar_rows_updated() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  detail text[] := TG_ARGV || ARRAY['updated_at'];
BEGIN
  IF EXISTS (SELECT to_jsonb(n) - detail FROM bar_new n EXCEPT ALL SELECT to_jsonb(o) - detail FROM bar_old o) THEN
    PERFORM bump_bar_versions(true);
  ELSIF EXISTS (SELECT to_jsonb(n) - 'updated_at' FROM bar_new n EXCEPT ALL SELECT to_jsonb(o) - 'updated_at' FROM bar_old o) THEN
    PERFORM bump_bar_versions(false);
  END IF;
  RETURN NULL;
END $$;

-- Everything the board reads (menu_neat, menu_mixed, menu_wines / is_cellar_wine(), recipe lines and
-- stand-ins, loadMenu()'s family grouping, ratings). The array is the pop-up-only columns per table.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('products',           ARRAY['description', 'serve_note', 'pairing_notes', 'decanting']),
      ('product_specs',      ARRAY[]::text[]),
      ('specs',              ARRAY['description']),
      ('spec_families',      ARRAY[]::text[]),
      ('families',           ARRAY[]::text[]),
      ('spec_substitutions', ARRAY[]::text[]),
      ('recipes',            ARRAY['description', 'method_style', 'glass_note', 'service_style', 'alt_glass_id', 'alt_service_style']),
      ('recipe_lines',       ARRAY[]::text[]),
      ('glassware',          ARRAY['description']),
      ('drink_ratings',      ARRAY[]::text[])
    ) AS v(tbl, detail)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t.tbl || '_bar_inserted', t.tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t.tbl || '_bar_deleted', t.tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t.tbl || '_bar_truncated', t.tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t.tbl || '_bar_updated', t.tbl);
    -- (Postgres allows a transition table only on a single-event trigger, hence one trigger per event.)
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON %I REFERENCING NEW TABLE AS bar_rows FOR EACH STATEMENT EXECUTE FUNCTION bar_rows_changed()',
                   t.tbl || '_bar_inserted', t.tbl);
    EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON %I REFERENCING OLD TABLE AS bar_rows FOR EACH STATEMENT EXECUTE FUNCTION bar_rows_changed()',
                   t.tbl || '_bar_deleted', t.tbl);
    EXECUTE format('CREATE TRIGGER %I AFTER TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION bar_truncated()',
                   t.tbl || '_bar_truncated', t.tbl);
    EXECUTE format('CREATE TRIGGER %I AFTER UPDATE ON %I REFERENCING OLD TABLE AS bar_old NEW TABLE AS bar_new FOR EACH STATEMENT EXECUTE FUNCTION bar_rows_updated(%s)',
                   t.tbl || '_bar_updated', t.tbl,
                   COALESCE((SELECT string_agg(quote_literal(c), ', ') FROM unnest(t.detail) AS c), ''));
  END LOOP;
END $$;

-- The publish step: mark the current versions as published and say which topics moved since the last
-- publish. Row-locked, so two callers never both publish the same change. Cheap enough for the
-- fallback poll: one row, and it only writes when something moved.
CREATE OR REPLACE FUNCTION claim_bar_versions(
  OUT menu_version bigint, OUT cast_version bigint, OUT menu_changed boolean, OUT cast_changed boolean)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  b bar_versions;
BEGIN
  SELECT * INTO b FROM bar_versions WHERE id = 1 FOR UPDATE;
  menu_version := b.menu_version;
  cast_version := b.cast_version;
  menu_changed := b.menu_version <> b.menu_published;
  cast_changed := b.cast_version <> b.cast_published;
  IF menu_changed OR cast_changed THEN
    UPDATE bar_versions SET menu_published = b.menu_version, cast_published = b.cast_version, published_at = now()
     WHERE id = 1;
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('028_bar_versions.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
