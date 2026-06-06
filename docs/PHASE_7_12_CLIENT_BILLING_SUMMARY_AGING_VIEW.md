# Phase 7.12 - Client Billing Summary and Aging View

## Status

Implemented as a local Telegram product view for sandbox invoice collection
visibility.

This phase adds a read-only billing summary and aging view. It does not collect
money, reconcile bank movements, call a production PAC, stamp real CFDI or send
documents through Telegram.

## Scope

The view summarizes local sandbox invoices by client using:

- `invoice_status`
- `payment_status`
- invoice/payment dates when available
- local ledger data already loaded by the primary Telegram workflow

## Business Rules

- `SANDBOX_TIMBRADO + PENDIENTE` counts as pending.
- `SANDBOX_TIMBRADO + PARCIAL` counts as partial and contributes only the
  remaining balance to open balance.
- `SANDBOX_TIMBRADO + PAGADO` counts as paid.
- `SANDBOX_TIMBRADO + VENCIDO` counts as overdue.
- `SANDBOX_CANCELADO` is shown separately and does not count as active income.
- `BORRADOR` and `APROBADO` are ignored for active collection totals.
- Future production statuses remain out of scope.
- Missing dates are placed in `UNKNOWN_DATE`; the bot does not invent dates.

## Aging Buckets

Minimum buckets:

- `0_7`
- `8_15`
- `16_30`
- `31_60`
- `60_plus`
- `UNKNOWN_DATE`

## Helper

Pure helper:

```text
scripts/lib/client-billing-summary-view.js
```

Exports:

- `CLIENT_BILLING_SUMMARY_VIEW_VERSION`
- `AGING_BUCKETS`
- `sanitizeBillingRecord`
- `buildClientBillingSummaryView`
- `renderClientBillingSummaryText`
- `buildSafeBillingSummaryKeyboard`
- `classifyAgingBucket`
- `formatMoney`

## Telegram UX

The primary local ingest workflow now exposes safe product callbacks:

```text
cfdi_nav:billing
cfdi_nav:aging
```

Entry points:

- Product menu -> Clientes -> Resumen cobranza
- Product menu -> Clientes -> Resumen vencidos
- Ledger cliente -> Resumen cobranza
- Pendientes / vencidas flows can navigate back to the summary

Suggested buttons:

- Ver pendientes
- Ver pagadas
- Ver vencidas
- Ver canceladas
- Ver ledger cliente
- Volver

## Safety

The summary does not expose:

- full RFC
- UUID
- UID
- absolute paths
- XML/PDF/ZIP/Excel
- CSD
- `.env`
- tokens or credentials
- real customer data

The view keeps the required legend:

```text
Borrador sujeto a revision humana. No sustituye contador.
```

## No-go

This phase does not:

- implement automatic collection;
- implement bank reconciliation;
- modify `invoice_status`;
- modify `payment_status`;
- send payment reminders;
- call a production PAC;
- stamp production CFDI;
- send XML/PDF/ZIP/Excel through Telegram;
- modify `data/concepts.normalized.json`;
- version runtime artifacts.

## Tests

Primary test:

```powershell
node scripts/test-client-billing-summary-view.js
```

Regression tests:

```powershell
node scripts/test-payment-status-command-adapter.js
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
7.13 Monthly Billing Dashboard
```
