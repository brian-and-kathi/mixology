-- 022_drink_ratings: guest star ratings on the phone detail pages (pours, cocktails, Cellar wines).
-- One row per (drink, device): a bottle (pour or Cellar wine) is item_kind 'product' with product_id set,
-- a cocktail is 'recipe' with recipe_id set; item_id is the one that is set. The device is an anonymous
-- random id from a long-lived httpOnly guest cookie (no sign-in; nothing else about the device is kept).
-- A new vote replaces the device's old one (updated_at moves); clearing deletes the row. Ratings go away
-- with their drink (ON DELETE CASCADE). rate_drink() only accepts drinks that are on the guest menu right
-- now (menu_neat / menu_wines / menu_mixed) and returns the new average and count. Guest data only;
-- never touches stock or menu data. Idempotent; one transaction; recorded once.
BEGIN;

CREATE TABLE IF NOT EXISTS drink_ratings (
  item_kind  text        NOT NULL CHECK (item_kind IN ('product', 'recipe')),
  product_id uuid        REFERENCES products(id) ON DELETE CASCADE,
  recipe_id  uuid        REFERENCES recipes(id) ON DELETE CASCADE,
  item_id    uuid        GENERATED ALWAYS AS (COALESCE(product_id, recipe_id)) STORED,
  device_id  uuid        NOT NULL,
  stars      smallint    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drink_ratings_one_item CHECK (
    (item_kind = 'product' AND product_id IS NOT NULL AND recipe_id IS NULL)
    OR (item_kind = 'recipe' AND recipe_id IS NOT NULL AND product_id IS NULL)),
  CONSTRAINT drink_ratings_one_per_device UNIQUE (item_kind, item_id, device_id)
);

COMMENT ON TABLE drink_ratings IS
  'Guest 1-5 star ratings, one changeable vote per drink per anonymous device cookie. Written only through rate_drink().';

CREATE OR REPLACE FUNCTION drink_on_menu(p_kind text, p_item uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_kind
    WHEN 'product' THEN EXISTS (SELECT 1 FROM menu_neat WHERE id = p_item) OR EXISTS (SELECT 1 FROM menu_wines WHERE id = p_item)
    WHEN 'recipe' THEN EXISTS (SELECT 1 FROM menu_mixed WHERE id = p_item)
    ELSE false
  END;
$$;

-- Set (1-5) or clear (NULL) this device's vote. Returns the drink's average (1 decimal) and count;
-- no row when the drink isn't on the guest menu.
CREATE OR REPLACE FUNCTION rate_drink(p_kind text, p_item uuid, p_device uuid, p_stars smallint)
RETURNS TABLE(avg_stars numeric, votes integer)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT drink_on_menu(p_kind, p_item) THEN
    RETURN;
  END IF;
  IF p_stars IS NULL THEN
    DELETE FROM drink_ratings r WHERE r.item_kind = p_kind AND r.item_id = p_item AND r.device_id = p_device;
  ELSE
    INSERT INTO drink_ratings AS r (item_kind, product_id, recipe_id, device_id, stars)
    VALUES (p_kind, CASE WHEN p_kind = 'product' THEN p_item END, CASE WHEN p_kind = 'recipe' THEN p_item END, p_device, p_stars)
    ON CONFLICT (item_kind, item_id, device_id)
    DO UPDATE SET stars = EXCLUDED.stars, updated_at = now()
    WHERE r.stars IS DISTINCT FROM EXCLUDED.stars;
  END IF;
  RETURN QUERY
    SELECT round(avg(r.stars), 1), count(*)::int
      FROM drink_ratings r WHERE r.item_kind = p_kind AND r.item_id = p_item;
END;
$$;

COMMENT ON FUNCTION rate_drink(text, uuid, uuid, smallint) IS
  'Guest vote: upsert (1-5) or clear (NULL) one device''s rating for a drink on the guest menu; returns average (1 decimal) and count.';

INSERT INTO schema_migrations (version) VALUES ('022_drink_ratings.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
