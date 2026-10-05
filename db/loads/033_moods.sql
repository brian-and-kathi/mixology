-- Mood tags load for 033_moods (Trinity's moods.csv, 2026-10-04; 50 items: 19 pours, 20 cocktails, 11 wines).
-- By id; a row is applied only when the id is on this branch, in the right table (pour/wine = products, cocktail
-- = recipes), and the item still has no moods, so re-running never overwrites an admin edit. Rows that don't
-- apply are listed with a NOTICE (dev lacks a few of main's items). Names are listed for reading only.
-- Bumps bar_versions.menu_version through the 028 triggers; run `npm run notify` afterwards.
BEGIN;
CREATE TEMP TABLE moods_load ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('pour','cfffa6f8-2cb4-41e9-81a9-fb6908c957d8'::uuid,'Amaretto di Toscana',ARRAY['Indulgent']::text[]),
  ('pour','5d1ff5e7-0f81-4e3f-94f4-be40463e84e6'::uuid,'Bacardi Spiced Rum',ARRAY['Cozy','Tropical']::text[]),
  ('pour','c3fbbc37-cfc7-41bc-a47c-33d31c85139d'::uuid,'Beefeater Gin',ARRAY['Clean']::text[]),
  ('pour','bffd3b07-c067-4b5f-b91b-6b0068a6c278'::uuid,'Bowright Archer''s Moon',ARRAY['Cozy']::text[]),
  ('pour','8f233755-9c44-417c-9231-d74ea7260908'::uuid,'Bowright Longbow Bourbon',ARRAY['Cozy']::text[]),
  ('pour','a522a073-cd88-4331-93b3-ad40763b3f11'::uuid,'Bowright Recurve Rye',ARRAY['Cozy']::text[]),
  ('pour','b9338ddb-919c-4ab6-8e13-77966d7de4b9'::uuid,'Burl & Sprig Spiced Rum',ARRAY['Cozy','Indulgent']::text[]),
  ('pour','4f6df7fa-26c8-4ce1-b8a1-e21861b446b9'::uuid,'Emerald Cove Coconut Rum',ARRAY['Tropical']::text[]),
  ('pour','35ab6799-731f-4976-8c24-786d96b28b4c'::uuid,'Grand Marnier',ARRAY['Cozy','Indulgent']::text[]),
  ('pour','c1d7d47b-4ecd-4d79-8990-8d4f71a5d26a'::uuid,'Hornitos Plata Tequila',ARRAY['Night-Out','Clean']::text[]),
  ('pour','5c0222bd-1b12-4dc5-8f74-3a21d381bcf9'::uuid,'Limoncello',ARRAY['Clean']::text[]),
  ('pour','c1dc90c0-5194-47e4-aba4-b114a121da1b'::uuid,'Long Road Aquavit',ARRAY['Clean']::text[]),
  ('pour','14de00ba-b40b-430f-b2b3-ca45853200e5'::uuid,'Midori',ARRAY['Tropical','Indulgent']::text[]),
  ('pour','a71abc18-0701-4855-a172-174c7f69e37e'::uuid,'Plomari Ouzo',ARRAY['Clean']::text[]),
  ('pour','82928426-6f3e-448e-9f63-cf528c0bd0f2'::uuid,'Plymouth Sloe Gin',ARRAY['Indulgent']::text[]),
  ('pour','b20db2b0-eb59-415f-aa81-1fc1133888a4'::uuid,'Réviseur VS Cognac',ARRAY['Cozy']::text[]),
  ('pour','911096a3-68b9-48eb-9ca6-4531c9861247'::uuid,'Striped Pig Grapefruit Gin',ARRAY['Clean']::text[]),
  ('pour','22f31e85-976c-4a48-a902-b3426a473fe7'::uuid,'Willett Rye',ARRAY['Cozy']::text[]),
  ('pour','2fe0d9cf-5bf7-4583-a2f3-7417ed20f1d0'::uuid,'XXL Peach Brandy',ARRAY['Cozy','Indulgent']::text[]),
  ('cocktail','4fb070de-1e68-4ee5-832c-3eaf63ad2a39'::uuid,'Black Cherry Manhattan',ARRAY['Night-Out','Bitter','Nostalgic']::text[]),
  ('cocktail','fefd9df2-d9fd-4514-baa0-da60c046bbe5'::uuid,'Brandy Alexander Nog',ARRAY['Indulgent','Nostalgic']::text[]),
  ('cocktail','3ffe46f3-53d3-437d-946c-3196b99eb40e'::uuid,'Butter Pecan Hot Cider',ARRAY['Cozy','Indulgent']::text[]),
  ('cocktail','18a2e9be-1ce0-4798-9959-b7ea069f57ce'::uuid,'Butter Pecan Nog',ARRAY['Indulgent','Nostalgic']::text[]),
  ('cocktail','97f9bba0-dc8e-42ab-8a28-5b0b6701ec65'::uuid,'Cranberry Mulled Wine',ARRAY['Cozy','Nostalgic']::text[]),
  ('cocktail','d12d8dd0-2e29-4b9d-b2f0-1618f77cc05f'::uuid,'Gin Martini',ARRAY['Night-Out','Bitter']::text[]),
  ('cocktail','9f3fb066-124c-4a4e-9dfb-e7552e3443f9'::uuid,'Grapefruit Martini',ARRAY['Night-Out','Clean']::text[]),
  ('cocktail','d3201f94-b26b-40a0-a511-677a4d6cc267'::uuid,'Hot Toddy',ARRAY['Cozy','Nostalgic']::text[]),
  ('cocktail','883b48a9-5dd3-4bdd-b2a2-e00956b05aad'::uuid,'Irish Cream Nog',ARRAY['Indulgent','Nostalgic']::text[]),
  ('cocktail','682f8882-bf1e-4c76-8ba1-fbf5ca6c16df'::uuid,'Maple Rye Old Fashioned',ARRAY['Cozy','Nostalgic']::text[]),
  ('cocktail','42bc1955-8863-4001-a895-6e2dfe86b602'::uuid,'Nutty Irish Coffee',ARRAY['Cozy','Indulgent']::text[]),
  ('cocktail','a2382991-0f84-4482-9781-57efac8b4062'::uuid,'Old Fashioned',ARRAY['Bitter','Nostalgic']::text[]),
  ('cocktail','0a51ba08-8a69-426b-8653-a7d7fefc7838'::uuid,'Pecan Pie Old Fashioned',ARRAY['Indulgent','Nostalgic']::text[]),
  ('cocktail','6bd68311-1eee-4467-b3ea-a827155927b0'::uuid,'Peppermint Cocoa',ARRAY['Cozy','Indulgent']::text[]),
  ('cocktail','00dd9635-a64f-4899-bfd2-4bcc71f8fb59'::uuid,'Revolver',ARRAY['Cozy','Night-Out']::text[]),
  ('cocktail','836101e5-3401-49f3-91ee-be42fdf55b2a'::uuid,'Saratoga',ARRAY['Bitter','Nostalgic']::text[]),
  ('cocktail','8cffbdfb-5600-4f16-a0f2-22676aaf2482'::uuid,'Spiced Rum Nog',ARRAY['Indulgent','Nostalgic']::text[]),
  ('cocktail','74f8b39f-7794-4b85-ad4d-5f34b1e74d21'::uuid,'Spiked Chai',ARRAY['Cozy','Indulgent']::text[]),
  ('cocktail','ffe2da79-734f-41c0-88bb-d89008f8fa8d'::uuid,'Winter Sidecar',ARRAY['Cozy','Night-Out']::text[]),
  ('cocktail','6a23d6a1-de00-44f2-92bb-238fb5e1a918'::uuid,'Winter Wonderland',ARRAY['Indulgent','Nostalgic']::text[]),
  ('wine','8fac61fa-a95e-4645-afd2-8b42e54d9dd1'::uuid,'Barefoot Moscato',ARRAY['Night-Out','Indulgent']::text[]),
  ('wine','f16aa227-597c-408a-9e8d-3222ee6932c2'::uuid,'Bavarian Inn Cranberry',ARRAY['Cozy']::text[]),
  ('wine','41d6363a-a84e-45ca-a9c4-897a89d06b62'::uuid,'Bonobo Pinot Gris',ARRAY['Clean']::text[]),
  ('wine','df352bd1-a8b4-4581-8c67-347076afe2e4'::uuid,'Brys Estate Pinot Blanc',ARRAY['Clean']::text[]),
  ('wine','214975aa-fca7-4632-880f-c17d8ba538c2'::uuid,'Brys Estate Sauvignon Blanc',ARRAY['Tropical','Clean']::text[]),
  ('wine','40753ea3-f2c5-4835-a74c-a167d6194904'::uuid,'Chateau Chantal Trio',ARRAY['Cozy','Smoky']::text[]),
  ('wine','be6fa124-f80b-4628-81c0-03621bad67e4'::uuid,'Chateau Grand Traverse',ARRAY['Cozy','Indulgent']::text[]),
  ('wine','8c429872-f94c-4ad5-8467-b5a114f4ea4c'::uuid,'Hakutsuru Sake',ARRAY['Night-Out','Clean']::text[]),
  ('wine','c4143de8-c240-4168-a928-2b5ad60255cf'::uuid,'Harvester Cabernet',ARRAY['Cozy']::text[]),
  ('wine','7d2f298b-30ad-4099-b889-9b4e85e1c7c5'::uuid,'Señor Sangria Classic Red',ARRAY['Night-Out']::text[]),
  ('wine','3b7a3beb-f29e-4f58-97ec-08ea2e0784a4'::uuid,'Woodbridge Pinot Grigio',ARRAY['Clean']::text[])
) AS v(item_type, id, name, moods);

DO $$
DECLARE r record; n_p int; n_r int;
BEGIN
  FOR r IN SELECT v.* FROM moods_load v
            WHERE NOT ((v.item_type IN ('pour','wine') AND EXISTS (SELECT 1 FROM products p WHERE p.id = v.id))
                    OR (v.item_type = 'cocktail' AND EXISTS (SELECT 1 FROM recipes x WHERE x.id = v.id))) LOOP
    RAISE NOTICE 'moods load: % "%" (%) is not on this branch; skipped', r.item_type, r.name, r.id;
  END LOOP;
  UPDATE products p SET moods = v.moods FROM moods_load v
   WHERE v.item_type IN ('pour','wine') AND p.id = v.id AND p.moods = '{}';
  GET DIAGNOSTICS n_p = ROW_COUNT;
  UPDATE recipes x SET moods = v.moods FROM moods_load v
   WHERE v.item_type = 'cocktail' AND x.id = v.id AND x.moods = '{}';
  GET DIAGNOSTICS n_r = ROW_COUNT;
  RAISE NOTICE 'moods load: % products, % recipes tagged', n_p, n_r;
END $$;
COMMIT;
