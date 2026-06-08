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

## Provider Email

The bot first runs:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.prepare --db-exec-mode docker --draft-id DRAFT-... --channel PROVIDER_EMAIL
```

If ready, Telegram shows a confirmation summary with redacted recipient email.
Only after a one-time confirmation token does it run:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.send --db-exec-mode docker --draft-id DRAFT-... --channel PROVIDER_EMAIL --send-real --confirmed
```

## Telegram Document Channel

The bot first runs:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.prepare --db-exec-mode docker --draft-id DRAFT-... --channel TELEGRAM_DOCUMENT_CHANNEL
```

If ready, Telegram shows a confirmation summary. Only after confirmation does it
run:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.send --db-exec-mode docker --draft-id DRAFT-... --channel TELEGRAM_DOCUMENT_CHANNEL --send-real --confirmed
```

The workflow does not call `sendDocument` directly. Document sending lives in
the Action Layer.

## Duplicate Protection

If the same draft/channel/destination/document hashes were already sent, the bot
responds:

```text
Esta factura ya fue enviada por este canal.
No se reenvio para evitar duplicados.
```

Resend requires explicit human confirmation and the Action Layer `--force` flag.

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

## No-Go

This phase does not:

- call production PAC;
- use CSD;
- send documents without human confirmation;
- send documents to the operational chat by default;
- store real secrets, full emails, full chat IDs or document contents in ledger.
