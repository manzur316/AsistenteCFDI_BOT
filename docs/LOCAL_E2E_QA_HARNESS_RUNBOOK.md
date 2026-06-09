# Local E2E QA Harness Runbook

## Create an n8n API key

In local n8n:

1. Open `http://localhost:5678`.
2. Go to settings or API settings.
3. Create a local API key.
4. Put it only in your local environment, never in git:

```powershell
$env:N8N_API_KEY = "<local key>"
```

Optional local defaults:

```powershell
$env:N8N_BASE_URL = "http://localhost:5678/api/v1"
$env:N8N_WEBHOOK_URL = "http://localhost:5678/webhook/cfdi-local-ingest"
$env:CFDI_DB_EXEC_MODE = "docker"
$env:CFDI_PG_DOCKER_CONTAINER = "cfdi-postgres"
```

## Inspect an execution

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario inspect-execution --execution-id 2351
```

Expected for the old broken execution shape:

```text
FAIL: telegram_message built but chat_id missing at Build Telegram Dispatch Plan
FAIL: action/message built but workflow did not reach Telegram dispatch
```

Inspect the latest execution:

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario inspect-last-execution
```

A healthy post-action callback should show:

```text
chat_id_present: true
callback_message_id_present: true
telegram_dispatch_payload_built: true
Telegram dispatch method: Telegram editMessageText | Telegram sendMessage | Telegram fallback sendMessage
```

## Simulate a callback token

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario callback-token --token <TOKEN> --callback-message-id <ID>
```

The simulator posts a Telegram-shaped callback to the local webhook. It does not
use the Telegram Bot API. It may consume a one-time action token, so use a token
created for QA.

## Delivery prepare QA

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario delivery-prepare --draft-id <DRAFT_ID> --channel TELEGRAM_DOCUMENT_CHANNEL --safe
node scripts/qa/satbot-e2e-harness.js --scenario delivery-prepare --draft-id <DRAFT_ID> --channel PROVIDER_EMAIL --safe
```

The MVP uses existing unused `DELIVERY_PREPARE_*` tokens. If none exists, open
estado documental or the draft detail in Telegram to generate fresh buttons, then
rerun the harness. It does not confirm `DELIVERY_CONFIRM_*` or send documents by
default.

## Existing draft QA

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario sandbox-existing-draft --draft-id <DRAFT_ID> --safe
```

This checks local draft/document state without timbrar again.

## Sync workflow with repository definition

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync --workflow-path workflow/cfdi_telegram_local_ingest.n8n.json
```

This verifies whether the active n8n workflow `cfdi_telegram_local_ingest` matches the
repo workflow definition and writes a workflow diff report.

To apply updates from repo to n8n, use explicit safety flags:

```powershell
node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync --workflow-path workflow/cfdi_telegram_local_ingest.n8n.json --safe=false --apply-workflow-sync=true --confirm-workflow-sync=true --activate-workflow-after-sync=true
```

This is disabled unless both sync flags are explicitly enabled.

## Reading reports

Reports are written under:

```text
runtime/qa-reports/
```

Use `summary.md` for a quick PASS/FAIL and `report.json` for structured details.
Files are sanitized and intended for safe sharing, but still review before
posting externally.

## Common FAIL meanings

- `chat_id missing`: context was lost before dispatch.
- `should_send_telegram=false without controlled reason`: silent-success risk.
- `workflow did not reach Telegram dispatch`: no edit/send/fallback node ran.
- `missing_telegram_bot_token`: configure `TELEGRAM_BOT_TOKEN` or n8n Set Config.
- `confirm token created but reply_markup does not reference it`: user cannot
  press the confirmation button that was created in DB.
- `workflow_not_found: no active workflow named cfdi_telegram_local_ingest`: the sync
  scenario expects that workflow to be active.

## Safety boundaries

The harness does not:

- call PAC production;
- use CSD;
- send Provider Email real by default;
- send Telegram documents by default;
- confirm delivery real by default;
- print full tokens, chat IDs, emails, RFCs, XML/PDF or API keys.
