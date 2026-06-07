-- 011_tenant_fiscal_profile_rules.sql
-- Additive Tenant Fiscal Profile + invoice policy + activity rules foundation.
-- Builds on 009_provider_multitenant_foundation.sql without destructive changes.

CREATE TABLE IF NOT EXISTS satbot_tenants (
  tenant_id text PRIMARY KEY,
  display_name text NOT NULL,
  tenant_type text NOT NULL DEFAULT 'PERSONAL',
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO satbot_tenants (tenant_id, display_name, tenant_type, status)
VALUES ('TENANT_PERSONAL_DEFAULT', 'Personal default tenant', 'PERSONAL', 'ACTIVE')
ON CONFLICT (tenant_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_fiscal_profiles (
  profile_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES satbot_tenants(tenant_id),
  rfc text,
  razon_social text,
  tipo_persona text,
  regimen_fiscal text,
  codigo_postal_fiscal text,
  default_uso_cfdi text,
  default_moneda text,
  default_lugar_expedicion text,
  human_review_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_fiscal_profiles ADD COLUMN IF NOT EXISTS tipo_persona text;
ALTER TABLE tenant_fiscal_profiles ADD COLUMN IF NOT EXISTS default_uso_cfdi text;
ALTER TABLE tenant_fiscal_profiles ADD COLUMN IF NOT EXISTS default_moneda text;
ALTER TABLE tenant_fiscal_profiles ADD COLUMN IF NOT EXISTS default_lugar_expedicion text;
ALTER TABLE tenant_fiscal_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS tenant_fiscal_activity_links (
  activity_link_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES satbot_tenants(tenant_id),
  profile_id text REFERENCES tenant_fiscal_profiles(profile_id),
  activity_code text NOT NULL,
  activity_name text,
  activity_source text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_invoice_policy (
  policy_id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES satbot_tenants(tenant_id),
  profile_id text REFERENCES tenant_fiscal_profiles(profile_id),
  default_metodo_pago text,
  default_forma_pago text,
  default_tax_mode text,
  allow_ppd boolean NOT NULL DEFAULT true,
  allow_pue boolean NOT NULL DEFAULT true,
  require_human_confirmation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_fiscal_profiles_tenant_status
  ON tenant_fiscal_profiles(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_tenant_fiscal_activity_links_tenant_profile
  ON tenant_fiscal_activity_links(tenant_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_tenant_invoice_policy_tenant_profile
  ON tenant_invoice_policy(tenant_id, profile_id);
