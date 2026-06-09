# Phase 7.17F Telegram Post-Action Response Dispatch

## Bug

The remaining failure was not in Factura.com, XML/PDF storage, document
delivery ledger, provider client links or DB persistence.

The broken layer was Telegram post-action dispatch:

```text
callback token
-> action executes
-> fresh tokens are created
-> Telegram follow-up message is not visible
-> second click only reports token_usado
```

This can leave real unused confirm tokens in `cfdi_action_tokens` without a
visible confirmation menu.

## Fix

The workflow now builds an explicit dispatch plan after post-action persistence.
For callbacks it attempts `editMessageText`; if edit fails, it restores the
original response context and sends a fallback `sendMessage`. If edit is not
possible, it sends directly.

Dispatch nodes:

```text
Restore Response After Persistence
-> Build Telegram Dispatch Plan
-> Should Send Telegram
-> Should Edit Telegram Message
-> Telegram editMessageText
-> Did Telegram Edit Succeed
-> Restore Telegram Dispatch Fallback Context
-> Telegram fallback sendMessage
-> Log Send Result SQL
```

The workflow records safe lifecycle fields:

```json
{
  "telegram_dispatch_attempted": true,
  "telegram_dispatch_ok": true,
  "telegram_dispatch_method": "editMessageText|sendMessage|fallbackSendMessage",
  "reply_markup_built": true,
  "chat_id_present": true
}
```

## Confirm token recovery

`Build Load Context SQL` now hydrates recent action tokens for the chat. If a
used `DELIVERY_PREPARE_*` token is clicked and an unused confirm token exists,
`Handle Commands And Scoring` rebuilds the confirmation message and points the
button to the existing token.

This covers the case where `DELIVERY_CONFIRM_TELEGRAM_CHANNEL` or
`DELIVERY_CONFIRM_PROVIDER_EMAIL` was created but the user did not see the menu.

## Validation

New tests:

```powershell
node scripts/test-telegram-post-action-dispatch-download.js
node scripts/test-telegram-post-action-dispatch-stamp.js
node scripts/test-telegram-post-action-dispatch-delivery-prepare-channel.js
node scripts/test-telegram-post-action-dispatch-delivery-prepare-email.js
node scripts/test-telegram-post-action-confirm-token-in-reply-markup.js
node scripts/test-telegram-post-action-send-fallback.js
node scripts/test-telegram-token-used-recovery-confirm-token.js
node scripts/test-local-ingest-workflow-post-action-dispatch.js
```

Required real E2E evidence:

```text
Timbrar sandbox -> visible message + Descargar XML/PDF sandbox
Descargar XML/PDF sandbox -> visible message + delivery buttons
Enviar a canal documentos -> visible confirmation + confirm channel token
Enviar por correo -> visible confirmation + confirm email token
```

Do not confirm real sends unless the operator explicitly authorizes it.

## Non-goals

This phase does not implement 7.18B, Provider Client Sync UX, production PAC,
CSD handling, SMTP, runtime artifact versioning, XML/PDF commits or changes to
`data/concepts.normalized.json`.

## 7.17G context preservation addendum

A real n8n execution showed a narrower bug after 7.17F: the action response and
confirm token were built, but `Build Telegram Dispatch Plan` received an item
without Telegram context.

Observed failure shape:

```text
action_executed=true
response_built=true
reply_markup_built=true
confirm token created
chat_id=null before Should Send Telegram
should_send_telegram=false
telegram_dispatch_payload_built=false
```

The fix is to rehydrate dispatch context from prior workflow nodes before
routing to Telegram. The dispatch plan restores, when missing:

```text
chat_id
telegram_user_id
source_kind
callback_query_id
callback_message_id
source_message_id
update_id
max_seen_update_id
message_id
workflow_version
latency_trace
skip_send
```

Allowed recovery sources, in order, are:

```text
Postgres Load Context
Build Load Context SQL
Extract Local Ingest Update
Postgres Insert Incoming Update
Restore Processing Lock Context
Build PAC Sandbox Action Summary
```

The dispatch plan also checks whether `telegramBotToken` is configured. `Set
Config` loads it from `TELEGRAM_BOT_TOKEN` or `TELEGRAM_TOKEN`, falling back to
the placeholder only. If the token is empty or still the placeholder, the
workflow does not call Telegram HTTP nodes and records:

```json
{
  "telegram_dispatch_blocked_reason": "missing_telegram_bot_token",
  "telegram_dispatch_attempted": false,
  "telegram_dispatch_ok": false,
  "chat_id_present": true,
  "telegram_message_present": true
}
```

This prevents silent success when the bot has already executed the sandbox
action but cannot deliver the follow-up message.
