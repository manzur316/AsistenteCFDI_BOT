-- 009_provider_multitenant_foundation.sql
-- Additive foundation for SATBOT Core multi-tenant + multi-provider contracts.
-- No destructive changes. No production enablement. No credential material.

CREATE TABLE IF NOT EXISTS satbot_tenants (
  tenant_id text PRIMARY KEY,
  display_name text NOT NULL,
  tenant_type text NOT NULL DEFAULT 'PERSONAL',
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_fiscal_profiles (
  profile_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES satbot_tenants(tenant_id),
  rfc text,
  razon_social text,
  regimen_fiscal text,
  codigo_postal_fiscal text,
  tipo_persona text,
  human_review_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_fiscal_activities (
  activity_link_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES satbot_tenants(tenant_id),
  activity_code text,
  activity_name text,
  source text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_accounts (
  provider_account_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES satbot_tenants(tenant_id),
  provider text NOT NULL,
  environment text NOT NULL,
  provider_account_uid text,
  provider_organization_id text,
  auth_mode text,
  credentials_ref text,
  status text NOT NULL DEFAULT 'DRAFT',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_client_links (
  provider_client_link_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES satbot_tenants(tenant_id),
  client_id text NOT NULL,
  provider text NOT NULL,
  environment text NOT NULL,
  provider_client_id text,
  provider_client_uid text,
  provider_rfc text,
  provider_legal_name text,
  sync_status text NOT NULL DEFAULT 'NEEDS_SYNC',
  last_sync_at timestamptz,
  provider_response_sanitized jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_invoice_links (
  provider_invoice_link_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES satbot_tenants(tenant_id),
  draft_id text,
  client_id text,
  provider text NOT NULL,
  environment text NOT NULL,
  provider_invoice_id text,
  provider_invoice_uid text,
  uuid text,
  serie text,
  folio text,
  provider_status text,
  invoice_status text,
  cancellation_status text,
  payment_status_provider text,
  payment_status_local text,
  xml_downloaded boolean NOT NULL DEFAULT false,
  pdf_downloaded boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  provider_response_sanitized jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_usage_ledger (
  usage_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES satbot_tenants(tenant_id),
  provider text NOT NULL,
  environment text NOT NULL,
  movement_type text NOT NULL,
  quantity integer NOT NULL,
  reason text,
  provider_invoice_link_id text REFERENCES provider_invoice_links(provider_invoice_link_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_capabilities_snapshot (
  snapshot_id text PRIMARY KEY,
  provider text NOT NULL,
  environment text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'provider_capabilities_registry',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_fiscal_profiles_tenant ON tenant_fiscal_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_fiscal_activities_tenant ON tenant_fiscal_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_tenant_provider ON provider_accounts(tenant_id, provider, environment);
CREATE INDEX IF NOT EXISTS idx_provider_client_links_tenant_client ON provider_client_links(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_provider_client_links_provider ON provider_client_links(provider, environment, provider_client_id, provider_client_uid);
CREATE INDEX IF NOT EXISTS idx_provider_invoice_links_tenant_draft ON provider_invoice_links(tenant_id, draft_id);
CREATE INDEX IF NOT EXISTS idx_provider_invoice_links_provider ON provider_invoice_links(provider, environment, provider_invoice_id, provider_invoice_uid, uuid);
CREATE INDEX IF NOT EXISTS idx_provider_usage_ledger_tenant ON provider_usage_ledger(tenant_id, created_at);

INSERT INTO satbot_tenants (tenant_id, display_name, tenant_type, status)
VALUES ('TENANT_PERSONAL_DEFAULT', 'Personal default tenant', 'PERSONAL', 'ACTIVE')
ON CONFLICT (tenant_id) DO NOTHING;
