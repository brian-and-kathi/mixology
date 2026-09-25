-- Acceptance checks from home-bar-domain-spec.md section 12.
-- Inserts are rolled back. Safe to re-run after real inventory exists,
-- because fixtures use their own specs and UPCs.

BEGIN;
SET statement_timeout = '10s';

-- 1. Cleaning a lookup title does not create a brand spec.
DO $$
DECLARE
  v_before integer;
  v_after integer;
  v_product uuid;
  v_spec uuid;
BEGIN
  SELECT count(*) INTO v_before FROM specs;
  v_product := create_product_from_lookup(
    p_title => 'Bacardi Genuine Spiced Rum 750ml',
    p_source => 'acceptance',
    p_raw => '{"title":"Bacardi Genuine Spiced Rum 750ml"}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000001',
    p_brand => 'Bacardi',
    p_size_text => '750 ml',
    p_net_contents_amount => 750,
    p_net_contents_unit => 'ml',
    p_family_id => (SELECT id FROM families WHERE slug = 'rum')
  );
  UPDATE products
  SET display_name = 'Bacardi Spiced Rum',
      net_contents_amount = NULL,
      net_contents_unit = NULL
  WHERE id = v_product;
  UPDATE products
  SET net_contents_amount = 750, net_contents_unit = 'ml'
  WHERE id = v_product;

  SELECT count(*) INTO v_after FROM specs;
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'check 1 failed: lookup cleanup created a spec';
  END IF;
  IF EXISTS (
    SELECT 1 FROM specs
    WHERE lower(canonical_name) = 'bacardi spiced rum'
  ) THEN
    RAISE EXCEPTION 'check 1 failed: Bacardi Spiced Rum was stored as a spec';
  END IF;

  SELECT id INTO v_spec FROM specs WHERE slug = 'spiced-rum';
  PERFORM link_product_spec(v_product, v_spec, true);
  IF NOT EXISTS (
    SELECT 1 FROM product_specs
    WHERE product_id = v_product AND spec_id = v_spec
  ) THEN
    RAISE EXCEPTION 'check 1 failed: product is not linked to spiced rum';
  END IF;
  IF (SELECT display_name FROM products WHERE id = v_product) <> 'Bacardi Spiced Rum' THEN
    RAISE EXCEPTION 'check 1 failed: display name was not kept';
  END IF;
  IF (SELECT packaged_name FROM products WHERE id = v_product)
       <> 'Bacardi Genuine Spiced Rum 750ml' THEN
    RAISE EXCEPTION 'check 1 failed: packaged name lost the lookup title';
  END IF;
  RAISE NOTICE 'check 1 passed';
END $$;

-- 2. Vanilla vodka does not satisfy vodka unless a substitution says so.
DO $$
DECLARE
  v_vanilla uuid;
  v_vodka uuid;
  v_product uuid;
  v_recipe uuid;
BEGIN
  v_vanilla := create_spec('acc-vanilla-vodka', 'Acc vanilla vodka', 'vodka',
    p_flavoring => 'vanilla', p_as_neat => true);
  v_vodka := create_spec('acc-vodka', 'Acc vodka', 'vodka', p_as_neat => true);
  v_product := create_product_from_lookup(
    p_title => 'Acc vanilla vodka',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000002'
  );
  PERFORM link_product_spec(v_product, v_vanilla, true);

  IF EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_vodka) THEN
    RAISE EXCEPTION 'check 2 failed: vodka spec is available with no substitution';
  END IF;

  INSERT INTO recipes (name, section)
  VALUES ('Acc vodka soda', 'mixed')
  RETURNING id INTO v_recipe;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required, role)
  VALUES (v_recipe, v_vodka, 1, true, 'base');

  IF recipe_is_makeable(v_recipe)
     OR EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_recipe) THEN
    RAISE EXCEPTION 'check 2 failed: vanilla vodka made a vodka recipe';
  END IF;

  PERFORM add_substitution(v_vanilla, v_vodka, 'acceptance');
  IF NOT recipe_is_makeable(v_recipe)
     OR NOT EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_recipe) THEN
    RAISE EXCEPTION 'check 2 failed: a substitution did not unlock the vodka recipe';
  END IF;

  DELETE FROM spec_substitutions
  WHERE source_spec_id = v_vanilla AND target_spec_id = v_vodka;
  IF EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_vodka) THEN
    RAISE EXCEPTION 'check 2 failed: vodka stayed available after the rule was removed';
  END IF;

  -- Directed cycle must finish, and both specs become available from one bottle.
  PERFORM add_substitution(v_vanilla, v_vodka, NULL);
  PERFORM add_substitution(v_vodka, v_vanilla, NULL);
  IF NOT EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_vodka) THEN
    RAISE EXCEPTION 'check 2 failed: substitution cycle did not resolve';
  END IF;
  RAISE NOTICE 'check 2 passed';
END $$;

-- 3. Bourbon in stock does not satisfy Scotch.
DO $$
DECLARE
  v_bourbon uuid;
  v_scotch uuid;
  v_product uuid;
BEGIN
  v_bourbon := create_spec('acc-bourbon', 'Acc bourbon', 'whiskey', p_as_neat => true);
  v_scotch := create_spec('acc-scotch', 'Acc scotch', 'whiskey', p_as_neat => true);
  v_product := create_product_from_lookup(
    p_title => 'Acc bourbon',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000003'
  );
  PERFORM link_product_spec(v_product, v_bourbon, true);

  IF NOT EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_bourbon) THEN
    RAISE EXCEPTION 'check 3 failed: bourbon spec is not available';
  END IF;
  IF EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_scotch) THEN
    RAISE EXCEPTION 'check 3 failed: bourbon satisfied scotch';
  END IF;
  IF (SELECT id FROM specs WHERE slug = 'bourbon')
       = (SELECT id FROM specs WHERE slug = 'scotch') THEN
    RAISE EXCEPTION 'check 3 failed: seed collapsed bourbon and scotch';
  END IF;
  RAISE NOTICE 'check 3 passed';
