-- 018_method_rewrites: Rachel's method rewrites (2026-09-25). Glass/ice wording leaves the text;
-- the glass fields and recipes.method_style (017) carry it. Data-only.
-- Each text is replaced only if it still equals the text it was reviewed against (or is already
-- the rewrite); anything else is left alone with a NOTICE, so a later edit is never clobbered.
-- Winter Wonderland keeps its sourced text (not boilerplate); it only gets method_style = shaken.
-- Also sets method_style for Gin Martini / Old Fashioned (stirred), whose texts had no leading style,
-- and glass_note "one large cube" on the three Old Fashioneds (already set; kept for main).
-- Requires 017. Idempotent; one transaction; recorded once in schema_migrations.
BEGIN;

DO $mig$
DECLARE
  n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '017_method_style.sql') THEN
    RAISE EXCEPTION '018_method_rewrites: apply 017_method_style.sql first';
  END IF;
  UPDATE recipes SET description = $t$Stir with ice until very cold, about 30 seconds, then strain. Serves 1.$t$
   WHERE name = $t$Gin Martini$t$ AND description IS NOT DISTINCT FROM NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Gin Martini$t$ AND description = $t$Stir with ice until very cold, about 30 seconds, then strain. Serves 1.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Gin Martini$t$;
  END IF;
  UPDATE recipes SET description = $t$Stir the sweetener and bitters together, add the bourbon, then stir with ice for 20 seconds and strain. Serves 1.$t$
   WHERE name = $t$Old Fashioned$t$ AND description IS NOT DISTINCT FROM NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Old Fashioned$t$ AND description = $t$Stir the sweetener and bitters together, add the bourbon, then stir with ice for 20 seconds and strain. Serves 1.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Old Fashioned$t$;
  END IF;
  UPDATE recipes SET description = $t$Stir with ice for 20 seconds, then strain. Serves 1. A nutty, dessert-leaning bourbon sipper.$t$
   WHERE name = $t$Pecan Pie Old Fashioned$t$ AND description IS NOT DISTINCT FROM $t$Stirred. Stir with ice 20 sec, strain into a rocks glass over a large cube. Serves 1. Nutty, dessert-leaning bourbon sipper.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Pecan Pie Old Fashioned$t$ AND description = $t$Stir with ice for 20 seconds, then strain. Serves 1. A nutty, dessert-leaning bourbon sipper.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Pecan Pie Old Fashioned$t$;
  END IF;
  UPDATE recipes SET description = $t$Stir with ice for 20 seconds, then strain. Serves 1. Keep the cherry liqueur to a quarter ounce; it's sweet.$t$
   WHERE name = $t$Black Cherry Manhattan$t$ AND description IS NOT DISTINCT FROM $t$Stirred. Stir with ice, strain into a chilled coupe. Serves 1. Keep the cherry liqueur to a quarter ounce; it's sweet.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Black Cherry Manhattan$t$ AND description = $t$Stir with ice for 20 seconds, then strain. Serves 1. Keep the cherry liqueur to a quarter ounce; it's sweet.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Black Cherry Manhattan$t$;
  END IF;
  UPDATE recipes SET description = $t$Stir equal parts rye, cognac and sweet vermouth with ice, then strain. Serves 1. A classic cousin of the Manhattan.$t$
   WHERE name = $t$Saratoga$t$ AND description IS NOT DISTINCT FROM $t$Stirred. Equal parts rye, cognac, and sweet vermouth, stirred with ice and strained into a chilled coupe. Serves 1. A classic cousin of the Manhattan.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Saratoga$t$ AND description = $t$Stir equal parts rye, cognac and sweet vermouth with ice, then strain. Serves 1. A classic cousin of the Manhattan.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Saratoga$t$;
  END IF;
  UPDATE recipes SET description = $t$Stir with ice for 20 seconds, then strain. Serves 1. Bourbon and coffee liqueur, dry and roasty.$t$
   WHERE name = $t$Revolver$t$ AND description IS NOT DISTINCT FROM $t$Stirred. Stir with ice, strain into a chilled coupe. Serves 1. Bourbon and coffee liqueur, dry and roasty.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Revolver$t$ AND description = $t$Stir with ice for 20 seconds, then strain. Serves 1. Bourbon and coffee liqueur, dry and roasty.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Revolver$t$;
  END IF;
  UPDATE recipes SET description = $t$Shake hard with ice, then strain. Serves 1. Spiced rum adds warmth to the classic.$t$
   WHERE name = $t$Winter Sidecar$t$ AND description IS NOT DISTINCT FROM $t$Shaken. Shake hard with ice, strain into a chilled coupe. Serves 1. Spiced rum adds warmth to the classic.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Winter Sidecar$t$ AND description = $t$Shake hard with ice, then strain. Serves 1. Spiced rum adds warmth to the classic.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Winter Sidecar$t$;
  END IF;
  UPDATE recipes SET description = $t$Stir the maple syrup and bitters together, add the rye, then stir with ice for 20 seconds and strain. Serves 1.$t$
   WHERE name = $t$Maple Rye Old Fashioned$t$ AND description IS NOT DISTINCT FROM $t$Stirred. Stir with ice 20 sec, strain into a rocks glass over a large cube. Serves 1.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Maple Rye Old Fashioned$t$ AND description = $t$Stir the maple syrup and bitters together, add the rye, then stir with ice for 20 seconds and strain. Serves 1.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Maple Rye Old Fashioned$t$;
  END IF;
  UPDATE recipes SET description = $t$Stir the honey into the hot water until it dissolves, then add the bourbon and lemon. Serves 1. Cognac works in place of bourbon.$t$
   WHERE name = $t$Hot Toddy$t$ AND description IS NOT DISTINCT FROM $t$Warm, in a mug. Stir honey into hot water until dissolved, then add bourbon and lemon. Serves 1. Cognac works in place of bourbon.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Hot Toddy$t$ AND description = $t$Stir the honey into the hot water until it dissolves, then add the bourbon and lemon. Serves 1. Cognac works in place of bourbon.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Hot Toddy$t$;
  END IF;
  UPDATE recipes SET description = $t$Warm everything with the spices on low for 20 minutes without letting it boil, then strain. Amounts are per serving. One bottle of red plus half a bottle of cranberry wine makes about 6 servings.$t$
   WHERE name = $t$Cranberry Mulled Wine$t$ AND description IS NOT DISTINCT FROM $t$Warm, batch. Per mug amounts shown. For a batch, 1 bottle red wine plus half a bottle of cranberry wine makes about 6 mugs; scale the rest to match. Warm everything with the spices on low for 20 min, never boiling, then strain into mugs.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Cranberry Mulled Wine$t$ AND description = $t$Warm everything with the spices on low for 20 minutes without letting it boil, then strain. Amounts are per serving. One bottle of red plus half a bottle of cranberry wine makes about 6 servings.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Cranberry Mulled Wine$t$;
  END IF;
  UPDATE recipes SET description = $t$Heat the cider, add the rum and liqueur, and stir. Serves 1. Instant spiced cider mix made with hot water works fine.$t$
   WHERE name = $t$Butter Pecan Hot Cider$t$ AND description IS NOT DISTINCT FROM $t$Warm, in a mug. Heat cider, add rum and liqueur, and stir. Serves 1. Shelf-stable instant spiced cider mix made with hot water works fine.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Butter Pecan Hot Cider$t$ AND description = $t$Heat the cider, add the rum and liqueur, and stir. Serves 1. Instant spiced cider mix made with hot water works fine.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Butter Pecan Hot Cider$t$;
  END IF;
  UPDATE recipes SET description = $t$Brew a strong chai with 2 tea bags, then stir in the vodka and Irish cream. Serves 1.$t$
   WHERE name = $t$Spiked Chai$t$ AND description IS NOT DISTINCT FROM $t$Warm, in a mug. Brew a strong chai (2 tea bags), then stir in vodka and Irish cream. Serves 1.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Spiked Chai$t$ AND description = $t$Brew a strong chai with 2 tea bags, then stir in the vodka and Irish cream. Serves 1.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Spiked Chai$t$;
  END IF;
  UPDATE recipes SET description = $t$Make the hot chocolate, then stir in the creme de menthe and vodka. Serves 1. The creme de menthe tints it green.$t$
   WHERE name = $t$Peppermint Cocoa$t$ AND description IS NOT DISTINCT FROM $t$Warm, in a mug. Make hot chocolate, then stir in the liqueur and vodka. Serves 1. The creme de menthe will tint it green.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Peppermint Cocoa$t$ AND description = $t$Make the hot chocolate, then stir in the creme de menthe and vodka. Serves 1. The creme de menthe tints it green.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Peppermint Cocoa$t$;
  END IF;
  UPDATE recipes SET description = $t$Pour the hot coffee, then stir in the Irish cream and hazelnut liqueur. Serves 1.$t$
   WHERE name = $t$Nutty Irish Coffee$t$ AND description IS NOT DISTINCT FROM $t$Warm, in a mug. Pour hot coffee, then stir in Irish cream and hazelnut liqueur. Serves 1.$t$;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM recipes WHERE name = $t$Nutty Irish Coffee$t$ AND description = $t$Pour the hot coffee, then stir in the Irish cream and hazelnut liqueur. Serves 1.$t$) THEN
    RAISE NOTICE '018: left % alone (text changed since review)', $t$Nutty Irish Coffee$t$;
  END IF;
  UPDATE recipes SET method_style = 'stirred' WHERE name = $t$Gin Martini$t$ AND method_style IS NULL;
  UPDATE recipes SET method_style = 'stirred' WHERE name = $t$Old Fashioned$t$ AND method_style IS NULL;
  UPDATE recipes SET method_style = 'shaken' WHERE name = $t$Winter Wonderland$t$ AND method_style IS NULL;
  UPDATE recipes SET glass_note = 'one large cube' WHERE name IN ('Old Fashioned', 'Pecan Pie Old Fashioned', 'Maple Rye Old Fashioned') AND glass_note IS DISTINCT FROM 'one large cube';
END $mig$;

INSERT INTO schema_migrations (version) VALUES ('018_method_rewrites.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
