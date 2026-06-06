# Phase 7.14 - Accountant Package Product Integration

## Status

Implemented as a sandbox-only product integration.

This phase connects the Telegram product flow `Paquete contador` to the existing
Action Layer action:

```text
sandbox.full.monthly.package
```

It does not implement production PAC, real stamping, XML/PDF delivery,
declaration filing, or a web interface.

## Product Flow

```text
Menu principal
-> Reporte mensual
-> Paquete contador
-> Generar paquete mensual sandbox
-> Action Layer sandbox.full.monthly.package
-> runtime/accountant-packages-sandbox/YYYY-MM/
-> safe Telegram summary
```

The workflow remains:

```text
Telegram
-> runner/telegram-local-runner.js
-> workflow/cfdi_telegram_local_ingest.n8n.json
-> Action Layer
```

`workflow/cfdi_telegram_local_ingest.n8n.json` only routes the product callback
and summarizes stdout from the Action Layer. It does not duplicate package
generation logic.

## Roles

| Role | Package generation | Notes |
| --- | --- | --- |
| OWNER | Allowed | Can run `cfdi_nav:acctpkg`. |
| ASSISTANT_OPERATOR | Blocked | Cannot run accountant package generation. |
| ACCOUNTANT_READONLY | Blocked | Can view monthly report summary only. |

`ACCOUNTANT_READONLY` is intentionally limited to summary viewing in this product
flow. The package export is an OWNER/admin action because it creates local
artifacts under `runtime/`.

## Telegram Response Contract

For `sandbox.full.monthly.package`, Telegram receives a safe text summary with:

- period;
- status;
- Action Layer action;
- artifacts count;
- package generated flag;
- Excel generated flag;
- checklist generated flag;
- warnings count;
- errors count;
- sensitive findings count.

Required warnings are included:

```text
Paquete sandbox local. No es declaracion fiscal.
Borrador sujeto a revision humana. No sustituye contador.
```

The response never attaches or sends files.

## Files Not Sent By Telegram

The product flow must not send:

- ZIP;
- Excel;
- XML;
- PDF;
- CSV;
- JSON;
- runtime paths;
- CSD;
- `.env`;
- PAC credentials;
- real client data.

Artifacts remain local under ignored `runtime/` directories.

## Error UX

If the Action Layer returns `NEEDS_RUNTIME`, `NEEDS_CONFIG`,
`PACKAGE_SAFETY_ERROR`, or `ERROR`, Telegram still receives a safe summary with
counts and recommendations to review local runtime/Action Layer diagnostics.

No full paths, XML/PDF content, secrets, RFC, UUID, UID, or credentials are
included in the Telegram text.

## Files Changed

- `workflow/cfdi_telegram_local_ingest.n8n.json`
- `scripts/lib/accountant-package-product-view.js`
- `scripts/test-accountant-package-product-integration.js`
- role/menu/security tests and docs

## Tests

Primary test:

```powershell
node scripts/test-accountant-package-product-integration.js
```

Relevant regression tests:

```powershell
node scripts/test-monthly-billing-dashboard-view.js
node scripts/test-client-billing-summary-view.js
node scripts/test-payment-status-command-adapter.js
node scripts/test-client-invoice-ledger-view.js
node scripts/test-local-ingest-workflow-contract.js
node scripts/test-local-ingest-response-contract.js
node scripts/test-local-ingest-security-enforcement.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
```

## No-Go

- No production PAC.
- No real timbrado.
- No definitive tax declaration.
- No Telegram file delivery.
- No changes to `data/concepts.normalized.json`.
- No runtime versioning.

## Next Phase

Recommended next phase:

```text
7.15 Telegram Product E2E Signoff
```
