-- 027_night_roll: an admin can replace tonight's knock and phrase before the 8:00am Eastern roll.
-- Generation 0 is the automatic code. Each force increments it; lounge cookies name the generation,
-- so a prior knock no longer opens the lounge. Idempotent; one transaction; recorded once.
BEGIN;

CREATE TABLE IF NOT EXISTS night_roll (
  day         text        PRIMARY KEY CHECK (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  generation  integer     NOT NULL DEFAULT 0 CHECK (generation >= 0),
  rolled_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE night_roll IS
  'Extra rolls of the speakeasy knock within a day. Generation 0 is the 8:00am code. Each admin roll increments it and invalidates earlier lounge cookies.';

INSERT INTO schema_migrations (version) VALUES ('027_night_roll.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
