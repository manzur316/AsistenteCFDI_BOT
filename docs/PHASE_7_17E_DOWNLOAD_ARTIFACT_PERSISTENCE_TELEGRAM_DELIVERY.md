# Phase 7.17E Download Artifact Persistence + Telegram Delivery UX

## Bug

`sandbox.draft.download-artifacts` could finish with valid local XML/PDF and
`output.artifact_status=DOWNLOADED`, while the durable
`cfdi_drafts.sandbox_pac_summary` row was overwritten with:

```text
artifact_status=NOT_REQUESTED
provider_client_uid_source=missing
provider_client_link_status=MISSING
*_present=false
```

That made `sandbox.documents.delivery.status` show the contradictory state:

```text
documents_valid=true
artifact_status=NOT_REQUESTED
```

## Durable State

After sandbox stamp:

```text
invoice_status=SANDBOX_TIMBRADO
artifact_status=DOWNLOAD_READY
documents_valid=false
```

After successful XML/PDF download:

```text
invoice_status=SANDBOX_TIMBRADO
artifact_status=DOWNLOADED
xml_downloaded=true
pdf_downloaded=true
xml_content_valid=true
pdf_content_valid=true
provider_client_uid_source=provider_client_links
provider_client_link_status=FOUND
```

PAC identity fields must be preserved when already known:

```text
cfdi_uid
uuid
pac_invoice_id
serie
folio
```

## Telegram Contract

`Descargar XML/PDF sandbox` prepares documents locally. It does not send XML/PDF
automatically to the operational chat.

When the action result is:

```text
status=OK
persistence_status=UPDATED
artifact_status=DOWNLOADED
xml_content_valid=true
pdf_content_valid=true
```

the bot shows a visible completion message and creates fresh buttons:

```text
Ver estado documental
Enviar por correo
Enviar a canal documentos
Ver factura
Menu principal
```

If persistence fails, delivery buttons are not created.

## Recovery

For drafts where runtime shows a successful download but DB stayed stale, run:

```powershell
node scripts/run-sandbox-action.js sandbox.draft.recover-artifact-state --db-exec-mode docker --draft-id <DRAFT_ID>
```

The recovery action:

- reads the latest local `sandbox.draft.download-artifacts` runtime result;
- validates XML/PDF from local storage;
- persists `artifact_status=DOWNLOADED`;
- preserves existing PAC identity and provider client link from the draft row;
- does not call Factura.com;
- does not send documents.

## Validation

Run focused checks:

```powershell
node scripts/test-sandbox-download-persists-downloaded-status.js
node scripts/test-sandbox-download-persistence-preserves-pac-identity.js
node scripts/test-sandbox-download-persistence-preserves-provider-client-link.js
node scripts/test-sandbox-delivery-status-no-documents-valid-with-not-requested.js
node scripts/test-telegram-callback-lifecycle-download-response.js
node scripts/test-sandbox-recover-artifact-state-from-runtime.js
```

Real local validation should use:

```powershell
scripts\local\80_RUN_SANDBOX_ACTION_WITH_ENV_V3_SAFE.bat sandbox.documents.delivery.status --db-exec-mode docker --draft-id <DRAFT_ID>
```

Expected after download:

```text
artifact_status=DOWNLOADED
documents_valid=true
xml_content_valid=true
pdf_content_valid=true
```
