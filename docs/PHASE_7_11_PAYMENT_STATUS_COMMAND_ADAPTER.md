# Phase 7.11 - Payment Status Command Adapter

## Status

Implemented as a local Telegram product adapter for sandbox invoices.

This phase connects manual payment status changes from the primary Telegram
workflow without enabling collection, bank reconciliation, production PAC calls
or real fiscal stamping.

## Principle

```text
invoice_status != payment_status
```

`invoice_status` continues to describe the document/fiscal lifecycle.
`payment_status` describes collection state for local operational tracking.

## Supported Payment Statuses

- `PENDIENTE`
- `PARCIAL`
- `PAGADO`
- `VENCIDO`

Protected state:

- `NO_APLICA`

## Business Rules

- Only `SANDBOX_TIMBRADO` invoices can change payment status.
- `SANDBOX_CANCELADO` is blocked for `PENDIENTE`, `PARCIAL`, `PAGADO` and
  `VENCIDO`.
- `BORRADOR` and `APROBADO` remain `NO_APLICA` or block payment changes.
- Marking the same status twice is idempotent and does not duplicate the
  critical payment event.
- The adapter updates only `cfdi_drafts.payment_status`; it does not update
  `invoice_status`.
- Cancelled sandbox invoices remain excluded from active income totals.

## Telegram UX

The primary local ingest workflow now exposes action-token buttons on active
sandbox invoices:

- Marcar pendiente
- Marcar pagada
- Marcar parcial
- Marcar vencida
- Ver ledger cliente
- Volver

Buttons use the existing short action token callback format:

```text
cfdi:<token>
```

The callback payload stays in PostgreSQL/local workflow context and does not
put RFC, UUID, UID, client data, amount, routes, XML/PDF names or secrets in
`callback_data`.

## Events

Payment status changes write to:

```text
cfdi_payment_status_events
```

The event name is stored in the safe JSON payload because the existing table
does not have a dedicated `event_type` column.

Expected event names:

- `PAYMENT_STATUS_SET_PENDING`
- `PAYMENT_STATUS_MARKED_PAID`
- `PAYMENT_STATUS_MARKED_PARTIAL`
- `PAYMENT_STATUS_MARKED_OVERDUE`
- `PAYMENT_STATUS_CHANGE_BLOCKED`

Blocked changes may also appear in normal `bot_events` through the workflow's
standard response event logging.

## Helper

Pure helper added:

```text
scripts/lib/payment-status-action.js
```

Exports:

- `setInvoicePaymentStatus`
- `markInvoicePending`
- `markInvoicePaid`
- `markInvoicePartial`
- `markInvoiceOverdue`
- `buildPaymentStatusChangeResult`

The helper reuses `scripts/lib/invoice-payment-status-model.js` and returns a
sanitized invoice snapshot so tests can verify behavior without exposing RFC,
UUID, absolute paths, secrets or file references.

## No-go

This phase does not:

- collect money automatically;
- reconcile bank transactions;
- call PAC production;
- stamp production CFDI;
- cancel production CFDI;
- send XML/PDF/ZIP/Excel through Telegram;
- modify `data/concepts.normalized.json`;
- modify runtime artifacts;
- change fiscal scoring decisions.

## Tests

Primary test:

```powershell
node scripts/test-payment-status-command-adapter.js
```

Relevant regression tests:

```powershell
node scripts/test-invoice-payment-status-model.js
node scripts/test-client-invoice-ledger-view.js
node scripts/test-local-startup-and-stamp-diagnostics.js
node scripts/test-telegram-bot-latency-observability.js
node scripts/test-telegram-callback-reliability-idempotency.js
node scripts/test-local-ingest-workflow-contract.js
node scripts/test-local-ingest-response-contract.js
node scripts/test-local-ingest-security-enforcement.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
```

## Next Phase

Recommended next phase:

```text
7.12 Client Billing Summary and Aging View
```
