-- Private security boundary for local CFDI bot.
-- Database expected: cfdi_bot
-- This schema creates access-control tables only.
-- Do not insert real users or credentials in versioned SQL.

CREATE TABLE IF NOT EXISTS cfdi_authorized_users (
  user_id text PRIMARY KEY,
  telegram_chat_id text,
  telegram_user_id text,
  display_name text,
  role text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cfdi_security_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  telegram_chat_id text,
  telegram_user_id text,
  user_id text,
  action text,
  allowed boolean NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cfdi_sensitive_action_log (
  action_id text PRIMARY KEY,
  user_id text,
  action text,
  entity_type text,
  entity_id text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cfdi_authorized_users_chat ON cfdi_authorized_users (telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_authorized_users_telegram_user ON cfdi_authorized_users (telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_authorized_users_role ON cfdi_authorized_users (role);
CREATE INDEX IF NOT EXISTS idx_cfdi_authorized_users_enabled ON cfdi_authorized_users (enabled);

CREATE INDEX IF NOT EXISTS idx_cfdi_security_events_user_id ON cfdi_security_events (user_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_security_events_action ON cfdi_security_events (action);
CREATE INDEX IF NOT EXISTS idx_cfdi_security_events_allowed ON cfdi_security_events (allowed);
CREATE INDEX IF NOT EXISTS idx_cfdi_security_events_created_at ON cfdi_security_events (created_at);

CREATE INDEX IF NOT EXISTS idx_cfdi_sensitive_action_log_user_id ON cfdi_sensitive_action_log (user_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_sensitive_action_log_action ON cfdi_sensitive_action_log (action);
CREATE INDEX IF NOT EXISTS idx_cfdi_sensitive_action_log_entity ON cfdi_sensitive_action_log (entity_type, entity_id);

GRANT USAGE ON SCHEMA public TO cfdi_bot_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO cfdi_bot_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO cfdi_bot_user;
