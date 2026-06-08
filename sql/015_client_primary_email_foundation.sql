-- 7.16J client primary email foundation.
-- Local additive migration only. Do not store secondary/billing emails here.

ALTER TABLE cfdi_clients
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE cfdi_clients
  ADD COLUMN IF NOT EXISTS email_confirmed boolean NOT NULL DEFAULT false;

ALTER TABLE cfdi_clients
  ADD COLUMN IF NOT EXISTS provider_email_sync_status text;

ALTER TABLE cfdi_clients
  ADD COLUMN IF NOT EXISTS provider_email_sync_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
