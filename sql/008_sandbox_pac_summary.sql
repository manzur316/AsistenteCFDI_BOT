-- Sandbox PAC metadata for local XML/PDF artifact downloads.
-- Additive only: keeps legacy cfdi_drafts.status, invoice_status and
-- payment_status untouched.

ALTER TABLE cfdi_drafts
  ADD COLUMN IF NOT EXISTS sandbox_pac_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cfdi_drafts_sandbox_pac_summary_gin
  ON cfdi_drafts USING gin (sandbox_pac_summary);

GRANT USAGE ON SCHEMA public TO cfdi_bot_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfdi_bot_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cfdi_bot_user;
