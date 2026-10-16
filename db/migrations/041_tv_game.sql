-- 041_tv_game: the TV can hand the screen to a Shindig White Elephant game while one is running (Brian via
-- Vincent, 2026-10-16). One row:
--   source        what the admin typed in "Show Shindig game from": a Shindig TV token or a /tv/<token> URL
--                 (parsed by the app, lib/tv-game.ts). NULL = off; the TV never polls Shindig.
--   dismissed_at  "Back to menu": the TV drops the game in progress and ignores it until Shindig reports the
--                 game is no longer live (the next game shows again).
-- Edits are logged in change_log as entity 'bar'. Idempotent; one transaction; recorded once.
-- Undo, in one transaction: DROP TABLE IF EXISTS tv_game; DELETE FROM schema_migrations WHERE version = '041_tv_game.sql';
BEGIN;
SET LOCAL client_min_messages = warning;

CREATE TABLE IF NOT EXISTS tv_game (
  id           smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  source       text        CHECK (source IS NULL OR (char_length(source) BETWEEN 1 AND 300 AND source = btrim(source))),
  dismissed_at timestamptz,
  changed_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tv_game (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE tv_game IS
  'TV takeover by a Shindig White Elephant game (admin Bar tab). source: Shindig TV token or URL; dismissed_at: "Back to menu".';

INSERT INTO schema_migrations (version) VALUES ('041_tv_game.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
