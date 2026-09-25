-- 014_no_vermouth_swap: DESIGN §10 — sweet and dry vermouth are independent and may
-- never stand in for each other. Enforced in the database (either direction), so the
-- admin UI and any other writer get the same rule. Fails if a forbidden pair already exists.
-- Idempotent: safe to re-run; one transaction; recorded once in schema_migrations.
BEGIN;

CREATE OR REPLACE FUNCTION block_vermouth_swap_trg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  a text;
  b text;
BEGIN
  SELECT slug INTO a FROM specs WHERE id = NEW.source_spec_id;
  SELECT slug INTO b FROM specs WHERE id = NEW.target_spec_id;
  IF (a, b) IN (('sweet-vermouth', 'dry-vermouth'), ('dry-vermouth', 'sweet-vermouth')) THEN
    RAISE EXCEPTION 'Sweet and dry vermouth can''t stand in for each other (DESIGN §10).'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM spec_substitutions ss
    JOIN specs a ON a.id = ss.source_spec_id
    JOIN specs b ON b.id = ss.target_spec_id
    WHERE (a.slug, b.slug) IN (('sweet-vermouth', 'dry-vermouth'), ('dry-vermouth', 'sweet-vermouth'))
  ) THEN
    RAISE EXCEPTION '014_no_vermouth_swap: a sweet/dry vermouth substitution already exists; remove it first';
  END IF;
END $$;

DROP TRIGGER IF EXISTS spec_substitutions_no_vermouth_swap ON spec_substitutions;
CREATE TRIGGER spec_substitutions_no_vermouth_swap
  BEFORE INSERT OR UPDATE ON spec_substitutions
  FOR EACH ROW EXECUTE FUNCTION block_vermouth_swap_trg();

INSERT INTO schema_migrations (version) VALUES ('014_no_vermouth_swap.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
