-- 036_shopping_list: a free-text list on the admin menu (Brian, 2026-10-08).
-- Anything the bar needs that is not a bottle or a recipe ingredient: aluminum foil, napkins, limes.
-- shopping_items.label   what to buy, trimmed, never blank, at most 120 characters. Duplicates are allowed.
-- shopping_items.done     ticked off while shopping. A tick stays on the list until it is cleared or removed.
-- Not part of the recipe To Buy list, and not written to change_log (that log has no shopping entity).
-- Idempotent; one transaction; recorded once.
-- Undo, in one transaction:
--   DROP TABLE IF EXISTS shopping_items;
--   DELETE FROM schema_migrations WHERE version = '036_shopping_list.sql';
BEGIN;
SET LOCAL client_min_messages = warning;

CREATE TABLE IF NOT EXISTS shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopping_items_label_check CHECK (
    label = btrim(label)
    AND char_length(label) > 0
    AND char_length(label) <= 120
  )
);

COMMENT ON TABLE shopping_items IS
  'Admin free-text shopping list (036). Oldest first. A tick sets done; it does not delete the row.';
COMMENT ON COLUMN shopping_items.label IS
  'What to buy, trimmed, 1–120 characters. Not a spec or a product.';
COMMENT ON COLUMN shopping_items.done IS
  'Ticked off while shopping. Stays in place until removed or cleared.';

INSERT INTO schema_migrations (version) VALUES ('036_shopping_list.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