END $$;

-- 4. Whiskey and whisky are one family.
DO $$
DECLARE
  v_family uuid;
BEGIN
  v_family := family_id_by_name('Whiskey');
  IF v_family IS NULL
     OR v_family IS DISTINCT FROM family_id_by_name('whisky')
     OR v_family IS DISTINCT FROM family_id_by_name('WHISKY')
     OR v_family IS DISTINCT FROM (SELECT id FROM families WHERE slug = 'whiskey') THEN
    RAISE EXCEPTION 'check 4 failed: whiskey and whisky did not resolve to one family';
  END IF;
  IF spec_id_by_name('whisky') IS DISTINCT FROM (SELECT id FROM specs WHERE slug = 'whiskey') THEN
    RAISE EXCEPTION 'check 4 failed: whisky did not resolve to the generic whiskey spec';
  END IF;
  IF (SELECT count(*) FROM families WHERE kind = 'spirit' AND slug IN ('whiskey', 'whisky')) <> 1 THEN
    RAISE EXCEPTION 'check 4 failed: spelling was stored as two families';
  END IF;
  RAISE NOTICE 'check 4 passed';
END $$;

-- 5. Limes in stock make juice, wedge, and wheel available.
DO $$
DECLARE
  v_juice uuid;
  v_wedge uuid;
  v_wheel uuid;
  v_product uuid;
BEGIN
  v_juice := create_spec('acc-lime-juice', 'Acc lime juice', 'citrus');
  v_wedge := create_spec('acc-lime-wedge', 'Acc lime wedge', 'citrus');
  v_wheel := create_spec('acc-lime-wheel', 'Acc lime wheel', 'citrus');
  v_product := create_product_from_lookup(
    p_title => 'Acc limes',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000005',
    p_family_id => (SELECT id FROM families WHERE slug = 'citrus')
  );
  PERFORM link_product_spec(v_product, v_juice, true);
  PERFORM link_product_spec(v_product, v_wedge, false);
  PERFORM link_product_spec(v_product, v_wheel, false);

  IF EXISTS (
    SELECT 1
    FROM (VALUES (v_juice), (v_wedge), (v_wheel)) AS need (spec_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = need.spec_id
    )
  ) THEN
    RAISE EXCEPTION 'check 5 failed: an in-stock lime did not cover every lime spec';
  END IF;

  UPDATE products SET in_stock = false WHERE id = v_product;
  IF EXISTS (
    SELECT 1 FROM available_spec_ids() a
    WHERE a.spec_id IN (v_juice, v_wedge, v_wheel)
  ) THEN
    RAISE EXCEPTION 'check 5 failed: lime specs stayed available with the product out';
  END IF;
  RAISE NOTICE 'check 5 passed';
END $$;

-- 6. Ice is always available and never blocks a recipe.
DO $$
DECLARE
  v_ice uuid;
  v_missing uuid;
  v_only_ice uuid;
  v_blocked uuid;
  v_product uuid;
BEGIN
  SELECT id INTO v_ice FROM specs WHERE slug = 'ice';
  IF NOT (SELECT always_available FROM specs WHERE id = v_ice) THEN
    RAISE EXCEPTION 'check 6 failed: ice is not always available';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_ice) THEN
    RAISE EXCEPTION 'check 6 failed: ice spec is unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM available_spec_ids() a
    JOIN specs s ON s.id = a.spec_id
    WHERE s.slug = 'water'
  ) THEN
    RAISE EXCEPTION 'check 6 failed: water spec is unavailable';
  END IF;

  v_product := create_product_from_lookup(
    p_title => 'Acc ice tray',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => false,
    p_upc => '999000000006'
  );
  PERFORM link_product_spec(v_product, v_ice, true);
  IF NOT EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_ice) THEN
    RAISE EXCEPTION 'check 6 failed: an out-of-stock ice product blocked the ice spec';
  END IF;
  IF EXISTS (SELECT 1 FROM menu_neat WHERE id = v_product)
     OR EXISTS (SELECT 1 FROM menu_wines WHERE id = v_product) THEN
    RAISE EXCEPTION 'check 6 failed: out-of-stock ice appeared on a bottle menu';
  END IF;

  INSERT INTO recipes (name) VALUES ('Acc ice water') RETURNING id INTO v_only_ice;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required)
  VALUES
    (v_only_ice, v_ice, 1, true),
    (v_only_ice, (SELECT id FROM specs WHERE slug = 'water'), 2, true);
  IF NOT recipe_is_makeable(v_only_ice)
     OR NOT EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_only_ice) THEN
    RAISE EXCEPTION 'check 6 failed: ice and water blocked a recipe';
  END IF;

  v_missing := create_spec('acc-missing-base', 'Acc missing base', 'vodka');
  INSERT INTO recipes (name) VALUES ('Acc blocked by base') RETURNING id INTO v_blocked;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required) VALUES
    (v_blocked, v_ice, 1, true),
    (v_blocked, v_missing, 2, true);
  IF recipe_is_makeable(v_blocked)
     OR EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_blocked) THEN
    RAISE EXCEPTION 'check 6 failed: ice made a missing base available';
  END IF;
  RAISE NOTICE 'check 6 passed';
END $$;

-- 7. A missing required spec hides the drink. A missing optional garnish does not.
DO $$
DECLARE
  v_base uuid;
  v_garnish uuid;
  v_product uuid;
  v_shown uuid;
  v_hidden uuid;
