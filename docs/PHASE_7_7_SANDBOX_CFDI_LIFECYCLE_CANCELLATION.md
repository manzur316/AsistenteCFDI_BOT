# Phase 7.7 - Sandbox CFDI Lifecycle And Cancellation

## Status

Implemented as a sandbox-only lifecycle slice.

This phase lets an OWNER/admin cancel a previously sandbox-stamped CFDI from the
Telegram product flow. It does not enable productive fiscal cancellation and it
does not send documents through Telegram.

## Flow

```text
Draft APROBADO
-> sandbox.draft.stamp
-> SANDBOX_TIMBRADO
-> OWNER/admin presses Cancelar CFDI sandbox
-> confirmation shown
-> OWNER/admin presses Si, cancelar sandbox
-> workflow/cfdi_telegram_local_ingest.n8n.json
-> Action Layer: sandbox.draft.cancel
-> FacturaComSandboxAdapter.cancelInvoice
-> runtime/storage-sandbox/draft-cancellations/
-> cfdi_drafts status update
-> bot_events timeline
-> safe Telegram summary
```

## Implemented Behavior

- `Cancelar CFDI sandbox` appears only for draft status `SANDBOX_TIMBRADO`.
- The button is hidden for `BORRADOR`, `PENDIENTE`, `APROBADO`,
  `SANDBOX_ERROR`, `SANDBOX_CANCELADO` and production-like states.
- The first click does not execute cancellation. It shows:
  `¿Confirmas cancelar este CFDI sandbox?`
- The confirmation keyboard contains:
  - `Si, cancelar sandbox`
  - `No, volver`
- The second click invokes allowlisted Action Layer action
  `sandbox.draft.cancel`.
- The workflow marks the draft `SANDBOX_CANCELANDO` before execution and then
  `SANDBOX_CANCELADO` or `SANDBOX_CANCEL_ERROR` after the Action Layer result.
- Action tokens use short `cfdi:<token>` callback data and do not include RFC,
  UUID, UID, client data, amounts, filesystem paths, credentials or fiscal data.

## Validation Gates

The workflow and Action Layer block cancellation when:

- the draft/invoice does not exist;
- the status is not `SANDBOX_TIMBRADO`;
- the CFDI is already `SANDBOX_CANCELADO`;
- another cancellation is in progress;
- sandbox identity is missing;
- `FACTURACOM_SANDBOX_LIVE` is not `1`;
- a production Factura.com URL is present;
- the adapter returns a cancellation error.

## States

The lifecycle uses these sandbox-only states:

- `SANDBOX_CANCELACION_PENDIENTE`
- `SANDBOX_CANCELANDO`
- `SANDBOX_CANCELADO`
- `SANDBOX_CANCEL_ERROR`

## Timeline Events

The workflow records:

- `DRAFT_SANDBOX_CANCEL_REQUESTED`
- `DRAFT_SANDBOX_CANCEL_CONFIRMATION_SHOWN`
- `DRAFT_SANDBOX_CANCEL_IN_PROGRESS`
- `DRAFT_SANDBOX_CANCEL_RESULT`
- `DRAFT_SANDBOX_CANCEL_BLOCKED`

## Storage

The Action Layer stores a safe cancellation response manifest under:

```text
runtime/storage-sandbox/draft-cancellations/
```

Original sandbox artifacts are not deleted. Naming moves or storage
reclassification remain out of scope for this phase.

## Telegram Summary

Success responses include:

- `Cancelacion sandbox OK`;
- provider `Factura.com Sandbox`;
- state `SANDBOX_CANCELADO`;
- internal draft/invoice label;
- warnings/errors summary;
- local artifacts count;
- sandbox-only notice;
- human review warning;
- buttons for `Ver detalle`, `Ver ultimo resultado sandbox` and
  `Menu principal`.

No XML, PDF, ZIP or Excel files are sent through Telegram in this phase.

## Security Boundaries

- Sandbox only.
- No productive PAC call.
- No `stampProduction`.
- No productive cancellation.
- No production URL in the workflow.
- No PAC credentials or provider headers in the workflow.
- No CSD or `.env` data in the workflow.
- No XML/PDF/ZIP/Excel over Telegram.
- No changes to `data/concepts.normalized.json`.
- No runtime artifacts are versioned.

## Tests

Primary test:

```text
node scripts/test-sandbox-cfdi-lifecycle-cancellation.js
```

Related regression tests:

```text
node scripts/test-approved-draft-to-pac-sandbox.js
node scripts/test-telegram-callback-reliability-idempotency.js
node scripts/test-telegram-pac-sandbox-console.js
node scripts/test-local-ingest-workflow-contract.js
node scripts/test-local-ingest-response-contract.js
node scripts/test-local-ingest-security-enforcement.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
node scripts/test-sandbox-action-runner.js
```

## Not In Scope

- Productive fiscal stamping.
- Productive CFDI cancellation.
- Calling production Factura.com endpoints.
- Sending XML/PDF/ZIP/Excel over Telegram.
- Web interface.
- Storage reclassification or artifact migration.
- Changes to fiscal scoring or SAT catalog.

## Next Phase

`7.8 Sandbox lifecycle storage review`
