# Phase 7.14B - Telegram Token Semantics and Draft Stamp Output Contract

Status: implemented as a corrective hotfix before 7.15.

## Scope

This phase fixes two product issues found during real Telegram testing:

- navigation and view buttons could be blocked by a reused token or callback
  path and show `Accion ya ejecutada`;
- `sandbox.draft.stamp` could surface as invalid stdout in n8n instead of a
  stable Action Layer JSON result.

No new business feature was added. The change keeps Telegram as product UI,
n8n as orchestrator, and the Action Layer as the only place that runs sandbox
actions.

## Token Semantics

Action tokens are now classified by intent:

| Category | Behavior |
| --- | --- |
| `NAVIGATION` | Reusable. Does not consume `used_at`. |
| `VIEW` | Reusable. Does not consume `used_at`. |
| `MUTATION` | May be one-time when listed as sensitive. |
| `LONG_RUNNING` | May be idempotent or one-time depending on action. |
| `PAC_SANDBOX` | Protected for stamp/cancel sandbox actions. |
| `PAYMENT_STATUS` | One-time/idempotent by payment action. |
| `DESTRUCTIVE` | One-time when it changes state. |

Reusable examples:

- `MENU`
- `LIST_PENDING`
- `LIST_APPROVED`
- `LIST_CLIENTS`
- `VIEW_DRAFT`
- `VIEW_SUMMARY`
- `HELP`
- `BACK_PENDING`
- `BACK_TO_DRAFT`

Sensitive one-time examples:

- `CONFIRM`
- `APPROVE_DRAFT`
- `DISCARD_DRAFT`
- `RESTORE_DRAFT`
- `STAMP_DRAFT_SANDBOX`
- `REQUEST_CANCEL_SANDBOX`
- `CONFIRM_CANCEL_SANDBOX`
- `MARK_PAYMENT_*`

For sensitive duplicate clicks, the bot now answers with a contextual message:

```text
Esta accion ya fue procesada.
No se ejecuto de nuevo.
```

and includes a recovery keyboard. Navigation and view buttons render their
target view again and do not show the duplicate-action text.

## Sandbox Menu Behavior

The following callbacks are reusable navigation or view paths:

- `cfdi_nav:admin`
- `cfdi_nav:pac_sbx`
- `cfdi_sbx:menu`
- `cfdi_sbx:preflight`
- `cfdi_sbx:latest`
- `cfdi_sbx:audit`

Long-running sandbox callbacks remain idempotency-protected:

- `cfdi_sbx:smoke_create`
- `cfdi_sbx:smoke_download`
- `cfdi_sbx:smoke_cancel`
- `cfdi_sbx:full`
- `cfdi_nav:acctpkg`

This prevents duplicate long-running executions while keeping menus and status
views clickable more than once.

## Draft Stamp Stdout Contract

`node scripts/run-sandbox-action.js sandbox.draft.stamp ...` must always emit a
single final JSON object to stdout. If the action fails, the JSON includes:

- `ok`
- `status`
- `action`
- `error_class`
- `errors`
- `warnings`
- `sensitive_findings`
- `artifacts`

The draft stamp action now also provides stable validation codes such as:

- `DRAFT_CONTEXT_MISSING`
- `CLIENT_NOT_VALIDATED`
- `RFC_MISSING`
- `REGIMEN_MISSING`
- `FISCAL_ZIP_MISSING`
- `CONCEPT_MISSING`
- `AMOUNT_MISSING`
- `TAX_MODE_MISSING`

n8n still prefers a clean full-stdout JSON parse. If stdout contains controlled
noise, the summary node can parse the last JSON object. If parsing still fails,
it returns a sanitized diagnostic with stdout/stderr previews and never exposes
tokens, credentials, RFC, paths, XML, PDF, ZIP, Excel, CSD or `.env` values.

## No-Go

- No phase 7.15 implementation.
- No new business actions.
- No production PAC.
- No production stamping.
- No XML/PDF/ZIP/Excel by Telegram.
- No runtime versioning.
- No credentials or `.env`.
- No changes to `data/concepts.normalized.json`.

## Tests

Primary tests:

```bash
node scripts/test-telegram-token-semantics.js
node scripts/test-sandbox-draft-stamp-stdout-contract.js
```

Regression tests:

```bash
node scripts/test-approved-draft-to-pac-sandbox.js
node scripts/test-sandbox-cfdi-lifecycle-cancellation.js
node scripts/test-payment-status-command-adapter.js
node scripts/test-accountant-package-product-integration.js
node scripts/test-local-startup-and-stamp-diagnostics.js
node scripts/test-local-ingest-workflow-contract.js
node scripts/test-local-ingest-response-contract.js
node scripts/test-local-ingest-security-enforcement.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
```

## Exit Criteria

- Navigation and view buttons can be clicked repeatedly.
- `Admin/Sandbox` and `PAC Sandbox` do not block the panel on repeated clicks.
- Sensitive actions remain one-time or idempotent.
- Double-clicking sandbox stamp does not create a second CFDI sandbox.
- `sandbox.draft.stamp` stdout is stable JSON in success and error paths.

Next recommended phase: `7.15 Telegram Product E2E Signoff`.