BEGIN
  v_base := create_spec('acc-gin', 'Acc gin', 'gin', p_as_neat => true);
  v_garnish := create_spec('acc-lime-wheel-opt', 'Acc lime wheel opt', 'citrus');
  v_product := create_product_from_lookup(
    p_title => 'Acc gin bottle',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000007'
  );
  PERFORM link_product_spec(v_product, v_base, true);

  INSERT INTO recipes (name) VALUES ('Acc gin with optional wheel') RETURNING id INTO v_shown;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required, role) VALUES
    (v_shown, v_base, 1, true, 'base'),
    (v_shown, v_garnish, 2, false, 'garnish');

  INSERT INTO recipes (name) VALUES ('Acc required wheel') RETURNING id INTO v_hidden;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required, role) VALUES
    (v_hidden, v_base, 1, true, 'base'),
    (v_hidden, v_garnish, 2, true, 'garnish');

  IF NOT EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_shown) THEN
    RAISE EXCEPTION 'check 7 failed: optional garnish hid the drink';
  END IF;
  IF EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_hidden) THEN
    RAISE EXCEPTION 'check 7 failed: missing required garnish still showed the drink';
  END IF;

  UPDATE products SET in_stock = false WHERE id = v_product;
  IF EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_shown) THEN
    RAISE EXCEPTION 'check 7 failed: drink stayed visible after its base went out';
  END IF;
  RAISE NOTICE 'check 7 passed';
END $$;

-- 8. Two sizes are two products and can satisfy one spec.
DO $$
DECLARE
  v_spec uuid;
  v_small uuid;
  v_large uuid;
BEGIN
  v_spec := create_spec('acc-spiced-rum', 'Acc spiced rum', 'rum', p_as_neat => true);
  v_small := create_product_from_lookup(
    p_title => 'Acc spiced rum 375',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000008',
    p_net_contents_amount => 375,
    p_net_contents_unit => 'ml'
  );
  v_large := create_product_from_lookup(
    p_title => 'Acc spiced rum 750',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => false,
    p_upc => '999000000009',
    p_net_contents_amount => 750,
    p_net_contents_unit => 'ml'
  );
  IF v_small = v_large THEN
    RAISE EXCEPTION 'check 8 failed: two UPCs became one product';
  END IF;
  PERFORM link_product_spec(v_small, v_spec, true);
  PERFORM link_product_spec(v_large, v_spec, true);
  IF (
    SELECT count(*) FROM product_specs WHERE spec_id = v_spec
  ) <> 2 THEN
    RAISE EXCEPTION 'check 8 failed: both sizes do not satisfy the spec';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_spec) THEN
    RAISE EXCEPTION 'check 8 failed: in-stock size did not make the spec available';
  END IF;
  UPDATE products SET in_stock = false WHERE id = v_small;
  UPDATE products SET in_stock = true WHERE id = v_large;
  IF NOT EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_spec) THEN
    RAISE EXCEPTION 'check 8 failed: the other size did not keep the spec available';
  END IF;
  RAISE NOTICE 'check 8 passed';
END $$;

-- 9. A later lookup must not erase cleaned editorial data.
DO $$
DECLARE
  v_product uuid;
  v_spec uuid;
BEGIN
  v_product := create_product_from_lookup(
    p_title => 'Bacardi Genuine Spiced Rum 750ml',
    p_source => 'acceptance',
    p_raw => '{"pass":1}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000010',
    p_brand => 'Bacardi'
  );
  UPDATE products
  SET display_name = 'Bacardi Spiced Rum',
      rating = 5,
      description = 'House favorite',
      serve_note = 'Rocks',
      pairing_notes = 'Ginger beer'
  WHERE id = v_product;
  v_spec := (SELECT id FROM specs WHERE slug = 'spiced-rum');
  PERFORM link_product_spec(v_product, v_spec, true);

  PERFORM record_product_lookup(
    p_product_id => v_product,
    p_source => 'acceptance',
    p_raw => '{"pass":2}'::jsonb,
    p_title => 'DIFFERENT TITLE 1L',
    p_brand => 'Other Brand',
    p_description => 'FROM LOOKUP',
    p_origin => 'Puerto Rico',
    p_abv => 35,
    p_size_text => '1 L',
    p_net_contents_amount => 1000,
    p_net_contents_unit => 'ml'
  );

  IF (SELECT display_name FROM products WHERE id = v_product) <> 'Bacardi Spiced Rum'
     OR (SELECT rating FROM products WHERE id = v_product) <> 5
     OR (SELECT description FROM products WHERE id = v_product) <> 'House favorite'
     OR (SELECT serve_note FROM products WHERE id = v_product) <> 'Rocks'
     OR (SELECT pairing_notes FROM products WHERE id = v_product) <> 'Ginger beer'
     OR (SELECT packaged_name FROM products WHERE id = v_product)
          <> 'Bacardi Genuine Spiced Rum 750ml'
     OR (SELECT brand FROM products WHERE id = v_product) <> 'Bacardi' THEN
    RAISE EXCEPTION 'check 9 failed: a later lookup overwrote editorial fields';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM product_specs
    WHERE product_id = v_product AND spec_id = v_spec
  ) THEN
    RAISE EXCEPTION 'check 9 failed: lookup cleared the spec link';
  END IF;
  IF (SELECT origin FROM products WHERE id = v_product) IS DISTINCT FROM 'Puerto Rico'
     OR (SELECT abv FROM products WHERE id = v_product) IS DISTINCT FROM 35
     OR (SELECT net_contents_amount FROM products WHERE id = v_product) IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'check 9 failed: lookup did not fill empty origin, ABV, or size';
  END IF;

  PERFORM record_product_lookup(
    p_product_id => v_product,
    p_source => 'acceptance',
    p_raw => '{"pass":3}'::jsonb,
    p_title => 'THIRD TITLE',
    p_origin => 'Cuba',
    p_description => 'NEWER LOOKUP',
    p_net_contents_amount => 750,
    p_net_contents_unit => 'ml'
  );
  IF (SELECT origin FROM products WHERE id = v_product) IS DISTINCT FROM 'Puerto Rico'
     OR (SELECT description FROM products WHERE id = v_product) IS DISTINCT FROM 'House favorite'
     OR (SELECT net_contents_amount FROM products WHERE id = v_product) IS DISTINCT FROM 1000
     OR (SELECT display_name FROM products WHERE id = v_product) IS DISTINCT FROM 'Bacardi Spiced Rum' THEN
    RAISE EXCEPTION 'check 9 failed: a second lookup overwrote filled or edited fields';
  END IF;

  PERFORM reimport_product_lookup(v_product, ARRAY['display_name']);
  IF (SELECT display_name FROM products WHERE id = v_product) <> 'THIRD TITLE' THEN
    RAISE EXCEPTION 'check 9 failed: explicit re-import did not apply the cached title';
  END IF;
  IF (SELECT rating FROM products WHERE id = v_product) <> 5 THEN
    RAISE EXCEPTION 'check 9 failed: re-import changed the rating';
  END IF;
  RAISE NOTICE 'check 9 passed';
