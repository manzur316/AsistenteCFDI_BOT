# Telegram Delivery UX Runbook

Phase 7.17 connects the Telegram product UX to sandbox document delivery.
This is still sandbox only.

## Expected User Flow

```text
Telegram
-> approve draft
-> stamp sandbox live
-> download XML/PDF sandbox
-> validate XML/PDF
-> store artifacts with human-safe names
-> show document delivery buttons
-> prepare delivery
-> confirm delivery
-> record delivery ledger
```

## Buttons

After a sandbox draft has downloadable/validated documents, the bot can show:

- `Enviar por correo`
- `Enviar a canal documentos`
- `Ver estado documental`

If documents are not downloaded yet, the safe action remains:

- `Descargar XML/PDF sandbox`

## Download Contract

`Descargar XML/PDF sandbox` only downloads and validates XML/PDF into local
sandbox storage. It does not send documents automatically.

After a successful download, the bot must show a visible completion message and
fresh delivery buttons only when all are true:

- `status=OK`
- `persistence_status=UPDATED`
- `artifact_status=DOWNLOADED`
- `xml_content_valid=true`
- `pdf_content_valid=true`

If XML/PDF were downloaded but persistence did not update local DB, the bot
must not create delivery buttons. The user-facing message should say that
local state was not confirmed and delivery was not enabled.

## Provider Email

The bot first runs:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.prepare --db-exec-mode docker --draft-id DRAFT-... --channel PROVIDER_EMAIL
```

If ready, Telegram shows a confirmation summary with redacted recipient email.
The summary response creates a new persisted `DELIVERY_CONFIRM_PROVIDER_EMAIL`
token in `cfdi_action_tokens`. Only after that one-time confirmation token is
pressed does it run:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.send --db-exec-mode docker --draft-id DRAFT-... --channel PROVIDER_EMAIL --send-real --confirmed
```

## Telegram Document Channel

The bot first runs:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.prepare --db-exec-mode docker --draft-id DRAFT-... --channel TELEGRAM_DOCUMENT_CHANNEL
```

If ready, Telegram shows a confirmation summary and creates a persisted
`DELIVERY_CONFIRM_TELEGRAM_CHANNEL` token. Only after confirmation does it run:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.send --db-exec-mode docker --draft-id DRAFT-... --channel TELEGRAM_DOCUMENT_CHANNEL --send-real --confirmed
```

The workflow does not call `sendDocument` directly. Document sending lives in
the Action Layer.

Confirmation copy for this channel must say that XML/PDF will be sent to the
configured document channel and not to the operational chat.

## Duplicate Protection

If the same draft/channel/destination/document hashes were already sent, the bot
responds:

```text
Esta factura ya fue enviada por este canal.
No se reenvio para evitar duplicados.
```

Resend requires explicit human confirmation and the Action Layer `--force` flag.
The `Reenviar de todos modos` button appears only after a previous `SENT`
duplicate is detected, and it uses a fresh `DELIVERY_FORCE_*` token.

## Diagnosing token_no_encontrado

If a delivery confirmation button says the token is missing:

1. Reimport `workflow/cfdi_telegram_local_ingest.n8n.json` in n8n.
2. Confirm the workflow contains the 7.17B context recovery fix in
   `Build PAC Sandbox Action Summary`: source context must be read from
   `Restore Processing Lock Context` before the `Handle Commands And Scoring`
   fallback.
3. Press `Enviar por correo` or `Enviar a canal documentos` again.
4. Before confirming, query `cfdi_action_tokens` for the draft and confirm that
   `DELIVERY_CONFIRM_PROVIDER_EMAIL` or `DELIVERY_CONFIRM_TELEGRAM_CHANNEL`
   exists with `used_at IS NULL`.
5. Confirm once, then verify `used_at` is filled and `document_delivery_ledger`
   has `SENT` if the Action Layer succeeded.

## Diagnosing token_usado / dead callbacks

Since 7.17C, used one-time callbacks should recover current state instead of
leaving the user with only `token_usado`.

Expected recovery:

- used `STAMP_DRAFT_SANDBOX`: if the draft is `SANDBOX_TIMBRADO`, show
  `Descargar XML/PDF sandbox` and `Ver estado documental`;
- used `DOWNLOAD_SANDBOX_ARTIFACTS`: if XML/PDF are already downloaded, show
  document status and delivery buttons;
- used `DELIVERY_CONFIRM_*`: if the ledger has `SENT`, show already-sent
  status; otherwise ask the user to prepare delivery again.

If a user still sees a raw invalid-button dead end, reimport
`workflow/cfdi_telegram_local_ingest.n8n.json` and run:

```powershell
node scripts/test-local-ingest-workflow-callback-lifecycle.js
node scripts/test-telegram-callback-token-used-recovery.js
```

## Status

`Ver estado documental` maps to:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.status --db-exec-mode docker --draft-id DRAFT-...
```

It reports:

- stamp status;
- XML/PDF validity;
- storage presence;
- provider email last status;
- Telegram document channel last status.

The status response must never show:

```text
documents_valid=true
artifact_status=NOT_REQUESTED
```

If valid files are present while the stored artifact status is stale, the
public status reports `artifact_status=DOWNLOADED` and includes
`artifact_status_inferred_from_documents=true` for diagnosis.

## No-Go

This phase does not:

- call production PAC;
- use CSD;
- send documents without human confirmation;
- send documents to the operational chat by default;
- store real secrets, full emails, full chat IDs or document contents in ledger.
