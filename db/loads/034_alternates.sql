-- The 16 per-recipe alternates from Trinity's scan (mixology-review/alternates-scan/alternates.md), approved by Brian via
-- Rachel 2026-10-06, plus the recipe text they replace. Run with the alternates UI ship, not before: the guest UI
-- must show alternates before descriptions stop mentioning them, and newly makeable drinks (Pimm's Cup, Spanish
-- Coffee, Pimm's Sundowner) must show the in-stock alternate rather than the out-of-stock main ingredient.
-- Lines are found by recipe + position + current spec, never by line id. Rows that already exist are left alone
-- (db/loads/034_hot_toddy_cognac.sql shipped the first one). Each text edit applies only while the text is still
-- exactly the original, so re-running never overwrites a later edit. Run `npm run notify` afterwards.
-- Undo: mixology-review/alternates/undo.sql (sections 2 and 3), which also holds the original text.
BEGIN;
CREATE TEMP TABLE alt_load (recipe text, recipe_id uuid, line_position int, spec_id uuid, alt_spec_id uuid,
  position int, amount numeric, unit text, note text) ON COMMIT DROP;
INSERT INTO alt_load VALUES
  ('Hot Toddy', 'd3201f94-b26b-40a0-a511-677a4d6cc267'::uuid, 1, '320559c2-1a56-4579-9cc2-84dc8347a15f'::uuid, '3c7442f0-a45b-460b-99e3-ce22a8be2032'::uuid, 1, NULL::numeric, NULL, NULL),  -- bourbon -> cognac
  ('New York Sour', '8e606640-0444-4521-90aa-db1496f3108c'::uuid, 1, '131f1703-31d3-42f8-944a-2a02833b5a5e'::uuid, '320559c2-1a56-4579-9cc2-84dc8347a15f'::uuid, 1, NULL::numeric, NULL, NULL),  -- rye -> bourbon
  ('Pimm''s Cup', 'cd11aa75-ddfd-456b-8db1-08a18c433953'::uuid, 3, '31ad8303-0d0c-4c41-90ed-8a28fceaafce'::uuid, '7cdf8e8c-179d-4c9e-b64e-0bf45bcf4852'::uuid, 1, NULL::numeric, NULL, NULL),  -- ginger ale -> lemon lime soda
  ('Tequila Sunrise', '81f3ee02-f4d7-4c13-acec-213ef2ffba97'::uuid, 4, 'a6afe900-afab-407c-b216-7909e43f150f'::uuid, '2edf7ba9-bff5-42e9-a711-a4ea0b6dc948'::uuid, 1, NULL::numeric, NULL, NULL),  -- orange rind -> maraschino cherry
  ('Cranberry Mulled Wine', '97f9bba0-dc8e-42ab-8a28-5b0b6701ec65'::uuid, 6, '9888db80-0ac4-4f7e-a52b-8b2163c4f982'::uuid, '58bb41e5-a6fe-41a0-bfde-26468d08fea8'::uuid, 1, NULL::numeric, NULL, '2 sticks + 4 whole cloves per batch'),  -- mulling spices -> cinnamon stick
  ('Pimm''s Spritz', '8039df96-7c5d-406a-b1f4-36e22476d001'::uuid, 3, 'fae67163-1508-4181-8800-07c3ae0840d5'::uuid, 'b8954f51-9e4f-4fd4-8029-b304fad6c1d3'::uuid, 1, 0.5::numeric, 'oz', 'as in the original recipe'),  -- simple syrup (1:1) -> rich syrup (2:1)
  ('Old Fashioned', 'a2382991-0f84-4482-9781-57efac8b4062'::uuid, 1, '320559c2-1a56-4579-9cc2-84dc8347a15f'::uuid, '131f1703-31d3-42f8-944a-2a02833b5a5e'::uuid, 1, NULL::numeric, NULL, NULL),  -- bourbon -> rye
  ('Espresso Martini', 'dfee4e15-56d8-44df-a272-e8ab60cdbb5f'::uuid, 1, '2d352775-763e-4d9f-9584-0cd45f1bbd7c'::uuid, '26f39729-2ef7-455f-8304-3a41282834a1'::uuid, 1, NULL::numeric, NULL, NULL),  -- vodka -> vanilla vodka
  ('Whiskey Sour', 'cad9e768-d410-450d-9f3d-57e34ca00a15'::uuid, 1, '320559c2-1a56-4579-9cc2-84dc8347a15f'::uuid, '131f1703-31d3-42f8-944a-2a02833b5a5e'::uuid, 1, NULL::numeric, NULL, NULL),  -- bourbon -> rye
  ('Hot Toddy', 'd3201f94-b26b-40a0-a511-677a4d6cc267'::uuid, 1, '320559c2-1a56-4579-9cc2-84dc8347a15f'::uuid, '131f1703-31d3-42f8-944a-2a02833b5a5e'::uuid, 2, NULL::numeric, NULL, NULL),  -- bourbon -> rye
  ('Black Cherry Manhattan', '4fb070de-1e68-4ee5-832c-3eaf63ad2a39'::uuid, 1, '131f1703-31d3-42f8-944a-2a02833b5a5e'::uuid, '320559c2-1a56-4579-9cc2-84dc8347a15f'::uuid, 1, NULL::numeric, NULL, NULL),  -- rye -> bourbon
  ('Hazelnut Old Fashioned', 'a78d9f2f-d66e-42f4-8f17-4b052565d2b9'::uuid, 1, '320559c2-1a56-4579-9cc2-84dc8347a15f'::uuid, '131f1703-31d3-42f8-944a-2a02833b5a5e'::uuid, 1, NULL::numeric, NULL, NULL),  -- bourbon -> rye
  ('Godfather', '6bb2ba12-e7e6-4762-b2ed-93706d2bde2a'::uuid, 1, '320559c2-1a56-4579-9cc2-84dc8347a15f'::uuid, 'a6833670-1255-4ace-9e17-e6548cb9a90a'::uuid, 1, NULL::numeric, NULL, NULL),  -- bourbon -> scotch
  ('Spanish Coffee', 'fb6bd7dc-6151-4727-9e06-b2efb9d962ff'::uuid, 2, 'a1dd283c-1ebc-4f8f-aad4-aa9005cb9484'::uuid, 'eae31573-b9d6-48db-b1fc-dd56ce0904b5'::uuid, 1, NULL::numeric, NULL, 'Don Q 151 is the Huber''s original; flame with care'),  -- dark rum -> overproof rum
  ('Pimm''s Sundowner', 'e0c60430-d087-4517-9bfa-f93bb900df34'::uuid, 3, '99203250-079c-4127-97f1-8da00fbe0418'::uuid, 'a153f243-38e8-41e6-ad54-ed7c36ded151'::uuid, 1, NULL::numeric, NULL, NULL),  -- apple juice -> apple cider
  ('Pimm''s Sundowner', 'e0c60430-d087-4517-9bfa-f93bb900df34'::uuid, 4, '459589eb-e1ae-4e34-80d6-b6f92f7e30d0'::uuid, '7cdf8e8c-179d-4c9e-b64e-0bf45bcf4852'::uuid, 1, NULL::numeric, NULL, NULL);  -- lemonade -> lemon lime soda

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT a.recipe, a.line_position FROM alt_load a
            WHERE NOT EXISTS (SELECT 1 FROM recipe_lines l WHERE l.recipe_id = a.recipe_id
                                AND l.position = a.line_position AND l.spec_id = a.spec_id) LOOP
    RAISE NOTICE 'alternates: % line % no longer matches; skipped', r.recipe, r.line_position;
  END LOOP;
END $$;

INSERT INTO recipe_line_alternates (recipe_line_id, spec_id, position, amount, unit, note)
SELECT l.id, a.alt_spec_id, a.position, a.amount, a.unit, a.note
  FROM alt_load a
  JOIN recipe_lines l ON l.recipe_id = a.recipe_id AND l.position = a.line_position AND l.spec_id = a.spec_id
 WHERE NOT EXISTS (SELECT 1 FROM recipe_line_alternates x WHERE x.recipe_line_id = l.id AND x.position = a.position)
ON CONFLICT (recipe_line_id, spec_id) DO NOTHING;

-- Text the alternates replace (alternates.md "Text to remove or change once converted"), plus the two approved additions.
UPDATE recipes SET description = replace(description, ' Cognac works in place of bourbon.', '')
 WHERE id = 'd3201f94-b26b-40a0-a511-677a4d6cc267' AND description LIKE '%Serves 1. Cognac works in place of bourbon.';
UPDATE recipes SET description = replace(description, ' float; bourbon makes it rounder.', ' float.')
 WHERE id = '8e606640-0444-4521-90aa-db1496f3108c' AND description LIKE '%Harvester Cabernet float; bourbon makes it rounder.';
UPDATE recipes SET description = replace(description, ' Sparkling lemonade can replace the ginger ale and lemon juice.', '')
 WHERE id = 'cd11aa75-ddfd-456b-8db1-08a18c433953' AND description LIKE '%lemon or orange wheels. Sparkling lemonade can replace the ginger ale and lemon juice.';
UPDATE recipes SET description = description || ' Scotch is the classic.'
 WHERE id = '6bb2ba12-e7e6-4762-b2ed-93706d2bde2a' AND description LIKE '%Equal parts Bowright bourbon and Knight Gabriello amaretto.';
UPDATE recipe_lines SET note = NULL
 WHERE recipe_id = '81f3ee02-f4d7-4c13-acec-213ef2ffba97' AND position = 4
   AND spec_id = 'a6afe900-afab-407c-b216-7909e43f150f' AND note = 'or a maraschino cherry';
UPDATE recipe_lines SET note = '1 tbsp per batch'
 WHERE recipe_id = '97f9bba0-dc8e-42ab-8a28-5b0b6701ec65' AND position = 6
   AND spec_id = '9888db80-0ac4-4f7e-a52b-8b2163c4f982' AND note = '1 tbsp per batch, or 2 cinnamon sticks + 4 whole cloves';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM alt_load a JOIN recipe_lines l ON l.recipe_id = a.recipe_id AND l.position = a.line_position
    JOIN recipe_line_alternates x ON x.recipe_line_id = l.id AND x.spec_id = a.alt_spec_id;
  RAISE NOTICE 'alternates: % of 16 present', n;
END $$;
COMMIT;
