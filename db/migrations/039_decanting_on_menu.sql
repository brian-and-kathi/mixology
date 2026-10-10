-- 039_decanting_on_menu: the TV board shows when a spec's bottle is in a decanter (Brian, 2026-10-10).
-- 028 listed products.decanting as pop-up-only, so changing it bumped cast_version and not menu_version.
-- The board now reads it, so an update bumps the menu (and the cast, as every menu change does).
-- Idempotent; one transaction; recorded once.
-- Undo, in one transaction:
--   DROP TRIGGER IF EXISTS products_bar_updated ON products;
--   CREATE TRIGGER products_bar_updated AFTER UPDATE ON products
--     REFERENCING OLD TABLE AS bar_old NEW TABLE AS bar_new
--     FOR EACH STATEMENT EXECUTE FUNCTION bar_rows_updated('description', 'serve_note', 'pairing_notes', 'decanting');
--   DELETE FROM schema_migrations WHERE version = '039_decanting_on_menu.sql';
BEGIN;
SET LOCAL client_min_messages = warning;

DROP TRIGGER IF EXISTS products_bar_updated ON products;
CREATE TRIGGER products_bar_updated
  AFTER UPDATE ON products
  REFERENCING OLD TABLE AS bar_old NEW TABLE AS bar_new
  FOR EACH STATEMENT
  EXECUTE FUNCTION bar_rows_updated('description', 'serve_note', 'pairing_notes');

INSERT INTO schema_migrations (version) VALUES ('039_decanting_on_menu.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
