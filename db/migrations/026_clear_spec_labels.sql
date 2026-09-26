-- 026_clear_spec_labels: the product badge override is no longer edited. Pours uses the
-- primary spec (sentence-cased). Clears the three custom labels (London dry gin, Absinthe, Peach brandy).
-- The column stays so older reads still work; new saves write NULL.
-- Idempotent; one transaction; recorded once.
BEGIN;

UPDATE products SET spec_label = NULL WHERE spec_label IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('026_clear_spec_labels.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