END $$;

-- 10. Neat and wine lists are products. The mixed list is recipes.
DO $$
DECLARE
  v_spirit uuid;
  v_spirit_spec uuid;
  v_wine uuid;
  v_vermouth uuid;
  v_vermouth_spec uuid;
  v_recipe uuid;
BEGIN
  v_spirit_spec := create_spec('acc-rye', 'Acc rye', 'whiskey', p_as_neat => true);
  v_spirit := create_product_from_lookup(
    p_title => 'Acc rye bottle',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000011',
    p_family_id => (SELECT id FROM families WHERE slug = 'whiskey')
  );
  UPDATE products
  SET display_name = 'Acc rye bottle', origin = 'Kentucky', rating = 4, serve_note = 'Neat'
  WHERE id = v_spirit;
  PERFORM link_product_spec(v_spirit, v_spirit_spec, true);

  v_wine := create_product_from_lookup(
    p_title => 'Acc white wine',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000012',
    p_family_id => (SELECT id FROM families WHERE slug = 'still-wine')
  );
  UPDATE products
  SET display_name = 'Acc white wine',
      wine_color = 'white',
      wine_effervescence = 'still',
      origin = 'Loire',
      pairing_notes = 'Fish'
  WHERE id = v_wine;

  -- Own fortified-wine fixture spec: the real dry/sweet vermouth specs are
  -- ingredient_only since 011 and are deliberately hidden from sipping menus.
  v_vermouth_spec := create_spec('acc-fortified', 'Acc fortified wine', 'fortified-wine',
    p_fortified => true, p_as_neat => true);
  v_vermouth := create_product_from_lookup(
    p_title => 'Acc dry vermouth',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000013',
    p_family_id => (SELECT id FROM families WHERE slug = 'fortified-wine')
  );
  UPDATE products
  SET serves_neat = true,
      wine_color = 'white',
      wine_effervescence = 'still',
      fortified = true
  WHERE id = v_vermouth;
  PERFORM link_product_spec(v_vermouth, v_vermouth_spec, true);

  INSERT INTO recipes (name) VALUES ('Acc rye drink') RETURNING id INTO v_recipe;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required, role)
  VALUES (v_recipe, v_spirit_spec, 1, true, 'base');

  IF NOT EXISTS (SELECT 1 FROM menu_neat WHERE id = v_spirit)
     OR NOT EXISTS (SELECT 1 FROM products WHERE id = v_spirit) THEN
    RAISE EXCEPTION 'check 10 failed: neat menu missed an in-stock sipping spirit';
  END IF;
  IF EXISTS (SELECT 1 FROM menu_neat n WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = n.id)) THEN
    RAISE EXCEPTION 'check 10 failed: neat menu is not products';
  END IF;
  IF EXISTS (SELECT 1 FROM menu_wines w WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = w.id)) THEN
    RAISE EXCEPTION 'check 10 failed: wine menu is not products';
  END IF;
  IF EXISTS (SELECT 1 FROM menu_mixed m WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE r.id = m.id)) THEN
    RAISE EXCEPTION 'check 10 failed: mixed menu is not recipes';
  END IF;
  IF EXISTS (SELECT 1 FROM menu_neat WHERE id = v_recipe)
     OR EXISTS (SELECT 1 FROM menu_wines WHERE id = v_recipe)
     OR NOT EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_recipe) THEN
    RAISE EXCEPTION 'check 10 failed: mixed drink was not served as a recipe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM menu_wines WHERE id = v_wine)
     OR EXISTS (SELECT 1 FROM menu_neat WHERE id = v_wine) THEN
    RAISE EXCEPTION 'check 10 failed: still wine was not wine-list-only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM menu_wines WHERE id = v_vermouth)
     OR NOT EXISTS (SELECT 1 FROM menu_neat WHERE id = v_vermouth) THEN
    RAISE EXCEPTION 'check 10 failed: vermouth should be listed as both wine and neat';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM menu_neat
    WHERE id = v_spirit AND description IS NULL AND origin = 'Kentucky' AND rating = 4
  ) THEN
    RAISE EXCEPTION 'check 10 failed: neat menu dropped product editorial fields';
  END IF;
  -- 011: an ingredient_only spec's product is hidden from Cellar and Pours.
  UPDATE specs SET ingredient_only = true WHERE id = v_vermouth_spec;
  IF EXISTS (SELECT 1 FROM menu_wines WHERE id = v_vermouth)
     OR EXISTS (SELECT 1 FROM menu_neat WHERE id = v_vermouth) THEN
    RAISE EXCEPTION 'check 10 failed: ingredient_only product still on a sipping menu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM spec_availability WHERE id = v_vermouth_spec AND available) THEN
    RAISE EXCEPTION 'check 10 failed: ingredient_only spec stopped counting as available';
  END IF;
  UPDATE specs SET ingredient_only = false WHERE id = v_vermouth_spec;
  RAISE NOTICE 'check 10 passed';
