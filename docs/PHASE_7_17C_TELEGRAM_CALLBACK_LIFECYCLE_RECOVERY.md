# Phase 7.17C - Telegram Callback Lifecycle Recovery

Status: implemented with automated validation PASS.

E2E Telegram real status: NO VALIDADO END-TO-END: falta acceso a una sesion real de n8n/Telegram activa con click humano, Factura.com Sandbox live y consulta DB posterior al click.

## Context

The current migration is not only document delivery. The sandbox stamp flow is
moving from a legacy global receiver UID:

```text
FACTURACOM_SANDBOX_RECEIVER_UID
```

to the correct per-client provider link:

```text
cfdi_clients -> provider_client_links.provider_client_uid
```

The normal Telegram product stamp path must use `provider_client_links`.
`FACTURACOM_SANDBOX_RECEIVER_UID` remains only as an explicit legacy/test
fallback through `--allow-legacy-receiver-uid`.

## Problem

Real Telegram callbacks could execute an Action Layer operation and consume the
one-time token, but fail to leave the user with a visible response and fresh
buttons. A second click then showed a dead-end message such as `token_usado` or
a generic duplicate response even though the backend action had succeeded.

Affected actions:

- `STAMP_DRAFT_SANDBOX`
- `DOWNLOAD_SANDBOX_ARTIFACTS`
- `DELIVERY_STATUS`
- `DELIVERY_PREPARE_PROVIDER_EMAIL`
- `DELIVERY_CONFIRM_PROVIDER_EMAIL`
- `DELIVERY_FORCE_PROVIDER_EMAIL`
- `DELIVERY_PREPARE_TELEGRAM_CHANNEL`
- `DELIVERY_CONFIRM_TELEGRAM_CHANNEL`
- `DELIVERY_FORCE_TELEGRAM_CHANNEL`

## Callback Lifecycle Contract

The supported workflow must preserve this lifecycle:

```text
callback received
-> token lookup
-> token validation
-> draft/client/channel context restored
-> Action Layer requested
-> visible Telegram response built
-> fresh buttons/tokens built
-> one-time token protected from replay
-> duplicate or used click recovers current state
```

This phase does not blindly move `used_at` to the end. The workflow still marks
one-time tokens before Action Layer execution to protect idempotency, but now a
used token has action-aware recovery instead of a dead-end invalid-button
message.

## Recovery Rules

### Used Stamp Token

If `STAMP_DRAFT_SANDBOX` is already used and the draft is
`SANDBOX_TIMBRADO`, Telegram responds that the factura is already stamped and
shows fresh buttons:

- `Descargar XML/PDF sandbox`
- `Ver estado documental`
- `Ver borrador`
- `Ver ultimo resultado sandbox`
- `Menu principal`

### Used Download Token

If `DOWNLOAD_SANDBOX_ARTIFACTS` is already used and artifacts are marked
`DOWNLOADED` or XML/PDF are present, Telegram responds that the download already
completed and shows:

- `Ver estado documental`
- `Enviar por correo`
- `Enviar a canal documentos`
- `Ver borrador`
- `Ver ultimo resultado sandbox`
- `Menu principal`

### Used Delivery Confirm/Force Token

If the ledger context has `SENT`, Telegram responds that documents were already
sent and shows status recovery.

If there is no `SENT` evidence, Telegram tells the user to prepare the delivery
again, so a new confirmation token is generated.

### Missing or Expired Token

`token_no_encontrado` and `token_expirado` remain rejected, but the response is
actionable:

- missing token: reopen the draft or main menu;
- expired token: reopen the draft to generate updated buttons;
- wrong chat: open the menu from the current chat.

## Response-Built Diagnostics

`Build PAC Sandbox Action Summary` now records safe lifecycle diagnostics in
`json_debug.callback_lifecycle`:

```json
{
  "callback_lifecycle_stage": "action_summary_built",
  "action_executed": true,
  "response_built": true,
  "token_used": true,
  "draft_id_present": true
}
```

The Telegram summary preserves line breaks in `telegram_message` and `send_text`
after secret/path/document sanitization.

## Provider Client Readiness

This phase keeps provider-client readiness intact:

