# Phase 7.17B - Telegram Delivery Confirmation Token Fix

Status: implemented with automated validation PASS.

E2E Telegram real status: NO VALIDADO END-TO-END: falta acceso a una sesion real de n8n/Telegram activa con click humano y consulta DB posterior al click.

## Problem

Sandbox stamping, XML/PDF download, storage, provider email delivery by command,
Telegram document channel delivery by command, and the delivery ledger already
worked. The Telegram UX failed after `prepare`: the confirmation screen showed
buttons, but clicking `Confirmar envio correo` or `Confirmar envio canal`
returned `token_no_encontrado`.

Observed DB evidence for the affected draft had `DELIVERY_STATUS` and
`DELIVERY_PREPARE_*` tokens, but no `DELIVERY_CONFIRM_*` or `DELIVERY_FORCE_*`
tokens for the real callback path.

## Root Cause

`Build PAC Sandbox Action Summary` creates the post-prepare confirmation buttons
after `sandbox.documents.delivery.prepare` returns. The node recovered source
context from `Handle Commands And Scoring`; in the real callback branch the
direct restored context is `Restore Processing Lock Context`.

When that context was not restored reliably, the summary could produce callback
buttons without a matching persisted token for the chat/draft lookup path.

## Fix

The supported workflow now recovers source context in this order:

```text
Restore Processing Lock Context
Handle Commands And Scoring
current node input
```

That keeps `chat_id`, `draft_id`, `sandbox_draft_context`, callback metadata and
delivery channel available when `Build PAC Sandbox Action Summary` creates fresh
action tokens.

## Confirmed Contract

After `DELIVERY_PREPARE_PROVIDER_EMAIL` returns `READY`, the workflow persists
`DELIVERY_CONFIRM_PROVIDER_EMAIL` plus `DELIVERY_STATUS`.

After `DELIVERY_PREPARE_TELEGRAM_CHANNEL` returns `READY`, the workflow persists
`DELIVERY_CONFIRM_TELEGRAM_CHANNEL` plus `DELIVERY_STATUS`.

If and only if a prior `SENT` duplicate exists, the workflow persists
`DELIVERY_FORCE_PROVIDER_EMAIL` or `DELIVERY_FORCE_TELEGRAM_CHANNEL`.

Confirmation callbacks route to:

```text
sandbox.documents.delivery.send --send-real --confirmed
```

Force callbacks route to:

```text
sandbox.documents.delivery.send --send-real --confirmed --force
```

## Idempotency

The canonical delivery idempotency key remains stable:

```text
environment + draft_id + channel + recipient_hash + xml_sha256 + pdf_sha256
```

It does not include status, delivery action, timestamp, random values or
created_at. Only `SENT` blocks duplicate sending. `READY`, `PREPARE`, `DRY_RUN`,
`ERROR`, `PROVIDER_ERROR` and `TELEGRAM_ERROR` do not block a later confirmed
send.

## UX Copy

Provider email confirmation says:

```text
Factura.com Sandbox enviara XML/PDF al correo confirmado del cliente.
No se adjuntaran documentos al chat operativo.
```

Telegram document channel confirmation says:

```text
Los documentos XML/PDF se enviaran al canal documental configurado.
No se adjuntaran documentos al chat operativo.
```

## Tests

New 7.17B tests:

```powershell
node scripts/test-telegram-delivery-confirm-token-created.js
node scripts/test-telegram-delivery-confirm-token-routing.js
node scripts/test-telegram-delivery-confirm-send-action.js
node scripts/test-telegram-delivery-force-token-created.js
node scripts/test-telegram-delivery-no-force-without-sent.js
node scripts/test-document-delivery-idempotency-key-stable.js
node scripts/test-document-delivery-ready-does-not-block-send.js
node scripts/test-document-delivery-sent-blocks-duplicate.js
node scripts/test-telegram-delivery-ux-copy.js
node scripts/test-telegram-delivery-token-db-contract.js
```

Regression tests listed in `docs/TELEGRAM_DELIVERY_UX_RUNBOOK.md` remain
required before importing the workflow to n8n.

## Manual E2E Checklist

Before closing 7.17B as fully E2E validated:

1. Reimport `workflow/cfdi_telegram_local_ingest.n8n.json` in n8n.
2. Start the V3 SAFE launcher.
3. Confirm one Telegram runner.
4. From Telegram, stamp sandbox and download XML/PDF.
5. Press `Enviar por correo`.
6. Query `cfdi_action_tokens` and verify `DELIVERY_CONFIRM_PROVIDER_EMAIL`
   exists with `used_at IS NULL`.
7. Press `Confirmar envio correo`.
8. Verify `document_delivery_ledger` has `PROVIDER_EMAIL SENT`.
9. Repeat for `Enviar a canal documentos`.
10. Verify XML/PDF are delivered to the document channel.
11. Verify `document_delivery_ledger` has `TELEGRAM_DOCUMENT_CHANNEL SENT`.
12. Repeat prepare and confirm duplicate handling or `Reenviar de todos modos`.

## No-Go

This phase does not enable production PAC, CSD, document sending without human
confirmation, operational-chat delivery by default, catalog changes, runtime
versioning, or 7.18B provider client sync UX.

## Next Gate

Do not start 7.18B until 7.17B is validated with real Telegram/n8n clicks or an
explicit product decision accepts simulated validation only.

## 7.17C Follow-Up

7.17C extends this fix from confirmation-token creation into full callback
lifecycle recovery. Used stamp/download/delivery tokens now return an
action-aware recovery message with fresh buttons instead of a raw `token_usado`
dead end.

See `docs/PHASE_7_17C_TELEGRAM_CALLBACK_LIFECYCLE_RECOVERY.md`.