END $$;

-- 11. Wines group by style facet, with no vintage column.
DO $$
DECLARE
  v_white uuid;
  v_red uuid;
  v_sparkling uuid;
  v_rose uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name ILIKE '%vintage%'
  ) THEN
    RAISE EXCEPTION 'check 11 failed: a vintage column exists';
  END IF;

  v_white := create_product_from_lookup(
    p_title => 'Acc white', p_source => 'acceptance', p_raw => '{}'::jsonb,
    p_in_stock => true, p_upc => '999000000014',
    p_family_id => (SELECT id FROM families WHERE slug = 'still-wine')
  );
  v_red := create_product_from_lookup(
    p_title => 'Acc red', p_source => 'acceptance', p_raw => '{}'::jsonb,
    p_in_stock => true, p_upc => '999000000015',
    p_family_id => (SELECT id FROM families WHERE slug = 'still-wine')
  );
  v_sparkling := create_product_from_lookup(
    p_title => 'Acc sparkling', p_source => 'acceptance', p_raw => '{}'::jsonb,
    p_in_stock => true, p_upc => '999000000016',
    p_family_id => (SELECT id FROM families WHERE slug = 'sparkling-wine')
  );
  v_rose := create_product_from_lookup(
    p_title => 'Acc rose', p_source => 'acceptance', p_raw => '{}'::jsonb,
    p_in_stock => true, p_upc => '999000000017',
    p_family_id => (SELECT id FROM families WHERE slug = 'still-wine')
  );
  UPDATE products SET wine_color = 'white', wine_effervescence = 'still' WHERE id = v_white;
  UPDATE products SET wine_color = 'red', wine_effervescence = 'still' WHERE id = v_red;
  UPDATE products SET wine_color = 'white', wine_effervescence = 'sparkling' WHERE id = v_sparkling;
  UPDATE products SET wine_color = 'rose', wine_effervescence = 'still' WHERE id = v_rose;

  IF (SELECT style_group FROM menu_wines WHERE id = v_white) <> 'white'
     OR (SELECT style_group FROM menu_wines WHERE id = v_red) <> 'red'
     OR (SELECT style_group FROM menu_wines WHERE id = v_sparkling) <> 'sparkling'
     OR (SELECT style_group FROM menu_wines WHERE id = v_rose) <> 'rose' THEN
    RAISE EXCEPTION 'check 11 failed: style groups were not white / red / sparkling / rose';
  END IF;
  RAISE NOTICE 'check 11 passed';
END $$;

-- 12. Toggling a product out removes it, and hides drinks only that product made.
DO $$
DECLARE
  v_spec uuid;
  v_product uuid;
  v_recipe uuid;
  v_toggled uuid;
  v_unknown uuid;
BEGIN
  v_spec := create_spec('acc-only-bottle', 'Acc only bottle', 'rum', p_as_neat => true);
  v_product := create_product_from_lookup(
    p_title => 'Acc only bottle',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000018',
    p_family_id => (SELECT id FROM families WHERE slug = 'rum')
  );
  PERFORM link_product_spec(v_product, v_spec, true);
  INSERT INTO recipes (name) VALUES ('Acc only bottle drink') RETURNING id INTO v_recipe;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required)
  VALUES (v_recipe, v_spec, 1, true);

  IF NOT EXISTS (SELECT 1 FROM menu_neat WHERE id = v_product)
     OR NOT EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_recipe) THEN
    RAISE EXCEPTION 'check 12 failed: in-stock product did not show on neat and mixed menus';
  END IF;

  v_toggled := set_stock_by_upc('9990-0000-0018', false);
  IF v_toggled IS DISTINCT FROM v_product THEN
    RAISE EXCEPTION 'check 12 failed: scan-out did not find the product';
  END IF;
  IF EXISTS (SELECT 1 FROM menu_neat WHERE id = v_product)
     OR EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_recipe)
     OR recipe_is_makeable(v_recipe) THEN
    RAISE EXCEPTION 'check 12 failed: scan-out left the bottle or its drink on a menu';
  END IF;

  PERFORM set_stock_by_upc('999000000018', true);
  IF NOT EXISTS (SELECT 1 FROM menu_neat WHERE id = v_product)
     OR NOT EXISTS (SELECT 1 FROM menu_mixed WHERE id = v_recipe) THEN
    RAISE EXCEPTION 'check 12 failed: scan-in did not restore the bottle and drink';
  END IF;

  v_unknown := set_stock_by_upc('999000000099', true);
  IF v_unknown IS NOT NULL OR EXISTS (SELECT 1 FROM products WHERE upc = '999000000099') THEN
    RAISE EXCEPTION 'check 12 failed: an unknown UPC created or matched a product';
  END IF;
  RAISE NOTICE 'check 12 passed';
END $$;

-- 13. Mixers, garnishes, sweeteners, staples, and citrus never reach the neat menu,
-- even with a neat/rocks flag. Liqueurs, spirits, and wines stay eligible.
DO $$
DECLARE
  v_mixer uuid;
  v_garnish uuid;
  v_unfiled uuid;
  v_liqueur uuid;
