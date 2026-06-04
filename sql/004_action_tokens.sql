-- Telegram inline action tokens for local CFDI bot.
-- Database expected: cfdi_bot
-- Tokens are short-lived local controls; they are not CFDI/PAC/timbrado data.

CREATE TABLE IF NOT EXISTS cfdi_action_tokens (
  token text PRIMARY KEY,
  chat_id text NOT NULL,
  draft_id text,
  action text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfdi_action_tokens_chat_id ON cfdi_action_tokens (chat_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_action_tokens_action ON cfdi_action_tokens (action);
CREATE INDEX IF NOT EXISTS idx_cfdi_action_tokens_expires_at ON cfdi_action_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_cfdi_action_tokens_used_at ON cfdi_action_tokens (used_at);

GRANT USAGE ON SCHEMA public TO cfdi_bot_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfdi_bot_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cfdi_bot_user;
