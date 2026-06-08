-- Optional additive metadata for SAT catalog field normalization.
-- This migration does not update real client data. It only adds safe columns
-- that can be populated after human review in a later phase.

ALTER TABLE cfdi_clients
  ADD COLUMN IF NOT EXISTS regimen_fiscal_description text;

ALTER TABLE cfdi_clients
  ADD COLUMN IF NOT EXISTS uso_cfdi_description text;

ALTER TABLE cfdi_clients
  ADD COLUMN IF NOT EXISTS fiscal_normalization_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