BEGIN
  v_mixer := create_product_from_lookup(
    p_title => 'Acc lemon-lime soda',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000019',
    p_family_id => (SELECT id FROM families WHERE slug = 'mixer')
  );
  v_garnish := create_product_from_lookup(
    p_title => 'Acc stuffed olives',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000020',
    p_family_id => (SELECT id FROM families WHERE slug = 'garnish')
  );
  v_unfiled := create_product_from_lookup(
    p_title => 'Acc club soda, no family',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000021'
  );
  PERFORM link_product_spec(v_unfiled, (SELECT id FROM specs WHERE slug = 'soda-water'), true);
  v_liqueur := create_product_from_lookup(
    p_title => 'Acc orange liqueur',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000022',
    p_family_id => (SELECT id FROM families WHERE slug = 'liqueur')
  );
  UPDATE products
  SET serves_neat = true, serves_rocks = true
  WHERE id IN (v_mixer, v_garnish, v_unfiled, v_liqueur);

  IF EXISTS (SELECT 1 FROM menu_neat WHERE id IN (v_mixer, v_garnish, v_unfiled)) THEN
    RAISE EXCEPTION 'check 13 failed: a mixer or garnish reached the neat menu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM menu_neat WHERE id = v_liqueur) THEN
    RAISE EXCEPTION 'check 13 failed: a rocks-flagged liqueur was dropped from the neat menu';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM menu_neat n
    JOIN products p ON p.id = n.id
    JOIN families f ON f.id = p.family_id
    WHERE f.kind NOT IN ('spirit', 'modifier', 'wine')
  ) THEN
    RAISE EXCEPTION 'check 13 failed: the neat menu lists a non-spirit, non-modifier, non-wine product';
  END IF;
  RAISE NOTICE 'check 13 passed';
END $$;

-- 14. recipe_line_status agrees with the mixed menu and says why a line is missing.
DO $$
DECLARE
  v_have uuid;
  v_out uuid;
  v_none uuid;
  v_garnish uuid;
  v_subbed uuid;
  v_ok uuid;
  v_blocked uuid;
BEGIN
  v_have := create_spec('acc-line-have', 'Acc line have', 'rum');
  v_out := create_spec('acc-line-out', 'Acc line out', 'rum');
  v_none := create_spec('acc-line-none', 'Acc line none', 'rum');
  v_garnish := create_spec('acc-line-garnish', 'Acc line garnish', 'garnish');
  v_subbed := create_spec('acc-line-subbed', 'Acc line subbed', 'rum');
  PERFORM link_product_spec(create_product_from_lookup(
    p_title => 'Acc line in-stock bottle',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => true,
    p_upc => '999000000023'
  ), v_have, true);
  PERFORM link_product_spec(create_product_from_lookup(
    p_title => 'Acc line out-of-stock bottle',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => false,
    p_upc => '999000000024'
  ), v_out, true);
  PERFORM add_substitution(v_have, v_subbed, 'acceptance');

  INSERT INTO recipes (name) VALUES ('Acc line buildable') RETURNING id INTO v_ok;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required) VALUES
    (v_ok, v_have, 1, true),
    (v_ok, v_subbed, 2, true),
    (v_ok, v_garnish, 3, false);
  INSERT INTO recipes (name) VALUES ('Acc line blocked') RETURNING id INTO v_blocked;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required) VALUES
    (v_blocked, v_have, 1, true),
    (v_blocked, v_out, 2, true),
    (v_blocked, v_none, 3, true);

  IF (SELECT status FROM recipe_line_status WHERE recipe_id = v_blocked AND position = 2) <> 'out_of_stock'
     OR (SELECT status FROM recipe_line_status WHERE recipe_id = v_blocked AND position = 3) <> 'no_product'
     OR (SELECT status FROM recipe_line_status WHERE recipe_id = v_ok AND position = 2) <> 'available'
     OR (SELECT status FROM recipe_line_status WHERE recipe_id = v_ok AND position = 3) <> 'no_product' THEN
    RAISE EXCEPTION 'check 14 failed: recipe_line_status gave the wrong reason for a line';
  END IF;
  IF NOT recipe_is_makeable(v_ok) OR recipe_is_makeable(v_blocked) THEN
    RAISE EXCEPTION 'check 14 failed: a missing optional line blocked a drink, or a missing required line did not';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM recipes r
    WHERE NOT EXISTS (
            SELECT 1 FROM recipe_line_status l
            WHERE l.recipe_id = r.id AND l.required AND NOT l.available
          ) IS DISTINCT FROM recipe_is_makeable(r.id)
       OR (r.section = 'mixed'
           AND recipe_is_makeable(r.id) IS DISTINCT FROM EXISTS (SELECT 1 FROM menu_mixed m WHERE m.id = r.id))
  ) THEN
    RAISE EXCEPTION 'check 14 failed: recipe_line_status disagrees with the mixed menu';
  END IF;
  RAISE NOTICE 'check 14 passed';
END $$;

-- 15. Sweet and dry vermouth never substitute for each other (DESIGN §10, migration 014).
DO $$
DECLARE
  v_sweet uuid := (SELECT id FROM specs WHERE slug = 'sweet-vermouth');
  v_dry uuid := (SELECT id FROM specs WHERE slug = 'dry-vermouth');
  v_blocked integer := 0;
  v_other uuid;
BEGIN
  IF v_sweet IS NULL OR v_dry IS NULL THEN
    RAISE EXCEPTION 'check 15 failed: sweet-vermouth and dry-vermouth specs are required';
  END IF;
  BEGIN
    PERFORM add_substitution(v_sweet, v_dry, NULL);
  EXCEPTION WHEN check_violation THEN
    v_blocked := v_blocked + 1;
  END;
  BEGIN
    INSERT INTO spec_substitutions (source_spec_id, target_spec_id) VALUES (v_dry, v_sweet);
  EXCEPTION WHEN check_violation THEN
    v_blocked := v_blocked + 1;
  END;
  IF v_blocked <> 2 THEN
    RAISE EXCEPTION 'check 15 failed: a sweet/dry vermouth substitution was accepted';
  END IF;
  -- Other substitutions still work.
  v_other := create_spec('acc-sub-source', 'Acc sub source', 'liqueur');
  PERFORM add_substitution(v_other, v_dry, 'fixture');
  IF NOT EXISTS (SELECT 1 FROM spec_substitutions WHERE source_spec_id = v_other AND target_spec_id = v_dry) THEN
    RAISE EXCEPTION 'check 15 failed: an ordinary substitution was rejected';
  END IF;
  RAISE NOTICE 'check 15 passed';
