# Phase 7.8 - Sandbox Lifecycle Storage Review

Status: implemented as local sandbox tooling.

## Purpose

Phase 7.8 adds a human-reviewable storage lifecycle report for sandbox CFDI
documents. It does not change fiscal logic, does not call a PAC, does not stamp
production invoices and does not send XML/PDF/ZIP/Excel files through Telegram.

The review layer reads the existing sandbox storage under:

```text
runtime/storage-sandbox/
```

and writes safe local reports under:

```text
runtime/storage-sandbox/reports/
```

Generated reports:

- `lifecycle-storage-review.json`
- `lifecycle-storage-review.md`

`runtime/` remains ignored by Git.

## Implemented Files

```text
scripts/lib/sandbox-human-readable-storage-naming.js
scripts/review-sandbox-lifecycle-storage.js
scripts/test-sandbox-human-readable-storage-naming.js
scripts/test-sandbox-lifecycle-storage-review.js
```

## Human-readable Naming

The naming helper generates safe local file names such as:

```text
2026-06-05_CLIENT-PRIVADA-RIVERA_DRAFT-000123_SANDBOX_TIMBRADO.xml
2026-06-05_CLIENT-PRIVADA-RIVERA_DRAFT-000124_SANDBOX_CANCELADO.json
```

Allowed extensions:

- `xml`
- `pdf`
- `json`
- `csv`
- `md`

Blocked from names and report paths:

- RFC
- UUID
- provider UID or client UID values
- absolute paths
- path traversal
- tokens and API key-like values
- `.env`
- CSD and private key extensions

If a provider identifier is passed as `invoice_id`, the helper falls back to a
safe internal draft reference instead of using that provider value.

## Lifecycle Review

The review script validates and summarizes:

- documents indexed by sandbox storage;
- documents by client reference;
- documents by period;
- documents by lifecycle status;
- documents by draft/internal invoice reference;
- documents by provider;
- XML/PDF availability;
- cancellation response availability;
- checksums recorded for artifacts;
- status history presence;
- legacy Action Layer stamp/cancel artifacts.

Lifecycle statuses are normalized for review:

- `CREATED` -> `SANDBOX_TIMBRADO`
- `CANCELLED` -> `SANDBOX_CANCELADO`
- `ERROR` -> `SANDBOX_ERROR`
- `PARTIAL` -> `SANDBOX_PARTIAL`

Cancellation review checks that a cancelled sandbox document keeps its original
XML/PDF artifacts and records a cancellation response. Missing status history or
missing original artifacts are reported as warnings for human review.

## Sensitive Data Rules

The generated JSON and Markdown reports are checked after writing. The command
fails if generated output contains:

- RFC values;
- UUID values;
- UID-like provider/client identifiers;
- Windows absolute paths;
- XML body content;
- PDF body content;
- production Factura.com URL;
- token/secret/API-key-like strings;
- `.env`, CSD or private-key references.

The review reports may include safe derived file names and SHA-256 checksums,
but never embed XML/PDF content.

## Commands

Run the review against the default storage:

```powershell
node scripts/review-sandbox-lifecycle-storage.js
```

Run against an explicit storage path:

```powershell
node scripts/review-sandbox-lifecycle-storage.js --storage-root runtime/storage-sandbox
```

Run tests:

```powershell
node scripts/test-sandbox-lifecycle-storage-review.js
node scripts/test-sandbox-human-readable-storage-naming.js
```

## No-go

This phase does not:

- call Factura.com production or any production PAC;
- call `stampProduction`;
- timbrar CFDI real;
- cancel production invoices;
- modify n8n workflows;
- send XML/PDF/ZIP/Excel through Telegram;
- modify `data/concepts.normalized.json`;
- move or delete real runtime artifacts;
- version runtime reports or sandbox artifacts.

## Exit Criteria

Phase 7.8 is considered complete when:

- naming tests pass;
- lifecycle review tests pass;
- existing sandbox lifecycle cancellation tests pass;
- approved draft to PAC sandbox tests pass;
- repo safety and n8n workflow guardrails pass;
- generated reports stay under `runtime/`;
- generated reports have no sensitive findings.

## Next Phase

Recommended next phase:

```text
7.9 Invoice Status and Payment Status Model
```
