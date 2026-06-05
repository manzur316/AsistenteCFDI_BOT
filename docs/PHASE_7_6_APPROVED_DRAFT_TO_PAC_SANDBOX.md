# Phase 7.6 - Approved Draft To PAC Sandbox

## Status

Implemented as a sandbox-only product slice.

This phase lets an OWNER/admin send an already approved Telegram draft to the
PAC Adapter Hub Action Layer for Factura.com Sandbox stamping. It does not
enable productive fiscal stamping.

## Flow

```text
Telegram OWNER/admin
-> approved draft button
-> cfdi:<token>
-> workflow/cfdi_telegram_local_ingest.n8n.json
-> Action Layer: sandbox.draft.stamp
-> CanonicalDraft
-> CanonicalInvoiceDocument
-> CanonicalPacRequest
-> FacturaComSandboxAdapter.stampSandbox
-> runtime/storage-sandbox/
-> cfdi_drafts status update
-> bot_events timeline
-> safe Telegram summary
```

## Implemented Behavior

- `Timbrar sandbox` appears only for draft status `APROBADO`.
- The button is hidden for pending drafts, discarded drafts, drafts in progress,
  and drafts already sandbox stamped.
- The callback uses a short `cfdi:<token>` action token. It does not include RFC,
  UUID, UID, client name, amount, SAT keys or filesystem paths in `callback_data`.
- n8n does not build PAC payloads and does not call Factura.com directly.
- n8n invokes the Action Layer with allowlisted action `sandbox.draft.stamp`.
- The Action Layer validates the draft, builds canonical contracts and calls the
  sandbox adapter.
- The workflow marks the draft `SANDBOX_TIMBRANDO` before execution and then
  `SANDBOX_TIMBRADO` or `SANDBOX_ERROR` after the Action Layer result.
- Timeline events are recorded through `bot_events`:
  `DRAFT_SANDBOX_STAMP_IN_PROGRESS` and `DRAFT_SANDBOX_STAMP_RESULT`.
- The Action Layer stores a safe sandbox manifest under `runtime/storage-sandbox/`.

## Preflight And Validation Gates

The Action Layer blocks stamping when:

- the draft does not exist;
- the draft is not `APROBADO`;
- the draft is already stamped or in progress;
- `FACTURACOM_SANDBOX_LIVE` is not `1`;
- a production Factura.com URL is present;
- the client is not human validated;
- RFC, regimen or fiscal ZIP are missing;
- concept, SAT product/service key or unit key are missing;
- amount, total, IVA amount or tax mode are missing;
- scoring blockers are still present.

## Telegram Summary

Success responses include:

- `Timbrado sandbox OK`;
- provider `Factura.com Sandbox`;
- state `SANDBOX_TIMBRADO`;
- safe client label;
- total;
- local artifacts count;
- warnings/errors summary;
- sandbox-only notice;
- human review warning.

No XML, PDF, ZIP or Excel files are sent through Telegram in this phase.

## Security Boundaries

- No productive PAC call.
- No `stampProduction`.
- No production URL in the workflow.
- No PAC credentials or provider headers in the workflow.
- No CSD or `.env` data in the workflow.
- No XML/PDF/ZIP/Excel over Telegram.
- No changes to `data/concepts.normalized.json`.
- No runtime artifacts are versioned.

## Tests

Primary test:

```text
node scripts/test-approved-draft-to-pac-sandbox.js
```

Related regression tests:

```text
node scripts/test-telegram-callback-reliability-idempotency.js
node scripts/test-telegram-pac-sandbox-console.js
node scripts/test-sandbox-action-runner.js
node scripts/test-local-ingest-workflow-contract.js
node scripts/test-local-ingest-response-contract.js
node scripts/test-local-ingest-security-enforcement.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
```

## Not In Scope

- Productive fiscal stamping.
- Production Factura.com adapter calls.
- CFDI cancellation lifecycle.
- Sending XML/PDF/ZIP/Excel over Telegram.
- Web interface.
- Changes to fiscal scoring or SAT catalog.

## Next Phase

`7.7 Sandbox CFDI Lifecycle and Cancellation`
