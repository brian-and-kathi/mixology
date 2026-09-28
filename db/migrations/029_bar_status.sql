-- 029_bar_status: the bar is Open or Closed (DESIGN §3.1). One row. While Closed only admins get into the
-- guest pages and APIs; the locksmith cover (/) is unaffected and the TV shows the board under a Closed mark.
--
-- Opening sets open_until to the next 2:00 AM America/New_York (computed by the app, DST-aware). The bar is
-- open only while is_open AND now() < open_until, so it closes itself at 2:00 AM with no job running, and
-- nothing ever sets is_open back to true except an admin. bar_state() is the one definition of that rule.
-- The row starts Closed: an admin opens the bar with one tap. (029, not 028: 028 is bar_versions.)
-- Idempotent; one transaction; recorded once.
BEGIN;
SET LOCAL client_min_messages = warning;

CREATE TABLE IF NOT EXISTS bar_status (
  id          smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_open     boolean     NOT NULL DEFAULT false,
  open_until  timestamptz,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  -- Open always carries its closing time; Closed never does.
  CONSTRAINT bar_status_open_until CHECK ((is_open AND open_until IS NOT NULL) OR (NOT is_open AND open_until IS NULL)),
  -- The closing time is ahead of the change and at most 25 hours out (the next 2:00 AM is < 24 h + a DST hour).
  CONSTRAINT bar_status_open_until_range CHECK (open_until IS NULL OR (open_until > changed_at AND open_until <= changed_at + interval '25 hours'))
);
INSERT INTO bar_status (id, is_open) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE bar_status IS
  'Open/Closed, one row. Open means is_open AND now() < open_until (the next 2:00 AM Eastern when opened); read it through bar_state().';

-- The effective status. closed_since: when it last became closed (the change, or open_until once that passed),
-- so a cast started before the bar closed is no longer shown. No row means Closed.
CREATE OR REPLACE FUNCTION bar_state(OUT is_open boolean, OUT open_until timestamptz, OUT closed_since timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT open_now, CASE WHEN open_now THEN s.open_until END,
         CASE WHEN open_now THEN NULL WHEN s.is_open THEN s.open_until ELSE s.changed_at END
    FROM (SELECT b.*, (b.is_open AND now() < b.open_until) AS open_now FROM bar_status b WHERE b.id = 1) s
  UNION ALL
  SELECT false, NULL, NULL WHERE NOT EXISTS (SELECT 1 FROM bar_status WHERE id = 1)
$$;

-- Admin opens and closes are logged like other admin edits.
ALTER TABLE change_log DROP CONSTRAINT IF EXISTS change_log_entity_check;
ALTER TABLE change_log ADD CONSTRAINT change_log_entity_check
  CHECK (entity IN ('product', 'recipe', 'spec', 'substitution', 'alias', 'family', 'bar'));

INSERT INTO schema_migrations (version) VALUES ('029_bar_status.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
