-- 015_tv_cast: the single "Show on TV" cast record (one TV, one cast at a time).
-- A guest casts a cocktail or pour from its phone page; the TV shows it in a bottom band
-- until expires_at (5 minutes), until someone takes it off, or until a new cast replaces it.
-- Display-only: never affects stock, buildability, or the guest menu data.
-- (013/014 are reserved by the admin branch.) Idempotent; one transaction; recorded once.
BEGIN;

CREATE TABLE IF NOT EXISTS tv_cast (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  item_type   text NOT NULL CHECK (item_type IN ('recipe', 'pour')),
  item_id     uuid NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  CHECK (expires_at > started_at)
);

COMMENT ON TABLE tv_cast IS
  'At most one row: what the TV is showing (recipe id or pour/product id) and when it expires. Display-only.';

INSERT INTO schema_migrations (version) VALUES ('015_tv_cast.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
