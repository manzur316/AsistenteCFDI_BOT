# Phase 7.13 - Monthly Billing Dashboard

## Status

Implemented as a read-only Telegram dashboard for monthly sandbox billing and
collection visibility.

This phase does not implement a definitive tax declaration, automatic
collection, bank reconciliation, production PAC calls or production CFDI
stamping.

## Scope

The dashboard summarizes the local invoice/payment ledger by period:

- `invoice_status`
- `payment_status`
- client ledger rows
- aging buckets from the 7.12 billing view

The period defaults to the current local month. The helper accepts a `YYYY-MM`
period for internal calls. The Telegram workflow currently uses the current
local period; month selection is left for a future explicit phase.

## Business Rules

- `SANDBOX_TIMBRADO + PENDIENTE` counts as pending.
- `SANDBOX_TIMBRADO + PARCIAL` counts as partial and uses remaining balance.
- `SANDBOX_TIMBRADO + PAGADO` counts as paid.
- `SANDBOX_TIMBRADO + VENCIDO` counts as overdue.
- `SANDBOX_CANCELADO` is shown separately and does not count as active income.
- `BORRADOR` and `APROBADO` are shown as non-active document states when
  present, but do not count as active collection.
- Future production statuses remain out of scope.
- Records without enough date information are counted in `UNKNOWN_DATE`; the
  bot does not invent dates.

## Dashboard Content

Telegram output includes:

- period
- active sandbox invoices
- sandbox stamped count
- sandbox cancelled count, separated
- sandbox error count
- billing totals by payment status
- global aging buckets
- top clients with open balance
- warnings for missing dates or unreliable amounts
- human review legend

If there are no records for the period, the bot responds:

```text
No hay facturas sandbox registradas para este periodo.
```

## Helper

Pure helper:

```text
scripts/lib/monthly-billing-dashboard-view.js
```

Exports:

- `MONTHLY_BILLING_DASHBOARD_VIEW_VERSION`
- `sanitizeMonthlyBillingRecord`
- `getDefaultBillingPeriod`
- `normalizePeriod`
- `buildMonthlyBillingDashboardView`
- `renderMonthlyBillingDashboardText`
- `buildSafeMonthlyBillingDashboardKeyboard`

## Telegram UX

Entry point:

```text
Menu principal -> Reporte mensual
```

Callback:

```text
cfdi_nav:report
```

Suggested buttons:

- Ver clientes con saldo
- Ver vencidas
- Ver pagadas
- Ver canceladas
- Paquete contador (OWNER/admin desde 7.14)
- Menu principal

The workflow keeps the existing action name `COMMAND_RESUMEN` for compatibility
while rendering the new monthly billing dashboard text.

## Safety

The dashboard does not expose:

- full RFC
- UUID
- UID
- absolute paths
- XML/PDF/ZIP/Excel
- CSD
- `.env`
- tokens or credentials
- real customer data

The view keeps the required warning:

```text
Borrador sujeto a revision humana. No sustituye contador.
```

## No-go

This phase does not:

- implement a definitive tax declaration;
- collect money automatically;
- reconcile bank transactions;
- modify `invoice_status`;
- modify `payment_status`;
- call a PAC;
- stamp production CFDI;
- send XML/PDF/ZIP/Excel through Telegram;
- modify storage;
- modify `data/concepts.normalized.json`;
- version runtime artifacts.

## Tests

Primary test:

```powershell
node scripts/test-monthly-billing-dashboard-view.js
```

Regression tests:

```powershell
node scripts/test-client-billing-summary-view.js
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
7.14 Accountant Package Product Integration
```