- if `provider_client_links.provider_client_uid` exists, stamp can proceed;
- if it is missing, `sandbox.draft.stamp` blocks before Factura.com Sandbox and
  reports provider client readiness/config state;
- no full provider sync Telegram UX is implemented here.

Provider Client Sync UX remains a later phase.

## Tests

New lifecycle tests:

```powershell
node scripts/test-telegram-callback-lifecycle-stamp-response.js
node scripts/test-telegram-callback-lifecycle-download-response.js
node scripts/test-telegram-callback-token-used-recovery.js
node scripts/test-telegram-callback-action-executed-response-built.js
node scripts/test-local-ingest-workflow-callback-lifecycle.js
```

Relevant regression tests:

```powershell
node scripts/test-local-ingest-workflow-contract.js
node scripts/test-local-ingest-response-contract.js
node scripts/test-telegram-token-semantics.js
node scripts/test-sandbox-action-cli-json-contract.js
node scripts/test-sandbox-draft-stamp-uses-provider-client-link.js
node scripts/test-sandbox-draft-stamp-provider-link-preflight.js
node scripts/test-sandbox-draft-stamp-require-live-mode.js
node scripts/test-sandbox-draft-download-artifacts-action.js
node scripts/test-sandbox-download-content-validation-action.js
node scripts/test-sandbox-documents-delivery-status-action.js
node scripts/test-sandbox-documents-delivery-prepare-action.js
node scripts/test-sandbox-documents-delivery-confirm-action.js
node scripts/test-sandbox-documents-delivery-send-ledger.js
node scripts/test-document-delivery-ledger-store.js
node scripts/test-document-delivery-idempotency.js
node scripts/test-provider-client-readiness-action.js
node scripts/test-provider-client-readiness-contract.js
node scripts/test-provider-client-readiness-missing-link.js
node scripts/test-provider-client-readiness-no-db-mutation.js
node scripts/test-provider-client-link-action.js
node scripts/test-provider-client-sync-action.js
node scripts/test-provider-client-email-sync-diagnose.js
node scripts/test-provider-client-sync-updates-email.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
node scripts/test-scoring.js
```

## Manual E2E Checklist

Before declaring real Telegram E2E PASS:

1. Reimport `workflow/cfdi_telegram_local_ingest.n8n.json`.
2. Start V3 SAFE launcher.
3. Confirm one runner active.
4. Create and approve a draft from Telegram.
5. Click `Timbrar sandbox`.
6. Verify visible stamp response and download/status buttons.
7. Click the old stamp button again and verify recovery, not a dead end.
8. Click `Descargar XML/PDF sandbox`.
9. Verify visible XML/PDF response and delivery buttons.
10. Click the old download button again and verify recovery.
11. Click `Enviar por correo`; verify `DELIVERY_CONFIRM_PROVIDER_EMAIL`.
12. Confirm; verify `document_delivery_ledger` has `PROVIDER_EMAIL SENT`.
13. Click `Enviar a canal documentos`; verify `DELIVERY_CONFIRM_TELEGRAM_CHANNEL`.
14. Confirm; verify `document_delivery_ledger` has
    `TELEGRAM_DOCUMENT_CHANNEL SENT`.
15. Attempt duplicate and verify duplicate/force behavior.

Useful DB checks:

```powershell
docker exec -i cfdi-postgres psql -U cfdi_bot_user -d cfdi_bot -c "SELECT token, draft_id, action, used_at, expires_at, created_at, payload FROM cfdi_action_tokens WHERE draft_id='<DRAFT_ID>' ORDER BY created_at DESC LIMIT 40;"
```

```powershell
docker exec -i cfdi-postgres psql -U cfdi_bot_user -d cfdi_bot -c "SELECT draft_id, channel, delivery_status, delivery_action, sent_at, created_at, normalized_errors, normalized_warnings FROM document_delivery_ledger WHERE draft_id='<DRAFT_ID>' ORDER BY created_at DESC;"
```

## No-Go

This phase does not implement 7.18B provider sync UX, production PAC, CSD,
production timbrado, SMTP primary flow, email2/email3, runtime versioning,
document sending to the operational chat by default, or catalog changes.
