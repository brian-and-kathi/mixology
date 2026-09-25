-- 013_change_log: an append-only log of admin edits (who, what, before, after, when).
-- Powers the admin "Recently changed" strip and one-tap undo of stock changes.
-- Display/audit only: nothing in the guest menu or buildability reads it.
-- Idempotent: safe to re-run; one transaction; recorded once in schema_migrations.
BEGIN;

CREATE TABLE IF NOT EXISTS change_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor      text NOT NULL DEFAULT 'admin' CHECK (char_length(btrim(actor)) > 0),
  entity     text NOT NULL CHECK (entity IN ('product', 'recipe', 'spec', 'substitution', 'alias')),
  entity_id  text NOT NULL,
  action     text NOT NULL CHECK (action IN ('stock', 'create', 'update', 'delete', 'undo')),
  summary    text NOT NULL CHECK (char_length(btrim(summary)) > 0),
  before     jsonb,
  after      jsonb,
  undone_by  bigint REFERENCES change_log (id)
);

CREATE INDEX IF NOT EXISTS change_log_at_idx ON change_log (at DESC);
CREATE INDEX IF NOT EXISTS change_log_entity_idx ON change_log (entity, entity_id, at DESC);

COMMENT ON TABLE change_log IS
  'Admin edit history: who (actor), what (entity, entity_id, action, summary), before/after JSON, when (at). Audit and undo only.';
COMMENT ON COLUMN change_log.undone_by IS 'Set when a later ''undo'' entry reversed this change.';

INSERT INTO schema_migrations (version) VALUES ('013_change_log.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
