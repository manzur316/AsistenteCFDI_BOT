# n8n Workflow Guardrails

These rules apply to sandbox and production-facing n8n workflows in this
project.

## Central Rule

n8n is only an orchestrator.

n8n is not the fiscal engine, not the PAC adapter, not the storage engine and
not the place for heavy CFDI logic. Fiscal decisions, PAC calls, file handling,
artifact generation and sensitive validation belong in the local Action Layer
or backend scripts, where they can be tested and audited.

## Prohibited In Code Nodes

Code Nodes must not use:

- `require('fs')`
- `require("fs")`
- `require('path')`
- `require("path")`
- `readFileSync`
- `writeFileSync`
- `existsSync`
- `readdirSync`
- `process.env`
- `child_process`
- `exec`
- `spawn`
- `eval`
- `Function(...)`
- filesystem reads from `runtime/`
- `.env` reads
- direct XML, PDF, ZIP or Excel reads

This includes diagnostic files such as
`runtime/action-results-sandbox/latest.json`. That file is useful for a human
or an external script, but n8n must not read it from a Code Node.

## Allowed In Code Nodes

Code Nodes may:

- read data already present in `$json`;
- parse `$json.stdout` or `$json.data` from an Execute Command node;
- map commands and callbacks against hardcoded allowlists;
- build safe response objects;
- build safe Telegram `sendMessage` payloads;
- return JSON for Respond to Webhook.

## Correct Pattern

```text
Webhook / Telegram callback
  -> Code Node: normalize input and map to allowlisted action
  -> Execute Command: node scripts/run-sandbox-action.js <action_allowlisted>
  -> Code Node: JSON.parse($json.stdout || $json.data)
  -> Code Node: build sanitized summary
  -> Respond to Webhook / Telegram sendMessage
```

The Action Layer prints stable JSON to stdout. n8n consumes only that stdout and
does not inspect internal files.

## Incorrect Pattern

```js
const fs = require('fs');
const path = require('path');
const latest = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'runtime/action-results-sandbox/latest.json'), 'utf8')
);
```

This breaks in n8n 2.4.4 and violates the boundary. Do not enable `fs/path` in
Code Nodes to make this work.

## Execute Command Rule

Execute Command nodes may only run this family of command:

```powershell
node scripts/run-sandbox-action.js <action_allowlisted>
```

The action must come from an internal allowlist. Never concatenate raw user
input into shell commands. Never accept arbitrary shell text from Telegram,
webhooks or workflow input.

## PAC And Factura.com Boundary

n8n must not:

- call Factura.com, Facturama, Facturapi, SW, Finkok or any PAC directly;
- contain `https://api.factura.com`;
- contain `F-Api-Key`, `F-Secret-Key` or `F-PLUGIN`;
- contain API keys, CSD files, `.env`, XML, PDF, ZIP or Excel artifacts;
- know provider-specific fiscal payload internals.

Only the Action Layer and PAC Adapter Hub may talk to PAC sandbox endpoints.
Production remains blocked until an explicit future phase.

## Telegram Boundary

Telegram callback data must be short allowlist tokens, for example:

```text
cfdi_sbx:full
```

Callback data must not include RFC, UUID, UID, amounts, client names, series,
folios, paths, XML, PDF, ZIP, Excel, credentials or secrets.

In this phase n8n must not use `sendDocument`, `sendPhoto`, binary data or any
file upload. Telegram receives safe text summaries only.

## Environment Variables

Code Nodes must not use `process.env`.

If a workflow needs local configuration, keep it in a controlled Set Config
node. The only approved `$env` reads for the sandbox router are:

- `CFDI_ALLOWED_TELEGRAM_CHAT_ID`
- `TELEGRAM_BOT_TOKEN`

Never print environment variables.

## Before Importing A Workflow

Run:

```powershell
node scripts/test-n8n-workflow-guardrails.js
node scripts/test-sandbox-action-router-workflow-contract.js
node scripts/test-n8n-webhook-response-contract.js
```

Then inspect the n8n JSON for:

- no Node module `require(...)` calls;
- no filesystem reads;
- no PAC URLs or PAC headers;
- no production URL;
- no secrets or placeholders that look like real tokens;
- no file sending nodes;
- only allowlisted `cfdi_sbx:*` callbacks;
- only allowlisted `node scripts/run-sandbox-action.js <action>` execution.

## Legacy Workflows

Some historical workflows from earlier phases remain in the repository for
traceability and old tests. They are not templates for new work. The guardrail
test reports those legacy files separately until they are migrated or retired.
Current supported sandbox workflows must pass the strict rules without
exceptions.

## Safety Checklist

- n8n orchestrates only.
- Fiscal logic stays outside n8n.
- PAC logic stays outside n8n.
- Code Nodes do not use `fs`, `path`, `process.env` or filesystem reads.
- Execute Command runs only allowlisted Action Layer commands.
- n8n consumes stdout JSON from the Action Layer.
- Telegram receives safe text summaries only.
- Runtime artifacts, XML/PDF, ZIP/Excel, `.env`, CSD and real data stay out of
  Git and out of workflow JSON.
- Every fiscal result remains a draft subject to human review.
