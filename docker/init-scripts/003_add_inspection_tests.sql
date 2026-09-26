-- Office-use inspection checklist from the paper form, e.g. ["memtest", "hdd_test"].
-- Forward-only migration: production already ran 001_schema.sql, so this must
-- also be run by hand there (see PLAN.md > Deployment).
ALTER TABLE service_forms ADD COLUMN IF NOT EXISTS inspection_tests JSONB NOT NULL DEFAULT '[]';
