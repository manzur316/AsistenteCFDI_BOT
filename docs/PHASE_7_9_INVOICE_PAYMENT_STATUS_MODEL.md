# Phase 7.9 - Invoice Status and Payment Status Model

Status: implemented as local model, SQL migration and tests.

## Principle

```text
invoice_status != payment_status
```

`invoice_status` describes the CFDI/document lifecycle.

`payment_status` describes collection/payment state.

This phase does not enable production stamping, production cancellation,
automatic collection, bank reconciliation or document delivery through
Telegram.

## Document Statuses

Current supported document statuses:

```text
BORRADOR
APROBADO
SANDBOX_TIMBRANDO
SANDBOX_TIMBRADO
SANDBOX_ERROR
SANDBOX_CANCELANDO
SANDBOX_CANCELADO
SANDBOX_CANCEL_ERROR
PRODUCCION_TIMBRADO_FUTURO
PRODUCCION_CANCELADO_FUTURO
```

Production statuses are documented placeholders only. They are not active
production operations.

## Payment Statuses

Current supported payment statuses:

```text
NO_APLICA
PENDIENTE
PARCIAL
PAGADO
VENCIDO
```

Rules:

- `BORRADOR` and `APROBADO` normally use `NO_APLICA`.
- `SANDBOX_TIMBRADO` may use `PENDIENTE`, `PARCIAL`, `PAGADO` or `VENCIDO`.
- `SANDBOX_CANCELADO` is excluded from active income totals.
- Cancelled invoices may keep payment history, but active payment changes are
  blocked unless a future explicit policy allows it.
- Future production statuses are blocked in this phase.
- All totals remain sandbox/local and subject to human review.

## SQL Migration

Migration:

```text
sql/007_invoice_payment_status.sql
```

The migration is additive and keeps legacy `cfdi_drafts.status` for
compatibility. It adds:

- `cfdi_drafts.invoice_status`
- `cfdi_drafts.payment_status`
- `cfdi_drafts.payment_due_at`
- `cfdi_drafts.payment_paid_at`
- `cfdi_drafts.payment_amount_paid`
- `cfdi_drafts.payment_summary`
- `cfdi_payment_status_events`
- `cfdi_invoice_payment_state`
- `cfdi_client_invoice_payment_summary`

Supported queries:

- invoices by client;
- pending payment invoices;
- paid invoices;
- overdue invoices;
- cancelled invoices;
- summary by client.

## Model Helper

Helper:

```text
scripts/lib/invoice-payment-status-model.js
```

Exports:

- `normalizeInvoiceStatus`
- `normalizePaymentStatus`
- `isActiveInvoiceStatus`
- `isCancelledInvoiceStatus`
- `canMarkPaymentPending`
- `canMarkPaid`
- `canMarkPartial`
- `canMarkOverdue`
- `expectedPaymentStatusForInvoiceStatus`
- `evaluatePaymentStatusChange`
- `buildPaymentStatusEvent`
- `buildClientInvoiceSummary`

Idempotency rule:

- Marking an already `PAGADO` invoice as `PAGADO` returns an idempotent result
  and does not require a duplicate critical event.

Blocked transitions produce:

```text
PAYMENT_STATUS_CHANGE_BLOCKED
```

Allowed event names:

```text
PAYMENT_STATUS_SET_PENDING
PAYMENT_STATUS_MARKED_PAID
PAYMENT_STATUS_MARKED_PARTIAL
PAYMENT_STATUS_MARKED_OVERDUE
PAYMENT_STATUS_CHANGE_BLOCKED
```

## Client Summary Example

Future Telegram/client views can render safe summaries like:

```text
Cliente: CLIENT-PRIVADA-RIVERA

Facturas sandbox:
- SANDBOX_TIMBRADO | PENDIENTE | 10150
- SANDBOX_TIMBRADO | PAGADO | 5000
- SANDBOX_CANCELADO | NO_APLICA | 7500

Totales activos:
Pendiente: ...
Pagado: ...
Cancelado separado: ...
```

The helper sanitizes visible client/draft references and does not expose RFC,
UUID, UID, absolute paths, tokens or secrets.

## Storage Review Warnings

The current 7.8 storage review reports:

```text
SANDBOX_TIMBRADO=2
SANDBOX_CANCELADO=1
sensitive findings=0
warnings=4
```

Warning classification:

| Warning | Classification | Notes |
| --- | --- | --- |
| `status_history_missing` | `NEEDS_REVIEW` | Historical sandbox records may predate status-history files. Not a blocker for 7.9. |
| `cancelled_document_missing_original_xml_or_pdf` | `NEEDS_REVIEW` | One existing sandbox cancellation record lacks original XML/PDF in that document folder. It should be reviewed before sharing a package, but it does not block payment-status modeling. |

No warning is classified as `BLOCKER` for this phase because:

- sensitive findings are `0`;
- runtime remains local and ignored by Git;
- payment-state modeling does not mutate or delete artifacts;
- production PAC remains blocked.

## No-go

This phase does not:

- call a production PAC;
- call any production stamping function;
- timbrar CFDI real;
- cancel production invoices;
- implement automatic collection;
- implement bank reconciliation;
- send XML/PDF/ZIP/Excel through Telegram;
- modify `data/concepts.normalized.json`;
- version `runtime/`;
- change fiscal scoring decisions.

## Tests

```powershell
node scripts/test-invoice-payment-status-model.js
node scripts/test-sandbox-lifecycle-storage-review.js
node scripts/test-sandbox-human-readable-storage-naming.js
node scripts/test-sandbox-cfdi-lifecycle-cancellation.js
node scripts/test-approved-draft-to-pac-sandbox.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
```

## Next Phase

Recommended next phase:

```text
7.10 Client Invoice Ledger View
```
