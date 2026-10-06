-- Hot Toddy: Cognac as an alternate for its bourbon line (Brian via Rachel, 2026-10-06), shipped with migration 034.
-- The recipe's description already says "Cognac works in place of bourbon."; that sentence stays until the alternates
-- UI ships (db/loads/034_alternates.sql removes it). The line is found by recipe + position + spec, never by line id
-- (admin saves re-insert lines). Skipped while no bourbon bottle is in stock, so this alone never puts a drink on the
-- menu with an out-of-stock main ingredient. Re-running is harmless. Run `npm run notify` afterwards.
-- Undo: DELETE FROM recipe_line_alternates a USING recipe_lines l WHERE a.recipe_line_id = l.id
--   AND l.recipe_id = 'd3201f94-b26b-40a0-a511-677a4d6cc267' AND a.spec_id = '3c7442f0-a45b-460b-99e3-ce22a8be2032';
BEGIN;
INSERT INTO recipe_line_alternates (recipe_line_id, spec_id, position)
SELECT l.id, '3c7442f0-a45b-460b-99e3-ce22a8be2032', 1
  FROM recipe_lines l
 WHERE l.recipe_id = 'd3201f94-b26b-40a0-a511-677a4d6cc267' AND l.position = 1
   AND l.spec_id = '320559c2-1a56-4579-9cc2-84dc8347a15f'
   AND EXISTS (SELECT 1 FROM product_specs ps JOIN products p ON p.id = ps.product_id
                WHERE ps.spec_id = '320559c2-1a56-4579-9cc2-84dc8347a15f' AND p.in_stock)
ON CONFLICT (recipe_line_id, spec_id) DO NOTHING;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM recipe_line_alternates a JOIN recipe_lines l ON l.id = a.recipe_line_id
              WHERE l.recipe_id = 'd3201f94-b26b-40a0-a511-677a4d6cc267'
                AND a.spec_id = '3c7442f0-a45b-460b-99e3-ce22a8be2032') THEN
    RAISE NOTICE 'hot toddy cognac: alternate present';
  ELSE
    RAISE NOTICE 'hot toddy cognac: NOT added (line 1 is not bourbon, or no bourbon is in stock)';
  END IF;
END $$;
COMMIT;