END $$;

-- 16. A stand-in only counts when the stand-in itself is on the shelf (or is itself covered).
DO $$
DECLARE
  v_target uuid;
  v_standin uuid;
  v_bottle uuid;
  v_recipe uuid;
BEGIN
  v_target := create_spec('acc-standin-target', 'Acc stand-in target', 'liqueur');
  v_standin := create_spec('acc-standin-source', 'Acc stand-in source', 'liqueur');
  v_bottle := create_product_from_lookup(
    p_title => 'Acc stand-in bottle',
    p_source => 'acceptance',
    p_raw => '{}'::jsonb,
    p_in_stock => false,
    p_upc => '999000000031'
  );
  PERFORM link_product_spec(v_bottle, v_standin, true);
  PERFORM add_substitution(v_standin, v_target, 'acceptance');
  INSERT INTO recipes (name) VALUES ('Acc stand-in recipe') RETURNING id INTO v_recipe;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required) VALUES (v_recipe, v_target, 1, true);
  IF EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_target)
     OR (SELECT available FROM recipe_line_status WHERE recipe_id = v_recipe AND position = 1)
     OR recipe_is_makeable(v_recipe) THEN
    RAISE EXCEPTION 'check 16 failed: an out-of-stock stand-in counted as covering its target';
  END IF;
  UPDATE products SET in_stock = true WHERE id = v_bottle;
  IF NOT EXISTS (SELECT 1 FROM available_spec_ids() a WHERE a.spec_id = v_target)
     OR NOT recipe_is_makeable(v_recipe) THEN
    RAISE EXCEPTION 'check 16 failed: a stocked stand-in did not cover its target';
  END IF;
  RAISE NOTICE 'check 16 passed';
END $$;

-- 17. "top" and "rinse" lines take no amount; every other unit needs one (migration 016).
DO $$
DECLARE
  v_recipe uuid;
  v_spec uuid;
  v_rejected integer := 0;
BEGIN
  v_spec := create_spec('acc-top-soda', 'Acc top soda', 'mixer');
  INSERT INTO recipes (name) VALUES ('Acc top recipe') RETURNING id INTO v_recipe;
  INSERT INTO recipe_lines (recipe_id, spec_id, position, required, amount, unit) VALUES
    (v_recipe, v_spec, 1, true, NULL, 'top'),
    (v_recipe, v_spec, 2, true, NULL, 'rinse'),
    (v_recipe, v_spec, 3, true, 1, 'barspoon');
  BEGIN
    INSERT INTO recipe_lines (recipe_id, spec_id, position, required, amount, unit) VALUES (v_recipe, v_spec, 4, true, NULL, 'oz');
  EXCEPTION WHEN check_violation THEN v_rejected := v_rejected + 1;
  END;
  BEGIN
    INSERT INTO recipe_lines (recipe_id, spec_id, position, required, amount, unit) VALUES (v_recipe, v_spec, 5, true, 2, 'top');
  EXCEPTION WHEN check_violation THEN v_rejected := v_rejected + 1;
  END;
  IF v_rejected <> 2 THEN
    RAISE EXCEPTION 'check 17 failed: a line with the wrong amount/unit pairing was accepted';
  END IF;
  RAISE NOTICE 'check 17 passed';
END $$;

-- 18. recipes.method_style only takes known styles (migration 017).
DO $$
BEGIN
  BEGIN
    INSERT INTO recipes (name, method_style) VALUES ('Acc style recipe', 'wobbled');
    RAISE EXCEPTION 'check 18 failed: an unknown method style was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO recipes (name, method_style) VALUES ('Acc style recipe ok', 'warm, in a mug');
  RAISE NOTICE 'check 18 passed';
END $$;

-- 19. Admin PIN throttle (migration 019): 5 wrong tries lock for 5 min, then 15 min, then 1 h (stays at 1 h);
--     IP and device keys are independent; only 'ip'/'device' kinds and 32-byte digests are accepted.
DO $$
DECLARE
  k_ip  bytea := decode(repeat('a1', 32), 'hex');
  k_dev bytea := decode(repeat('d4', 32), 'hex');
  v_until timestamptz;
  v_mins integer[] := '{}';
  v_round integer;
  v_try integer;
BEGIN
  FOR v_round IN 1..4 LOOP
    FOR v_try IN 1..5 LOOP
      v_until := admin_login_fail('ip', k_ip);
      IF v_try < 5 AND v_round = 1 AND v_until IS NOT NULL THEN
        RAISE EXCEPTION 'check 19 failed: locked after only % wrong tries', v_try;
      END IF;
    END LOOP;
    v_mins := v_mins || round(extract(epoch FROM v_until - now()) / 60)::integer;
    -- Expire the lock so the next round counts afresh (as if the wait had passed).
    UPDATE admin_login_attempts SET locked_until = now() - interval '1 second' WHERE kind = 'ip' AND key_hash = k_ip;
  END LOOP;
  IF v_mins <> '{5,15,60,60}'::integer[] THEN
    RAISE EXCEPTION 'check 19 failed: lockout ladder was % (expected {5,15,60,60} minutes)', v_mins;
  END IF;
  IF EXISTS (SELECT 1 FROM admin_login_attempts WHERE kind = 'device' AND key_hash = k_ip) THEN
    RAISE EXCEPTION 'check 19 failed: an IP failure was counted against a device key';
  END IF;
  IF admin_login_fail('device', k_dev) IS NOT NULL THEN
    RAISE EXCEPTION 'check 19 failed: a fresh device key started out locked';
  END IF;
  BEGIN
    PERFORM admin_login_fail('cookie', k_dev);
    RAISE EXCEPTION 'check 19 failed: an unknown key kind was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM admin_login_fail('ip', '\x01'::bytea);
    RAISE EXCEPTION 'check 19 failed: a key that is not a 32-byte digest was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'check 19 passed';
