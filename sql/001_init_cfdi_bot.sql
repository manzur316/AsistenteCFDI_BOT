-- CFDI Telegram bot local state for PostgreSQL.
-- Database expected: cfdi_bot

CREATE TABLE IF NOT EXISTS bot_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id bigint PRIMARY KEY,
  chat_id text,
  message_id text,
  text text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'RECEIVED',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS chat_states (
  chat_id text PRIMARY KEY,
  state text NOT NULL,
  original_text text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cfdi_drafts (
  draft_id text PRIMARY KEY,
  chat_id text NOT NULL,
  update_id bigint,
  message_original text,
  status text NOT NULL DEFAULT 'PENDIENTE',
  action text,
  ready_to_copy boolean NOT NULL DEFAULT false,
  requires_human_review boolean NOT NULL DEFAULT true,
  concept jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_3 jsonb NOT NULL DEFAULT '[]'::jsonb,
  telegram_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_events (
  event_id text PRIMARY KEY,
  chat_id text,
  update_id bigint,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS send_logs (
  send_log_id text PRIMARY KEY,
  chat_id text,
  update_id bigint,
  ok boolean NOT NULL DEFAULT false,
  error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_updates_chat_id ON telegram_updates (chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_updates_status ON telegram_updates (status);
CREATE INDEX IF NOT EXISTS idx_telegram_updates_received_at ON telegram_updates (received_at);
CREATE INDEX IF NOT EXISTS idx_chat_states_expires_at ON chat_states (expires_at);
CREATE INDEX IF NOT EXISTS idx_cfdi_drafts_chat_id ON cfdi_drafts (chat_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_drafts_status ON cfdi_drafts (status);
CREATE INDEX IF NOT EXISTS idx_cfdi_drafts_created_at ON cfdi_drafts (created_at);
CREATE INDEX IF NOT EXISTS idx_bot_events_chat_id ON bot_events (chat_id);
CREATE INDEX IF NOT EXISTS idx_bot_events_event_type ON bot_events (event_type);
CREATE INDEX IF NOT EXISTS idx_bot_events_created_at ON bot_events (created_at);
CREATE INDEX IF NOT EXISTS idx_send_logs_chat_id ON send_logs (chat_id);
CREATE INDEX IF NOT EXISTS idx_send_logs_update_id ON send_logs (update_id);
CREATE INDEX IF NOT EXISTS idx_send_logs_ok ON send_logs (ok);
CREATE INDEX IF NOT EXISTS idx_send_logs_created_at ON send_logs (created_at);

INSERT INTO bot_state (key, value, updated_at)
VALUES (
  'telegram',
  jsonb_build_object(
    'lastTelegramUpdateId', 0,
    'processedUpdateIds', jsonb_build_array(),
    'workflowVersion', 'CFDI_POSTGRES_POLLING_V1'
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;
