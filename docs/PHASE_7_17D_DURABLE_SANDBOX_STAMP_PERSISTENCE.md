# Phase 7.17D Durable Sandbox Stamp Persistence

## Bug

`sandbox.draft.stamp` could return `OK` in the runtime action result while the
durable draft row stayed in `BORRADOR`. Later actions reloaded from PostgreSQL
and blocked download or delivery because they did not see `SANDBOX_TIMBRADO`.

## Durable Source

The durable source is `cfdi_drafts`, especially:

```text
invoice_status
payment_status
sandbox_pac_summary
```

`loadDraftFromPostgres` rehydrates:

```text
sandbox_status
sandbox_stamp_result
pac_sandbox_result
sandbox_pac_summary
```

from that row.

## Expected State After Stamp

```text
invoice_status=SANDBOX_TIMBRADO
payment_status=PENDIENTE
artifact_status=DOWNLOAD_READY
cfdi_uid_present=true
uuid_present=true
pac_invoice_id_present=true
provider_client_uid_source=provider_client_links
provider_client_link_status=FOUND
legacy_receiver_uid_used=false
```

The action output includes `persistence_status`. Telegram should only expose
download actions when persistence is confirmed.

## Validation

```powershell
node scripts/test-sandbox-draft-stamp-persists-db-state.js
node scripts/test-sandbox-draft-stamp-rehydrate-after-persist.js
node scripts/test-sandbox-download-after-stamp-db-state.js
node scripts/test-sandbox-delivery-status-after-stamp-db-state.js
```

Local status check:

```powershell
scripts\local\80_RUN_SANDBOX_ACTION_WITH_ENV_V3_SAFE.bat sandbox.documents.delivery.status --db-exec-mode docker --draft-id <DRAFT_ID>
```

Expected immediately after stamp:

```text
invoice_status=SANDBOX_TIMBRADO
artifact_status=DOWNLOAD_READY
documents_valid=false
```
