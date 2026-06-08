-- Sandbox document delivery ledger.
-- Database expected: cfdi_bot
-- Additive only. Stores sanitized delivery evidence, hashes and status; never
-- stores document contents, secrets, full chat IDs or full email addresses.

CREATE TABLE IF NOT EXISTS document_delivery_ledger (
  delivery_id text PRIMARY KEY,
  draft_id text NOT NULL,
  client_id text,
  provider text NOT NULL,
  environment text NOT NULL,
  channel text NOT NULL,
  delivery_status text NOT NULL,
  delivery_action text NOT NULL,
  recipient_present boolean NOT NULL DEFAULT false,
  recipient_redacted text,
  email_confirmed boolean,
  provider_email_sync_status text,
  telegram_chat_id_present boolean,
  documents_valid boolean NOT NULL DEFAULT false,
  xml_content_valid boolean NOT NULL DEFAULT false,
  pdf_content_valid boolean NOT NULL DEFAULT false,
  pdf_source text,
  xml_sha256 text,
  pdf_sha256 text,
  xml_size_bytes integer,
  pdf_size_bytes integer,
  human_xml_path text,
  human_pdf_path text,
  provider_message text,
  evidence_sanitized jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  normalized_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_delivery_ledger_idempotency
ON document_delivery_ledger (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_document_delivery_ledger_draft_channel
ON document_delivery_ledger (draft_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_delivery_ledger_status
ON document_delivery_ledger (delivery_status, created_at DESC);

GRANT USAGE ON SCHEMA public TO cfdi_bot_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfdi_bot_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cfdi_bot_user;
