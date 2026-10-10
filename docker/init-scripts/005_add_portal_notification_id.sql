-- Id of the Luxtronic Portal notification shown while a job is in progress, so
-- it can be removed again when the job is finished or deleted.
-- Forward-only, safe to re-run: run by hand on production before deploying.
ALTER TABLE service_forms ADD COLUMN IF NOT EXISTS portal_notification_id VARCHAR(100);
