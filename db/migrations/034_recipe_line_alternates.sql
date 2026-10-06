-- 034_recipe_line_alternates: drink-specific alternates for a recipe line (Brian via Rachel, 2026-10-06).
-- spec_substitutions (014/021) is GLOBAL: a stand-in counts in every recipe. Some swaps are right for one drink
-- only (cognac for bourbon in a Hot Toddy, wrong in a Boulevardier or a Paper Plane), so a recipe line can now list
-- up to 3 alternates of its own:
--   recipe_line_alternates  one row per alternate: the line, the alternate ingredient (spec), its position
--                           (1 = first choice; the order guests are offered them), an optional amount/unit override
--                           (both NULL = the line's own amount; same shape rule as recipe_lines), an optional note.
--                           No repeats on a line, never the line's own ingredient (deferred constraint triggers on
--                           both tables, so "make main" can swap the two inside one transaction), at most 3
--                           (position 1..3, unique per line, deferrable for reordering).
--   recipe_line_options     view: every line's choices, the line's own ingredient as rank 0, then its alternates.
-- Makeability: a line is satisfied when ANY of its choices is available (available_spec_ids(), which already
-- follows global substitutions, so a stand-in for an alternate counts too). Updated to match, columns unchanged:
--   recipe_is_makeable(), menu_mixed (buildable; reserved = some required line has no FREE choice, i.e. no
--   in-stock non-reserved bottle behind its own ingredient or any alternate; reserved_note from the reserved bottles
--   behind such a line's choices), recipe_line_status (available = the line is satisfied; status keeps the line's
--   own reason when it isn't; + own_available, lead_spec_id at the end), featured_recipe_ids() (looks at the
--   choice a guest is offered: the first choice, in rank order, with a free bottle on the shelf; no alternates =
--   exactly as before).
-- Backward compatible: every view keeps its columns in place (new ones last), function signatures are unchanged,
-- and with no alternate rows every result is identical to 033.
-- Change signal: the 028 statement triggers on the new table, so adding, moving or removing an alternate bumps
-- menu_version and cast_version like any other recipe edit.
-- Idempotent; one transaction; recorded once.
-- Undo: /workspace/mixology-review/alternates/undo.sql (restores the 033 definitions, drops the view and table,
--   removes the schema_migrations row). Roll the app back first. Or restore main from pre-alternates-2026-10-06.
BEGIN;
SET LOCAL client_min_messages = warning;

