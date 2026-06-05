-- Invoice status and payment status separation for local CFDI bot.
-- Database expected: cfdi_bot
--
-- Principle:
-- invoice_status != payment_status
--
-- This migration is additive. It keeps the legacy cfdi_drafts.status column for
-- compatibility and introduces explicit invoice/payment state fields.
-- Production status values are documented for future phases only.

ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS invoice_status text;
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'NO_APLICA';
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS payment_due_at timestamptz;
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS payment_paid_at timestamptz;
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS payment_amount_paid numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cfdi_drafts ADD COLUMN IF NOT EXISTS payment_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE cfdi_drafts
SET invoice_status = CASE
  WHEN status = 'PENDIENTE' THEN 'BORRADOR'
  WHEN status = 'APROBADO' THEN 'APROBADO'
  WHEN status = 'SANDBOX_TIMBRANDO' THEN 'SANDBOX_TIMBRANDO'
  WHEN status = 'SANDBOX_TIMBRADO' THEN 'SANDBOX_TIMBRADO'
  WHEN status = 'SANDBOX_ERROR' THEN 'SANDBOX_ERROR'
  WHEN status = 'SANDBOX_CANCELANDO' THEN 'SANDBOX_CANCELANDO'
  WHEN status = 'SANDBOX_CANCELADO' THEN 'SANDBOX_CANCELADO'
  WHEN status = 'SANDBOX_CANCEL_ERROR' THEN 'SANDBOX_CANCEL_ERROR'
  WHEN status = 'PRODUCCION_TIMBRADO_FUTURO' THEN 'PRODUCCION_TIMBRADO_FUTURO'
  WHEN status = 'PRODUCCION_CANCELADO_FUTURO' THEN 'PRODUCCION_CANCELADO_FUTURO'
  ELSE COALESCE(invoice_status, 'BORRADOR')
END
WHERE invoice_status IS NULL;

UPDATE cfdi_drafts
SET payment_status = CASE
  WHEN invoice_status IN ('BORRADOR', 'APROBADO', 'SANDBOX_CANCELADO', 'PRODUCCION_CANCELADO_FUTURO') THEN 'NO_APLICA'
  WHEN invoice_status = 'SANDBOX_TIMBRADO' AND payment_status = 'NO_APLICA' THEN 'PENDIENTE'
  ELSE payment_status
END
WHERE payment_status IS NULL
   OR invoice_status IN ('BORRADOR', 'APROBADO', 'SANDBOX_CANCELADO', 'PRODUCCION_CANCELADO_FUTURO')
   OR (invoice_status = 'SANDBOX_TIMBRADO' AND payment_status = 'NO_APLICA');

