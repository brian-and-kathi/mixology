-- 035_tv_cast_wine: Show on TV for Cellar wines (Brian via Rachel, 2026-10-06).
-- tv_cast.item_type (015) allowed 'recipe' and 'pour'; it now also takes 'wine', a Cellar wine's product id
-- (menu_wines, not reserved). Pours keep 'pour': the type names the guest page and list the cast comes from
-- (/recipe, /pour, /wine), and the TV card is built per type (src/lib/cast.ts). Nothing else changes: still one
-- row, same 5-minute expiry, same Open/Closed rule. Writes to tv_cast already bump cast_version (028).
-- Safe for older app builds: they read a 'wine' row as a pour, find no such pour and show nothing.
-- Idempotent; one transaction; recorded once.
-- Undo (roll the app back first), in one transaction:
--   DELETE FROM tv_cast WHERE item_type = 'wine';
--   ALTER TABLE tv_cast DROP CONSTRAINT tv_cast_item_type_check;
--   ALTER TABLE tv_cast ADD CONSTRAINT tv_cast_item_type_check CHECK (item_type IN ('recipe', 'pour'));
--   DELETE FROM schema_migrations WHERE version = '035_tv_cast_wine.sql';
BEGIN;
SET LOCAL client_min_messages = warning;

ALTER TABLE tv_cast DROP CONSTRAINT IF EXISTS tv_cast_item_type_check;
ALTER TABLE tv_cast ADD CONSTRAINT tv_cast_item_type_check CHECK (item_type IN ('recipe', 'pour', 'wine'));

COMMENT ON TABLE tv_cast IS
  'At most one row: what the TV is showing (recipe id, or pour / Cellar wine product id) and when it expires. Display-only.';
COMMENT ON COLUMN tv_cast.item_type IS
  'recipe (recipes.id), pour (products.id on menu_neat) or wine (products.id on menu_wines; 035).';

INSERT INTO schema_migrations (version) VALUES ('035_tv_cast_wine.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
