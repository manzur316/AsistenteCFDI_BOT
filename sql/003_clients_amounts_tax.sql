-- Clients, amounts and conservative tax draft support for local CFDI bot.
-- Database expected: cfdi_bot
-- This does not migrate the concept catalog to PostgreSQL.

CREATE TABLE IF NOT EXISTS cfdi_clients (
  client_id text PRIMARY KEY,
  display_name text NOT NULL,
  razon_social text,
  rfc text,
  tipo_persona text,
  regimen_fiscal text,
  regimen_fiscal_label text,
  codigo_postal_fiscal text,
  uso_cfdi_default text,
  tax_profile text,
  validated_by_human boolean NOT NULL DEFAULT false,
  notes text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cfdi_client_aliases (
  alias_id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES cfdi_clients(client_id),
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  weight int NOT NULL DEFAULT 10,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cfdi_tax_rules (
  rule_id text PRIMARY KEY,
  emitter_regimen text NOT NULL DEFAULT '626',
  emitter_tipo_persona text NOT NULL DEFAULT 'FISICA',
  receiver_tipo_persona text,
  receiver_tax_profile text,
  operation_type text,
  iva_rate numeric(8,6) NOT NULL DEFAULT 0.16,
  isr_retention_rate numeric(8,6) NOT NULL DEFAULT 0,
  iva_retention_rate numeric(8,6) NOT NULL DEFAULT 0,
  applies boolean NOT NULL DEFAULT true,
  requires_human_review boolean NOT NULL DEFAULT true,
  notes text,
  source_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cfdi_draft_line_items (
  line_id text PRIMARY KEY,
  draft_id text NOT NULL,
  line_number int NOT NULL,
  concept_id text,
  concepto_factura text,
  clave_prod_serv text,
  clave_unidad text,
  unidad text,
  family text,
  item_type text,
  operation_type text,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2),
  subtotal numeric(12,2),
  iva_rate numeric(8,6),
  iva_amount numeric(12,2),
  isr_retention_rate numeric(8,6),
  isr_retention_amount numeric(12,2),
  iva_retention_rate numeric(8,6),
  iva_retention_amount numeric(12,2),
  total numeric(12,2),
  tax_mode text,
  line_status text NOT NULL DEFAULT 'PENDIENTE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS client_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS tax_mode text;
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS subtotal numeric(12,2);
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS iva_amount numeric(12,2);
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS isr_retention_amount numeric(12,2);
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS iva_retention_amount numeric(12,2);
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS total numeric(12,2);
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS tax_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS tax_review_required boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_cfdi_clients_enabled ON cfdi_clients (enabled);
CREATE INDEX IF NOT EXISTS idx_cfdi_clients_tipo_persona ON cfdi_clients (tipo_persona);
CREATE INDEX IF NOT EXISTS idx_cfdi_client_aliases_client_id ON cfdi_client_aliases (client_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_client_aliases_normalized_alias ON cfdi_client_aliases (normalized_alias);
CREATE INDEX IF NOT EXISTS idx_cfdi_tax_rules_receiver ON cfdi_tax_rules (receiver_tipo_persona, receiver_tax_profile, operation_type);
CREATE INDEX IF NOT EXISTS idx_cfdi_draft_line_items_draft_id ON cfdi_draft_line_items (draft_id);

INSERT INTO cfdi_tax_rules (
  rule_id,
  receiver_tipo_persona,
  receiver_tax_profile,
  operation_type,
  iva_rate,
  isr_retention_rate,
  iva_retention_rate,
  applies,
  requires_human_review,
  notes,
  source_note
) VALUES
  ('RESICO-PF-PRODUCTO-CONSERVADOR', 'FISICA', 'PF_GENERAL', 'PRODUCTO', 0.16, 0, 0, true, true, 'Persona fisica receptora sin retenciones en borrador conservador.', 'BORRADOR SUJETO A REVISION HUMANA'),
  ('RESICO-PF-SERVICIO-CONSERVADOR', 'FISICA', 'PF_GENERAL', 'SERVICIO', 0.16, 0, 0, true, true, 'Persona fisica receptora sin retenciones en borrador conservador.', 'BORRADOR SUJETO A REVISION HUMANA'),
  ('RESICO-PF-INSTALACION-CONSERVADOR', 'FISICA', 'PF_GENERAL', 'SERVICIO_INSTALACION', 0.16, 0, 0, true, true, 'Instalacion tratada como servicio para borrador conservador.', 'BORRADOR SUJETO A REVISION HUMANA'),
  ('RESICO-PM-PRODUCTO-CONSERVADOR', 'MORAL', 'PM_GENERAL', 'PRODUCTO', 0.16, 0.0125, 0, true, true, 'Persona moral receptora: ISR 1.25%; IVA retencion en producto en cero para borrador conservador.', 'BORRADOR SUJETO A REVISION HUMANA'),
  ('RESICO-PM-SERVICIO-CONSERVADOR', 'MORAL', 'PM_GENERAL', 'SERVICIO', 0.16, 0.0125, 0.106667, true, true, 'Persona moral receptora: ISR 1.25% e IVA retencion configurable para servicios.', 'BORRADOR SUJETO A REVISION HUMANA'),
  ('RESICO-PM-INSTALACION-CONSERVADOR', 'MORAL', 'PM_GENERAL', 'SERVICIO_INSTALACION', 0.16, 0.0125, 0.106667, true, true, 'Instalacion tratada como servicio para persona moral.', 'BORRADOR SUJETO A REVISION HUMANA'),
  ('RESICO-PM-NO-LUCRO-PRODUCTO-CONSERVADOR', 'MORAL_SIN_FINES_LUCRO', 'PM_NO_LUCRATIVA', 'PRODUCTO', 0.16, 0.0125, 0, true, true, 'Moral sin fines de lucro tratada conservadoramente como persona moral.', 'BORRADOR SUJETO A REVISION HUMANA'),
  ('RESICO-PM-NO-LUCRO-SERVICIO-CONSERVADOR', 'MORAL_SIN_FINES_LUCRO', 'PM_NO_LUCRATIVA', 'SERVICIO', 0.16, 0.0125, 0.106667, true, true, 'Moral sin fines de lucro tratada conservadoramente como persona moral.', 'BORRADOR SUJETO A REVISION HUMANA'),
  ('RESICO-PM-NO-LUCRO-INSTALACION-CONSERVADOR', 'MORAL_SIN_FINES_LUCRO', 'PM_NO_LUCRATIVA', 'SERVICIO_INSTALACION', 0.16, 0.0125, 0.106667, true, true, 'Instalacion tratada como servicio para moral sin fines de lucro.', 'BORRADOR SUJETO A REVISION HUMANA'),
  ('RESICO-DESCONOCIDO-CONSERVADOR', 'DESCONOCIDO', 'DESCONOCIDO', NULL, 0.16, 0, 0, false, true, 'Si el receptor es desconocido no se calculan retenciones.', 'BORRADOR SUJETO A REVISION HUMANA')
ON CONFLICT (rule_id) DO NOTHING;

GRANT USAGE ON SCHEMA public TO cfdi_bot_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfdi_bot_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cfdi_bot_user;
