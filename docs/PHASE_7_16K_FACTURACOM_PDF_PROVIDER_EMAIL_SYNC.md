# Phase 7.16K Factura.com Sandbox PDF Root Cause and Provider Email Sync

## Scope

This phase hardens the sandbox document pipeline around three operational
risks:

- Factura.com Sandbox PDF may be structurally valid but visually blank or not
  ready yet.
- `sandbox.documents.delivery.diagnose --channel PROVIDER_EMAIL` must diagnose
  provider email delivery, not Telegram configuration.
- Local client primary email must be observable and synced before provider
  email delivery can be considered ready.

No production PAC, CSD, real stamping, SMTP primary flow, Telegram document send,
catalog mutation, runtime versioning, or automatic customer delivery is enabled.

## Implemented Guards

- Added `sandbox.documents.pdf.diagnose`.
- Improved PDF visual validation for FlateDecode streams using bounded zlib
  inflate attempts.
- Added bounded PDF not-ready retry support:
  `FACTURACOM_SANDBOX_PDF_RETRY_COUNT` and
  `FACTURACOM_SANDBOX_PDF_RETRY_DELAY_MS`.
- `sandbox.draft.download-artifacts` now exposes `pdf_retryable` and only treats
  PDF as downloaded when local content validation passes.
- Provider email diagnose reports provider state, recipient state, email sync
  state, and XML/PDF validity.
- Delivery draft loads preserve `--db-exec-mode docker`.
- Added `sandbox.provider.client.email.diagnose`.
- `sandbox.provider.client.sync --update-provider` updates an existing
  Factura.com Sandbox client with the single confirmed primary email before
  marking local `provider_email_sync_status=SYNCED`.
- Provider email and Telegram document delivery remain blocked when PDF is
  invalid or visually unconfirmed.

## Safe Commands

```powershell
node scripts/run-sandbox-action.js sandbox.documents.pdf.diagnose --db-exec-mode docker --draft-id DRAFT-...
node scripts/run-sandbox-action.js sandbox.documents.delivery.diagnose --db-exec-mode docker --draft-id DRAFT-... --channel PROVIDER_EMAIL
node scripts/run-sandbox-action.js sandbox.documents.delivery.diagnose --db-exec-mode docker --draft-id DRAFT-... --channel TELEGRAM_DOCUMENT_CHANNEL
node scripts/run-sandbox-action.js sandbox.provider.client.email.diagnose --db-exec-mode docker --client-id CLI-...
node scripts/run-sandbox-action.js sandbox.provider.client.sync --db-exec-mode docker --client-id CLI-... --update-provider
```

Outputs are sanitized: no full email, RFC, UUID, UID, XML/PDF body, absolute
runtime paths, `.env`, CSD, PAC credentials, or Telegram token.

## Closing Evidence Required

The phase is operationally closed only when one of these is proven locally:

- PDF valid: `pdf_content_valid=true`, `pdf_visual_content_present=true`, and a
  human PDF path exists after sandbox live download.
- Provider limitation: `sandbox.documents.pdf.diagnose` proves Factura.com
  Sandbox returns visually blank/non-renderable PDF for tested `cfdi_uid`,
  `pac_invoice_id`, and `uuid`.

If Docker, n8n, PostgreSQL, or sandbox credentials are unavailable, report:

```text
NO VALIDADO END-TO-END: falta acceso local a Docker/n8n/credenciales.
```

Unit and contract tests are not sufficient to claim real PDF operational PASS.

## Local E2E Evidence

Validated locally on 2026-06-08 against Factura.com Sandbox live and local
PostgreSQL through `--db-exec-mode docker`.

Draft used:

```text
DRAFT-20260608-143125-173694510
```

Results:

- `sandbox.documents.pdf.diagnose` tested `cfdi_uid`, `pac_invoice_id`, and
  `uuid`; all three returned PDF bytes with `%PDF`, `%%EOF`, one estimated
  page, content streams, image XObject markers, and
  `pdf_visual_content_present=true`.
- `sandbox.draft.download-artifacts` returned `artifact_status=DOWNLOADED`,
  `xml_downloaded=true`, `pdf_downloaded=true`, `xml_content_valid=true`,
  `pdf_content_valid=true`, `pdf_visual_content_present=true`,
  `storage_updated=true`, and generated both `human_xml_path` and
  `human_pdf_path` under `runtime/storage-sandbox`.
- `sandbox.documents.delivery.diagnose --channel PROVIDER_EMAIL` returned
  `status=OK`, `ready=true`, `documents_valid=true`,
  `provider_email_ready=true`, `client_email_confirmed=true`, and
  `provider_email_sync_status=SYNCED`.
- `sandbox.documents.delivery.diagnose --channel TELEGRAM_DOCUMENT_CHANNEL`
  stayed separated from provider email and returned `NEEDS_CONFIG` only because
  Telegram document delivery is not enabled.
- `sandbox.provider.client.sync --update-provider` returned
  `sync_status=UPDATED` and `provider_email_sync_status=SYNCED`.
- `sandbox.provider.client.email.diagnose` returned `ready=true` with only the
  redacted email shape.
- Every live action returned `sensitive_findings=[]`.

Conclusion: Phase 7.16K closes through path A. The PDF was not a provider
limitation; the validator needed stronger stream/image detection and the
download pipeline needed to require visual validation before storage/delivery.

7.16L refines this conclusion: the root issue was earlier in the pipeline too.
The HTTP artifact path was using sanitized `rawText`; preserving non-enumerable
raw bytes fixed XML redaction and yielded provider PDF bytes with text/graphics
markers. XObject/Image alone remains insufficient for future validation.
