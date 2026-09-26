-- 025_change_log_family: the /db family editor writes the same audit log as the other admin.
-- Idempotent: safe to re-run; one transaction; recorded once in schema_migrations.
BEGIN;

ALTER TABLE change_log DROP CONSTRAINT IF EXISTS change_log_entity_check;
ALTER TABLE change_log ADD CONSTRAINT change_log_entity_check
  CHECK (entity IN ('product', 'recipe', 'spec', 'substitution', 'alias', 'family'));

INSERT INTO schema_migrations (version) VALUES ('025_change_log_family.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
