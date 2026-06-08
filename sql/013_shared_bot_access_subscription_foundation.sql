-- 013_shared_bot_access_subscription_foundation.sql
-- Shared Telegram bot identity + subscription access foundation.
-- Additive only. No billing implementation. No secrets. No destructive changes.

CREATE TABLE IF NOT EXISTS channel_identities (
  channel_identity_id text PRIMARY KEY,
  channel text NOT NULL,
  channel_user_id text NOT NULL,
  chat_id text,
  username text,
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  linked_at timestamptz DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  membership_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  product_mode text,
  default_emitter_id text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  subscription_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  plan_code text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_entitlements (
  entitlement_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  entitlement text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitation_tokens (
  invite_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  product_mode text,
  emitter_id text,
  target_channel text,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamptz,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  created_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_credit_ledger (
  usage_credit_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  movement_type text NOT NULL,
  quantity integer NOT NULL,
  reason text,
  source_ref text,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_identities_channel_user
ON channel_identities(channel, channel_user_id);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_user
ON tenant_memberships(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_status
ON tenant_subscriptions(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_invitation_tokens_token_hash
ON invitation_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_usage_credit_ledger_tenant_created
ON usage_credit_ledger(tenant_id, created_at);
