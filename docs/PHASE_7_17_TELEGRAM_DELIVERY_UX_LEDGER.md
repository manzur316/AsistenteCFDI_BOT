# Phase 7.17 - Telegram UX + Delivery Ledger + E2E Workflow Activation

Status: implementation slice.

7.17B hotfix: Telegram confirmation buttons now require persisted
`DELIVERY_CONFIRM_*` tokens created after `sandbox.documents.delivery.prepare`.
The workflow must be reimported in n8n after this JSON change.

This phase moves sandbox document delivery from "works by Action Layer command"
to "Telegram/n8n can prepare, confirm, send and audit delivery attempts".

## Scope

- Add local `document_delivery_ledger`.
- Add delivery idempotency by draft/channel/destination/document hashes.
- Add Action Layer delivery actions:
  - `sandbox.documents.delivery.status`
  - `sandbox.documents.delivery.prepare`
  - `sandbox.documents.delivery.confirm`
  - `sandbox.documents.delivery.send`
  - `sandbox.documents.delivery.ledger`
- Add Telegram product buttons for:
  - `Enviar por correo`
  - `Enviar a canal documentos`
  - `Ver estado documental`
- Require one-time confirmation tokens before real sends.
- Persist `DELIVERY_CONFIRM_PROVIDER_EMAIL` and
  `DELIVERY_CONFIRM_TELEGRAM_CHANNEL` in `cfdi_action_tokens` before showing the
  confirmation buttons.
- Show `DELIVERY_FORCE_*` only when the Action Layer reports a previous `SENT`
  duplicate for the same draft/channel/destination/document hashes.
- Keep n8n as orchestrator and Action Layer as executor.

## Ledger Safety

The ledger stores only sanitized evidence:

- redacted email or redacted/hash chat destination;
- XML/PDF hashes and sizes;
- document validity booleans;
- safe relative runtime paths;
- sanitized provider/Telegram error evidence.

It does not store full emails, full chat IDs, Telegram tokens, PAC credentials,
RFCs, UUIDs, UIDs, XML/PDF contents, CSD files or `.env` values.

## Telegram UX

After a sandbox stamp/download result, Telegram can display document delivery
buttons. The workflow does not send files directly and does not include
`sendDocument` nodes. It calls the Action Layer through the existing controlled
`Execute Command` path.

## Duplicate Protection

If a `SENT` ledger row already exists for the same draft, channel, destination
and XML/PDF hashes, the next send is blocked by default:

```text
Esta factura ya fue enviada por este canal.
No se reenvio para evitar duplicados.
```

Resend requires an explicit force token and Action Layer `--force`.

`READY`, `DRY_RUN`, `ERROR`, `PROVIDER_ERROR`, `TELEGRAM_ERROR` and
`BLOCKED_DUPLICATE` do not block a later real send. The idempotency key remains
stable and does not include status, action, timestamp or random values.

## 7.17B Confirmation Token Flow

```text
DELIVERY_PREPARE_* token
-> sandbox.documents.delivery.prepare
-> summary node creates DELIVERY_CONFIRM_* token
-> user taps Confirmar envio
-> token is marked used_at
-> sandbox.documents.delivery.send --send-real --confirmed
-> ledger promotes READY/DRY_RUN to SENT when successful
```

The token payload is minimal: `state`, `action`, `draft_id`, `channel` and
`confirmation_required`. It must not contain full email, full chat id, token,
RFC, UUID, UID, XML/PDF contents or runtime paths.

## E2E Gate

The phase is not considered fully operational without a real local E2E run:

1. Start n8n/runner with V3 SAFE.
2. Stamp sandbox live from Telegram.
3. Download XML/PDF from Telegram.
4. Validate and store XML/PDF.
5. Show delivery buttons.
6. Prepare and confirm provider email delivery.
7. Prepare and confirm Telegram document channel delivery.
8. Verify ledger rows for both channels.
9. Verify duplicate resend is blocked or asks for force confirmation.

If Docker, n8n, token or credentials are unavailable, report:

```text
NO VALIDADO END-TO-END: falta acceso local a <recurso>.
```

## No-Go

- No PAC production.
- No CSD.
- No SMTP primary flow.
- No email2/email3.
- No changes to `data/concepts.normalized.json`.
- No runtime or document artifacts in Git.
- No automatic document sends without human confirmation.
