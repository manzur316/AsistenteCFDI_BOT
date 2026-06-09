# Phase 7.17H SATBOT Local E2E QA Harness

## Goal

7.17H adds a local QA harness so n8n/Telegram changes are not validated only
with static workflow tests. The harness can inspect real n8n executions,
simulate Telegram webhook callbacks, query local PostgreSQL and generate
sanitized reports safe to share with Codex or ChatGPT.

## Scope

Implemented MVP capabilities:

- `scripts/qa/satbot-e2e-harness.js` CLI;
- n8n API client using `X-N8N-API-KEY`;
- Telegram webhook simulator for messages and callbacks;
- read-only PostgreSQL QA client using `scripts/lib/local-db-psql-runner.js`;
- n8n execution inspector and dispatch assertions;
- sanitized report builder under `runtime/qa-reports`;
- fixture for a broken post-action dispatch execution shape like 2351;
- contract tests for sanitizer, inspector, webhook simulator, assertions,
  reports and CLI.

## CLI

```powershell
node scripts/qa/satbot-e2e-harness.js --help
node scripts/qa/satbot-e2e-harness.js --scenario inspect-last-execution
node scripts/qa/satbot-e2e-harness.js --scenario inspect-execution --execution-id 2351
node scripts/qa/satbot-e2e-harness.js --scenario callback-token --token <TOKEN>
node scripts/qa/satbot-e2e-harness.js --scenario delivery-prepare --draft-id <DRAFT_ID> --channel TELEGRAM_DOCUMENT_CHANNEL
node scripts/qa/satbot-e2e-harness.js --scenario delivery-prepare --draft-id <DRAFT_ID> --channel PROVIDER_EMAIL
node scripts/qa/satbot-e2e-harness.js --scenario sandbox-existing-draft --draft-id <DRAFT_ID> --safe
```

Safe defaults:

```text
--safe=true
--no-real-send=true
--no-provider-create=true
--no-production=true
```

`DELIVERY_CONFIRM_*` and `DELIVERY_FORCE_*` callbacks are blocked unless the
operator passes an explicit real-send confirmation flag. The harness does not
send documents, Provider Email or Telegram Document Channel messages by default.

## Configuration

Required for n8n API scenarios:

```text
N8N_API_KEY
```

Defaults:

```text
N8N_BASE_URL=http://localhost:5678/api/v1
N8N_WEBHOOK_URL=http://localhost:5678/webhook/cfdi-local-ingest
CFDI_DB_EXEC_MODE=docker
CFDI_PG_DOCKER_CONTAINER=cfdi-postgres
CFDI_PGDATABASE=cfdi_bot
CFDI_PGUSER=cfdi_bot_user
QA_REPORT_ROOT=runtime/qa-reports
```

The harness may load local `.env.local` and `.env.pac.sandbox.local`, but never
prints secret values. If `N8N_API_KEY` is missing, it fails with:

```text
NEEDS_CONFIG: N8N_API_KEY no configurado.
```

## Dispatch bug detection

The inspector fails executions where:

```text
telegram_message built but chat_id missing at Build Telegram Dispatch Plan
telegram_message built but should_send_telegram=false without controlled reason
action/message built but workflow did not reach Telegram dispatch
workflow ended at Build Webhook Response instead of Telegram send/edit
callback_query_id or callback_message_id missing before dispatch
confirm token created but reply_markup does not reference it
```

The included fixture
`scripts/fixtures/n8n-execution-post-action-dispatch-missing-chat.sanitized.json`
models the execution-2351 class of failure.

## Reports

Each real run writes:

```text
runtime/qa-reports/<timestamp>-<scenario>/
  summary.md
  report.json
  n8n-execution-<id>.sanitized.json
  db-snapshot.sanitized.json
```

Sanitization redacts:

- Telegram bot tokens;
- n8n API keys;
- Factura.com keys/secrets/plugin;
- full chat IDs;
- emails;
- RFCs;
- provider/PAC IDs;
- XML/PDF contents;
- absolute paths outside safe repo/runtime context.

## Non-goals

This phase does not implement 7.18B, Provider Client Sync UX, production PAC,
CSD, SMTP, email2/email3, real document sends, runtime versioning or changes to
`data/concepts.normalized.json`.
