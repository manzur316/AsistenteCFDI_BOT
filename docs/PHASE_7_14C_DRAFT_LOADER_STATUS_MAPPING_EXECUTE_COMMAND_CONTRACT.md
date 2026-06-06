# Phase 7.14C - Draft Loader, Status Mapping and Execute Command Contract

Status: implemented as a corrective hotfix before 7.15.

## Scope

This phase fixes the real sandbox stamp path:

```powershell
node scripts/run-sandbox-action.js sandbox.draft.stamp --draft-id "DRAFT-..."
```

The Action Layer can now resolve `--draft-id` through local PostgreSQL when no
embedded `--draft-json-b64` snapshot is provided. The CLI still prints one
stable JSON object for controlled errors and exits with code `0` for business,
configuration, validation, or local runtime errors that n8n can safely parse.

No new business feature was added.

## Draft Loader

The loader lives in:

```text
scripts/lib/sandbox-draft-db-loader.js
```

It reads the local database using `psql` and safe local configuration from:

```text
CFDI_PGHOST / POSTGRES_HOST / PGHOST
CFDI_PGPORT / POSTGRES_PORT / PGPORT
CFDI_PGDATABASE / POSTGRES_DB / PGDATABASE
CFDI_PGUSER / POSTGRES_USER / PGUSER
CFDI_PGPASSWORD / POSTGRES_PASSWORD / PGPASSWORD
CFDI_PSQL_BIN / PSQL_BIN
```

Defaults:

```text
host=127.0.0.1
port=5432
database=cfdi_bot
user=cfdi_bot_user
```

The query loads:

- `cfdi_drafts`;
- `cfdi_clients` when `client_snapshot` needs hydration;
- `cfdi_draft_line_items` when line item detail exists.

It normalizes the row into the same draft shape accepted by
`sandbox.draft.stamp`.

## CLI Contract

`scripts/run-sandbox-action.js` now treats controlled Action Layer results as
parseable output, not process failures:

| Condition | stdout | exit code |
| --- | --- | --- |
| `OK` | stable JSON | `0` |
| `ERROR` validation/business | stable JSON | `0` |
| `NEEDS_CONFIG` | stable JSON | `0` |
| `NEEDS_RUNTIME` | stable JSON | `0` |
| unhandled CLI crash | stable JSON fallback | `1` |

Important stable classes:

```text
DRAFT_CONTEXT_MISSING
DRAFT_DB_LOAD_FAILED
DRAFT_VALIDATION_ERROR
DRAFT_JSON_INVALID
CANONICAL_DRAFT_NOT_READY
CANONICAL_INVOICE_NOT_READY
CANONICAL_PAC_REQUEST_NOT_READY
PAC_SANDBOX_ERROR
```

For a missing draft, the JSON contains:

```json
{
  "status": "ERROR",
  "error_class": "DRAFT_CONTEXT_MISSING",
  "errors": ["DRAFT_NOT_FOUND"]
}
```

## Status Mapping

The workflow now keeps the 7.9 separation:

| Field | Meaning |
| --- | --- |
| `status` | legacy draft/conversation status: `PENDIENTE`, `APROBADO`, `DESCARTADO` |
| `invoice_status` | document/sandbox status: `BORRADOR`, `APROBADO`, `SANDBOX_TIMBRANDO`, `SANDBOX_TIMBRADO`, `SANDBOX_ERROR`, `SANDBOX_CANCELADO` |
| `payment_status` | payment state: `NO_APLICA`, `PENDIENTE`, `PARCIAL`, `PAGADO`, `VENCIDO` |

For `sandbox.draft.stamp`:

- start: `invoice_status = SANDBOX_TIMBRANDO`, `payment_status = NO_APLICA`;
- controlled error: `invoice_status = SANDBOX_ERROR`, `payment_status = NO_APLICA`, legacy `status` remains unchanged;
- success: `invoice_status = SANDBOX_TIMBRADO`; if payment was `NO_APLICA`, it becomes `PENDIENTE`.

## User-Facing Errors

The Telegram summary now maps controlled errors to actionable text:

- missing draft:
  `No se pudo timbrar sandbox: no se encontro el borrador. Vuelve a abrir borradores aprobados y genera un boton nuevo.`
- draft not approved:
  `No se pudo timbrar sandbox: el borrador no esta aprobado.`
- fiscal blockers:
  `cliente no validado`, `RFC faltante`, `regimen faltante`, `CP fiscal faltante`, `concepto faltante`, `monto faltante`, `IVA/tax mode faltante`.

Controlled errors must not show `stdout no parseable`.

## Manual Cleanup For Local Inconsistencies

If a prior failed run left a local test draft with:

```sql
status = 'SANDBOX_ERROR'
invoice_status = 'BORRADOR'
```

review it manually first. For the local sandbox case where the draft was
previously approved and should remain retryable:

```sql
UPDATE cfdi_drafts
SET status = 'APROBADO',
    invoice_status = 'SANDBOX_ERROR',
    payment_status = 'NO_APLICA',
    updated_at = now()
WHERE draft_id = '<DRAFT_ID_LOCAL>'
  AND status = 'SANDBOX_ERROR'
  AND invoice_status = 'BORRADOR';
```

Do not run bulk cleanup on real client data without human review.

## Tests

```text
scripts/test-sandbox-draft-stamp-db-loader.js
scripts/test-sandbox-action-cli-json-contract.js
scripts/test-sandbox-draft-status-mapping.js
scripts/test-sandbox-draft-stamp-stdout-contract.js
```

Existing sandbox, ingest, security, and repo safety tests remain required before
7.15.

## No-Go

- No 7.15 implementation in this phase.
- No PAC production.
- No production stamping.
- No XML/PDF/ZIP/Excel over Telegram.
- No credentials in repo.
- No `runtime/` versioning.
- No changes to `data/concepts.normalized.json`.

Next recommended phase: `7.15 Telegram Product E2E Signoff`.
