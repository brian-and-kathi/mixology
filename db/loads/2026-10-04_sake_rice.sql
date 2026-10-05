-- Hakutsuru Sake's grape is 'Rice' (Brian via Rachel, 2026-10-04): the Cellar badge and category show "Rice" on
-- /menu, the TV and the wine page, and /menu's Other chip gets a Rice grape chip. products.grape is free display
-- text (031_wine_grape: trimmed, never blank), so no migration or allowed list is involved.
-- By id; only while grape is still NULL, so re-running never overwrites an edit. One statement: the 028 trigger
-- bumps menu_version once; run `npm run notify` afterwards.
-- Undo: UPDATE products SET grape = NULL WHERE id = '8c429872-f94c-4ad5-8467-b5a114f4ea4c' AND grape = 'Rice';
BEGIN;
UPDATE products SET grape = 'Rice'
 WHERE id = '8c429872-f94c-4ad5-8467-b5a114f4ea4c' AND display_name = 'Hakutsuru Sake' AND grape IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = '8c429872-f94c-4ad5-8467-b5a114f4ea4c' AND grape = 'Rice') THEN
    RAISE NOTICE 'sake rice: Hakutsuru Sake not updated (missing, renamed, or a grape is already set)';
  ELSE
    RAISE NOTICE 'sake rice: Hakutsuru Sake grape = Rice';
  END IF;
END $$;
COMMIT;