CREATE TABLE IF NOT EXISTS recipe_line_alternates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_line_id uuid NOT NULL REFERENCES recipe_lines(id) ON DELETE CASCADE,
  spec_id        uuid NOT NULL REFERENCES specs(id) ON DELETE RESTRICT,
  position       integer NOT NULL CHECK (position BETWEEN 1 AND 3),
  amount         numeric(10,3),
  unit           text,
  note           text CHECK (note IS NULL OR char_length(btrim(note)) > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_line_alternates_amount_check CHECK (
       (amount IS NULL AND unit IS NULL)
    OR (amount IS NULL AND unit = ANY (ARRAY['top', 'rinse']))
    OR (amount IS NOT NULL AND amount > 0 AND unit IS NOT NULL AND char_length(btrim(unit)) > 0 AND unit <> ALL (ARRAY['top', 'rinse']))),
  CONSTRAINT recipe_line_alternates_spec_uq UNIQUE (recipe_line_id, spec_id),
  CONSTRAINT recipe_line_alternates_position_uq UNIQUE (recipe_line_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS recipe_line_alternates_spec_idx ON recipe_line_alternates (spec_id);

COMMENT ON TABLE recipe_line_alternates IS
  'Drink-specific alternates for one recipe line (034): any one of the line''s ingredient or these satisfies it. Global stand-ins stay in spec_substitutions.';
COMMENT ON COLUMN recipe_line_alternates.position IS 'Guest priority, 1..3 (1 = offered first when the line''s own ingredient is out).';
COMMENT ON COLUMN recipe_line_alternates.amount IS 'Optional override; NULL with unit NULL = the line''s own amount and unit.';

-- Never the line's own ingredient. Checked at commit, from both sides, so swapping the line's ingredient with an
-- alternate ("make main") works inside one transaction.
CREATE OR REPLACE FUNCTION recipe_line_alternate_not_self() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'recipe_line_alternates' THEN
    IF EXISTS (SELECT 1 FROM recipe_line_alternates a JOIN recipe_lines rl ON rl.id = a.recipe_line_id
                WHERE a.id = NEW.id AND a.spec_id = rl.spec_id) THEN
      RAISE EXCEPTION 'an alternate cannot be the line''s own ingredient' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM recipe_line_alternates a JOIN recipe_lines rl ON rl.id = a.recipe_line_id
                 WHERE rl.id = NEW.id AND a.spec_id = rl.spec_id) THEN
    RAISE EXCEPTION 'an alternate cannot be the line''s own ingredient' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS recipe_line_alternates_not_self ON recipe_line_alternates;
CREATE CONSTRAINT TRIGGER recipe_line_alternates_not_self AFTER INSERT OR UPDATE OF spec_id, recipe_line_id ON recipe_line_alternates
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION recipe_line_alternate_not_self();
DROP TRIGGER IF EXISTS recipe_lines_alternates_not_self ON recipe_lines;
CREATE CONSTRAINT TRIGGER recipe_lines_alternates_not_self AFTER UPDATE OF spec_id ON recipe_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION recipe_line_alternate_not_self();

-- Change signal (028): any change to alternates is a menu change.
DROP TRIGGER IF EXISTS recipe_line_alternates_bar_inserted ON recipe_line_alternates;
CREATE TRIGGER recipe_line_alternates_bar_inserted AFTER INSERT ON recipe_line_alternates
  REFERENCING NEW TABLE AS bar_rows FOR EACH STATEMENT EXECUTE FUNCTION bar_rows_changed();
DROP TRIGGER IF EXISTS recipe_line_alternates_bar_deleted ON recipe_line_alternates;
CREATE TRIGGER recipe_line_alternates_bar_deleted AFTER DELETE ON recipe_line_alternates
  REFERENCING OLD TABLE AS bar_rows FOR EACH STATEMENT EXECUTE FUNCTION bar_rows_changed();
DROP TRIGGER IF EXISTS recipe_line_alternates_bar_updated ON recipe_line_alternates;
CREATE TRIGGER recipe_line_alternates_bar_updated AFTER UPDATE ON recipe_line_alternates
  REFERENCING OLD TABLE AS bar_old NEW TABLE AS bar_new FOR EACH STATEMENT EXECUTE FUNCTION bar_rows_updated();
DROP TRIGGER IF EXISTS recipe_line_alternates_bar_truncated ON recipe_line_alternates;
CREATE TRIGGER recipe_line_alternates_bar_truncated AFTER TRUNCATE ON recipe_line_alternates
  FOR EACH STATEMENT EXECUTE FUNCTION bar_truncated();

CREATE OR REPLACE VIEW recipe_line_options AS
  SELECT rl.id AS recipe_line_id, rl.recipe_id, rl.position AS line_position, rl.spec_id, 0 AS rank
    FROM recipe_lines rl
  UNION ALL
  SELECT a.recipe_line_id, rl.recipe_id, rl.position, a.spec_id, a.position
    FROM recipe_line_alternates a JOIN recipe_lines rl ON rl.id = a.recipe_line_id;
COMMENT ON VIEW recipe_line_options IS
  'Every recipe line''s choices (034): its own ingredient as rank 0, then its alternates by position. A line is satisfied when any choice is.';

CREATE OR REPLACE FUNCTION recipe_is_makeable(p_recipe_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM recipes r WHERE r.id = p_recipe_id)
    AND NOT EXISTS (
      SELECT 1
      FROM recipe_lines rl
      WHERE rl.recipe_id = p_recipe_id
        AND rl.required
        AND NOT EXISTS (
          SELECT 1 FROM recipe_line_options o JOIN available_spec_ids() a ON a.spec_id = o.spec_id
           WHERE o.recipe_line_id = rl.id
        )
    );
$$;

CREATE OR REPLACE VIEW menu_mixed AS
 WITH avail AS MATERIALIZED (
         SELECT available_spec_ids.spec_id FROM available_spec_ids() available_spec_ids(spec_id)
        ), free AS MATERIALIZED (
         SELECT free_spec_ids.spec_id FROM free_spec_ids() free_spec_ids(spec_id)
        ), unfree AS MATERIALIZED (
         -- Required lines with no free choice (own ingredient or alternate): built only with a reserved bottle.
         SELECT rl.id, rl.recipe_id FROM recipe_lines rl
          WHERE rl.required AND NOT EXISTS (SELECT 1 FROM recipe_line_options o JOIN free f ON f.spec_id = o.spec_id
                                             WHERE o.recipe_line_id = rl.id)
        )
 SELECT r.id,
    r.name,
    r.description,
    r.rating,
    r.section,
    (EXISTS (SELECT 1 FROM unfree u WHERE u.recipe_id = r.id)) AS reserved,
    (SELECT p.reserved_note
       FROM unfree u
       JOIN recipe_line_options o ON o.recipe_line_id = u.id
       JOIN spec_supply() x(spec_id, source_spec_id, hops, product_id) ON x.spec_id = o.spec_id
       JOIN products p ON p.id = x.product_id
      WHERE u.recipe_id = r.id AND p.reserved AND p.reserved_note IS NOT NULL
      ORDER BY (lower(p.display_name))
     LIMIT 1) AS reserved_note
   FROM recipes r
  WHERE r.section = 'mixed'::text AND NOT (EXISTS (
          SELECT 1 FROM recipe_lines rl
           WHERE rl.recipe_id = r.id AND rl.required
             AND NOT (EXISTS (SELECT 1 FROM recipe_line_options o JOIN avail a ON a.spec_id = o.spec_id
                               WHERE o.recipe_line_id = rl.id))));

CREATE OR REPLACE VIEW recipe_line_status AS
 WITH avail AS MATERIALIZED (
         SELECT available_spec_ids.spec_id FROM available_spec_ids() available_spec_ids(spec_id)
        ), free_shelf AS MATERIALIZED (
         SELECT sp.id FROM specs sp
          WHERE sp.always_available
             OR EXISTS (SELECT 1 FROM product_specs ps JOIN products p ON p.id = ps.product_id
                         WHERE ps.spec_id = sp.id AND p.in_stock AND NOT p.reserved)
        )
 SELECT rl.recipe_id,
    rl."position",
    rl.spec_id,
    s.canonical_name AS spec_name,
    rl.required,
    (a.spec_id IS NOT NULL OR EXISTS (SELECT 1 FROM recipe_line_alternates x JOIN avail ax ON ax.spec_id = x.spec_id
                                       WHERE x.recipe_line_id = rl.id)) AS available,
        CASE
            WHEN a.spec_id IS NOT NULL OR EXISTS (SELECT 1 FROM recipe_line_alternates x JOIN avail ax ON ax.spec_id = x.spec_id
                                                   WHERE x.recipe_line_id = rl.id) THEN 'available'::text
            WHEN (EXISTS (SELECT 1 FROM product_specs ps WHERE ps.spec_id = rl.spec_id)) THEN 'out_of_stock'::text
            ELSE 'no_product'::text
        END AS status,
    (a.spec_id IS NOT NULL) AS own_available,
    -- The choice a guest is offered: the first (own ingredient, then alternates by position) with a free bottle on
    -- the shelf; else the first that is available at all (e.g. via a global stand-in); NULL when none is.
    COALESCE(
      (SELECT o.spec_id FROM recipe_line_options o JOIN free_shelf f ON f.id = o.spec_id
        WHERE o.recipe_line_id = rl.id ORDER BY o.rank LIMIT 1),
      (SELECT o.spec_id FROM recipe_line_options o JOIN avail ao ON ao.spec_id = o.spec_id
        WHERE o.recipe_line_id = rl.id ORDER BY o.rank LIMIT 1)) AS lead_spec_id
   FROM recipe_lines rl
     JOIN specs s ON s.id = rl.spec_id
     LEFT JOIN avail a ON a.spec_id = rl.spec_id;

-- Featured (030): a recipe is featured when the bottle a guest is offered for a required line is featured. With
-- no alternates the offered choice is the line's own ingredient, exactly as before.
CREATE OR REPLACE FUNCTION featured_recipe_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH free_shelf AS (
    SELECT sp.id FROM specs sp
     WHERE sp.always_available
        OR EXISTS (SELECT 1 FROM product_specs ps JOIN products p ON p.id = ps.product_id
                    WHERE ps.spec_id = sp.id AND p.in_stock AND NOT p.reserved)),
  lead AS (
    SELECT rl.recipe_id,
           COALESCE((SELECT o.spec_id FROM recipe_line_options o JOIN free_shelf f ON f.id = o.spec_id
                      WHERE o.recipe_line_id = rl.id ORDER BY o.rank LIMIT 1), rl.spec_id) AS spec_id
      FROM recipe_lines rl
     WHERE rl.required)
  SELECT DISTINCT l.recipe_id
    FROM lead l
    JOIN product_specs ps ON ps.spec_id = l.spec_id
    JOIN products p ON p.id = ps.product_id
   WHERE p.featured AND p.in_stock;
$$;

INSERT INTO schema_migrations (version) VALUES ('034_recipe_line_alternates.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