ALTER TABLE cfdi_drafts ALTER COLUMN invoice_status SET DEFAULT 'BORRADOR';
ALTER TABLE cfdi_drafts ALTER COLUMN invoice_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cfdi_drafts_invoice_status'
  ) THEN
    ALTER TABLE cfdi_drafts ADD CONSTRAINT chk_cfdi_drafts_invoice_status CHECK (
      invoice_status IN (
        'BORRADOR',
        'APROBADO',
        'SANDBOX_TIMBRANDO',
        'SANDBOX_TIMBRADO',
        'SANDBOX_ERROR',
        'SANDBOX_CANCELANDO',
        'SANDBOX_CANCELADO',
        'SANDBOX_CANCEL_ERROR',
        'PRODUCCION_TIMBRADO_FUTURO',
        'PRODUCCION_CANCELADO_FUTURO'
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cfdi_drafts_payment_status'
  ) THEN
    ALTER TABLE cfdi_drafts ADD CONSTRAINT chk_cfdi_drafts_payment_status CHECK (
      payment_status IN (
        'NO_APLICA',
        'PENDIENTE',
        'PARCIAL',
        'PAGADO',
        'VENCIDO'
      )
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cfdi_payment_status_events (
  event_id text PRIMARY KEY,
  draft_id text NOT NULL REFERENCES cfdi_drafts(draft_id),
  chat_id text,
  previous_payment_status text,
  new_payment_status text NOT NULL,
  invoice_status text NOT NULL,
  amount numeric(12,2),
  note text,
  idempotency_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event types expected by the local Action Layer/UI adapter:
-- PAYMENT_STATUS_SET_PENDING
-- PAYMENT_STATUS_MARKED_PAID
-- PAYMENT_STATUS_MARKED_PARTIAL
-- PAYMENT_STATUS_MARKED_OVERDUE
-- PAYMENT_STATUS_CHANGE_BLOCKED

CREATE UNIQUE INDEX IF NOT EXISTS idx_cfdi_payment_status_events_idempotency
  ON cfdi_payment_status_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cfdi_drafts_invoice_status ON cfdi_drafts (invoice_status);
CREATE INDEX IF NOT EXISTS idx_cfdi_drafts_payment_status ON cfdi_drafts (payment_status);
CREATE INDEX IF NOT EXISTS idx_cfdi_drafts_client_invoice_payment
  ON cfdi_drafts (client_id, invoice_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_cfdi_drafts_payment_due_at ON cfdi_drafts (payment_due_at);
CREATE INDEX IF NOT EXISTS idx_cfdi_payment_status_events_draft_id ON cfdi_payment_status_events (draft_id);
CREATE INDEX IF NOT EXISTS idx_cfdi_payment_status_events_created_at ON cfdi_payment_status_events (created_at);

CREATE OR REPLACE VIEW cfdi_invoice_payment_state AS
SELECT
  d.draft_id,
  d.chat_id,
  d.client_id,
  d.client_snapshot,
  d.invoice_status,
  d.payment_status,
  d.total,
  d.payment_amount_paid,
  d.payment_due_at,
  d.payment_paid_at,
  d.created_at,
  d.updated_at,
  (d.invoice_status = 'SANDBOX_TIMBRADO') AS active_invoice,
  (d.invoice_status IN ('SANDBOX_CANCELADO', 'PRODUCCION_CANCELADO_FUTURO')) AS cancelled_invoice,
  CASE
    WHEN d.invoice_status = 'SANDBOX_TIMBRADO' THEN COALESCE(d.total, 0)
    ELSE 0
  END AS active_total,
  CASE
    WHEN d.invoice_status = 'SANDBOX_TIMBRADO' AND d.payment_status IN ('PENDIENTE', 'VENCIDO') THEN COALESCE(d.total, 0)
    WHEN d.invoice_status = 'SANDBOX_TIMBRADO' AND d.payment_status = 'PARCIAL' THEN GREATEST(COALESCE(d.total, 0) - COALESCE(d.payment_amount_paid, 0), 0)
    ELSE 0
  END AS pending_total,
  CASE
    WHEN d.invoice_status = 'SANDBOX_TIMBRADO' AND d.payment_status = 'PAGADO' THEN COALESCE(d.total, 0)
    WHEN d.invoice_status = 'SANDBOX_TIMBRADO' AND d.payment_status = 'PARCIAL' THEN COALESCE(d.payment_amount_paid, 0)
    ELSE 0
  END AS paid_total,
  CASE
    WHEN d.invoice_status IN ('SANDBOX_CANCELADO', 'PRODUCCION_CANCELADO_FUTURO') THEN COALESCE(d.total, 0)
    ELSE 0
  END AS cancelled_total
FROM cfdi_drafts d;

CREATE OR REPLACE VIEW cfdi_client_invoice_payment_summary AS
SELECT
  client_id,
  count(*)::int AS invoice_count,
  count(*) FILTER (WHERE active_invoice)::int AS active_count,
  count(*) FILTER (WHERE cancelled_invoice)::int AS cancelled_count,
  sum(active_total)::numeric(12,2) AS active_total,
  sum(pending_total)::numeric(12,2) AS pending_total,
  sum(paid_total)::numeric(12,2) AS paid_total,
  sum(cancelled_total)::numeric(12,2) AS cancelled_total
FROM cfdi_invoice_payment_state
GROUP BY client_id;

-- Query examples:
-- Facturas por cliente:
-- SELECT * FROM cfdi_invoice_payment_state WHERE client_id = 'CLIENT-ID' ORDER BY updated_at DESC;
-- Facturas pendientes de pago:
-- SELECT * FROM cfdi_invoice_payment_state WHERE active_invoice AND payment_status IN ('PENDIENTE', 'PARCIAL', 'VENCIDO');
-- Facturas pagadas:
-- SELECT * FROM cfdi_invoice_payment_state WHERE active_invoice AND payment_status = 'PAGADO';
-- Facturas vencidas:
-- SELECT * FROM cfdi_invoice_payment_state WHERE active_invoice AND payment_status = 'VENCIDO';
-- Facturas canceladas:
-- SELECT * FROM cfdi_invoice_payment_state WHERE cancelled_invoice;
-- Resumen por cliente:
-- SELECT * FROM cfdi_client_invoice_payment_summary ORDER BY client_id;

GRANT USAGE ON SCHEMA public TO cfdi_bot_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfdi_bot_user;
GRANT SELECT ON cfdi_invoice_payment_state TO cfdi_bot_user;
GRANT SELECT ON cfdi_client_invoice_payment_summary TO cfdi_bot_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cfdi_bot_user;