END $$;

-- 20. One Cellar rule (migration 020): the guest Cellar is exactly the in-stock bottles is_cellar_wine()
--     accepts, an out-of-stock wine is still a wine (admin files it under Wines), and drinks-only
--     vermouth is not (it stays with the spirits).
DO $$
DECLARE
  v_out_wine uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM products p WHERE (p.id IN (SELECT id FROM menu_wines)) <> (p.in_stock AND is_cellar_wine(p.id))) THEN
    RAISE EXCEPTION 'check 20 failed: menu_wines and is_cellar_wine() disagree';
  END IF;
  v_out_wine := create_product_from_lookup(
    p_title => 'Acc out red', p_source => 'acceptance', p_raw => '{}'::jsonb, p_in_stock => false,
    p_upc => '999000000120', p_family_id => (SELECT id FROM families WHERE slug = 'still-wine'));
  IF NOT is_cellar_wine(v_out_wine) OR EXISTS (SELECT 1 FROM menu_wines WHERE id = v_out_wine) THEN
    RAISE EXCEPTION 'check 20 failed: an out-of-stock wine should be a wine but not on the Cellar';
  END IF;
  IF EXISTS (SELECT 1 FROM products p JOIN product_specs ps ON ps.product_id = p.id JOIN specs s ON s.id = ps.spec_id
              WHERE s.canonical_name IN ('dry vermouth', 'sweet vermouth') AND ps.is_primary AND is_cellar_wine(p.id))
     OR is_cellar_wine_spec((SELECT id FROM specs WHERE canonical_name = 'sweet vermouth')) THEN
    RAISE EXCEPTION 'check 20 failed: drinks-only vermouth was treated as a Cellar wine';
  END IF;
  RAISE NOTICE 'check 20 passed';
END $$;

-- 21. Bottles behind each ingredient (migration 021): available_spec_ids() is exactly spec_supply()'s
--     ingredients; every bottle listed is in stock and is a bottle of the source ingredient; hops 0 means
--     the ingredient itself, and its hops-0 bottles are exactly its in-stock bottles; a stand-in chain
--     (A stands in for B, B for C) reaches C from A's bottles in 2 hops.
DO $$
DECLARE
  v_a uuid; v_b uuid; v_c uuid; v_bottle uuid;
BEGIN
  IF EXISTS ((SELECT spec_id FROM available_spec_ids() EXCEPT SELECT spec_id FROM spec_supply())
             UNION ALL (SELECT spec_id FROM spec_supply() EXCEPT SELECT spec_id FROM available_spec_ids())) THEN
    RAISE EXCEPTION 'check 21 failed: available_spec_ids() and spec_supply() disagree';
  END IF;
  IF EXISTS (SELECT 1 FROM spec_supply() x LEFT JOIN products p ON p.id = x.product_id
              WHERE (x.product_id IS NOT NULL AND (NOT p.in_stock OR NOT EXISTS (
                       SELECT 1 FROM product_specs ps WHERE ps.product_id = x.product_id AND ps.spec_id = x.source_spec_id)))
                 OR ((x.hops = 0) <> (x.spec_id = x.source_spec_id))) THEN
    RAISE EXCEPTION 'check 21 failed: a supply row names a bottle that is out or not of its source';
  END IF;
  IF EXISTS ((SELECT ps.spec_id, ps.product_id FROM product_specs ps JOIN products p ON p.id = ps.product_id WHERE p.in_stock
              EXCEPT SELECT spec_id, product_id FROM spec_supply() WHERE hops = 0 AND product_id IS NOT NULL)
             UNION ALL (SELECT spec_id, product_id FROM spec_supply() WHERE hops = 0 AND product_id IS NOT NULL
              EXCEPT SELECT ps.spec_id, ps.product_id FROM product_specs ps JOIN products p ON p.id = ps.product_id WHERE p.in_stock)) THEN
    RAISE EXCEPTION 'check 21 failed: hops-0 bottles are not exactly the in-stock bottles';
  END IF;
  INSERT INTO specs (canonical_name, slug) VALUES ('acc supply a', 'acc-supply-a') RETURNING id INTO v_a;
  INSERT INTO specs (canonical_name, slug) VALUES ('acc supply b', 'acc-supply-b') RETURNING id INTO v_b;
  INSERT INTO specs (canonical_name, slug) VALUES ('acc supply c', 'acc-supply-c') RETURNING id INTO v_c;
  INSERT INTO spec_substitutions (source_spec_id, target_spec_id) VALUES (v_a, v_b), (v_b, v_c);
  v_bottle := create_product_from_lookup(p_title => 'Acc supply bottle', p_source => 'acceptance', p_raw => '{}'::jsonb,
    p_in_stock => true, p_upc => '999000000121');
  INSERT INTO product_specs (product_id, spec_id, is_primary) VALUES (v_bottle, v_a, true);
  IF NOT EXISTS (SELECT 1 FROM spec_supply() WHERE spec_id = v_c AND source_spec_id = v_a AND hops = 2 AND product_id = v_bottle)
     OR NOT EXISTS (SELECT 1 FROM available_spec_ids() WHERE spec_id = v_c) THEN
    RAISE EXCEPTION 'check 21 failed: a two-hop stand-in did not reach its target with the source bottle';
  END IF;
  UPDATE products SET in_stock = false WHERE id = v_bottle;
  IF EXISTS (SELECT 1 FROM spec_supply() WHERE spec_id IN (v_a, v_b, v_c)) THEN
    RAISE EXCEPTION 'check 21 failed: an out bottle still supplies its chain';
  END IF;
  RAISE NOTICE 'check 21 passed';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'all acceptance checks passed';
END $$;

ROLLBACK;
