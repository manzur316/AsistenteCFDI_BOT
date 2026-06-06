# Phase 7.10 - Client Invoice Ledger View

Status: implemented as a safe local Telegram view and pure helper.

## Objective

Expose a consultable client invoice ledger in the primary Telegram flow using
the 7.9 separation between `invoice_status` and `payment_status`.

This phase is informational. It does not collect money, reconcile banks, stamp
production CFDI, cancel production CFDI, call a production PAC or send files by
Telegram.

## Surfaces

Primary workflow:

```text
workflow/cfdi_telegram_local_ingest.n8n.json
```

Pure helper:

```text
scripts/lib/client-invoice-ledger-view.js
```

Test:

```text
scripts/test-client-invoice-ledger-view.js
```

## Telegram Navigation

The Clients menu now includes safe callbacks:

```text
cfdi_nav:client_ledger
cfdi_nav:pay_pending
cfdi_nav:pay_paid
cfdi_nav:pay_cancel
```

All callbacks stay within the `cfdi_nav:*` namespace, are shorter than 32
characters and do not include RFC, UUID, UID, amounts, routes, XML/PDF/ZIP/Excel,
tokens or secrets.

## Ledger Content

The view can render:

- invoices grouped by client;
- current `invoice_status`;
- current `payment_status`;
- active pending totals;
- paid totals;
- cancelled totals separated from active totals;
- recent safe draft references.

Example safe shape:

```text
Facturas por cliente
Borrador sujeto a revision humana. No sustituye contador.

Cliente: Privada Rivera (CLIENT-PRIVADA-RIVERA)
Facturas sandbox:
- SANDBOX_TIMBRADO | PENDIENTE | $10150.00 | DRAFT-LEDGER-001
- SANDBOX_TIMBRADO | PAGADO | $5000.00 | DRAFT-LEDGER-002
- SANDBOX_CANCELADO | NO_APLICA | $7500.00 | DRAFT-LEDGER-003

Totales activos:
Pendiente: $10150.00
Pagado: $5000.00
Cancelado separado: $7500.00
```

## Data Sources

The workflow reads the 7.9 views when the migration is applied:

```text
cfdi_invoice_payment_state
cfdi_client_invoice_payment_summary
```

It falls back to recent drafts inside the Code Node when the ledger input is
empty. The fallback is only a view layer and does not alter payment state.

## Safety Decisions

- RFC is hidden in `/cliente` output touched by this phase.
- The final Telegram output does not need to preserve full client records,
  ledger input rows, tax rules or catalog path.
- Cancelled sandbox invoices are shown separately from active pending/paid
  totals.
- Payment state changes remain guarded by the 7.9 payment status model and are
  not exposed as operational Telegram actions in this phase.

## No-go

This phase does not:

- implement automatic collection;
- implement bank reconciliation;
- call a production PAC;
- timbrar CFDI real;
- cancel production CFDI;
- send XML/PDF/ZIP/Excel through Telegram;
- modify `data/concepts.normalized.json`;
- version `runtime/`;
- change fiscal scoring decisions.

## Tests

```powershell
node scripts/test-client-invoice-ledger-view.js
node scripts/test-invoice-payment-status-model.js
node scripts/test-local-ingest-workflow-contract.js
node scripts/test-local-ingest-response-contract.js
node scripts/test-local-ingest-security-enforcement.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
```

## Next Phase

Recommended next phase:

```text
7.11 Payment Status Command Adapter
```

The next slice should define explicit, guarded text/token actions for marking
sandbox invoices as paid, partial, pending or overdue, without enabling
automatic collection or bank reconciliation.
