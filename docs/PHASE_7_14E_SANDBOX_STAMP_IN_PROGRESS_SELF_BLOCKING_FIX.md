# Phase 7.14E - Sandbox Stamp In-Progress Self-Blocking Fix

Fecha de cierre: 2026-06-06

## Objetivo

Corregir el flujo de timbrado sandbox iniciado desde Telegram/n8n para evitar
que el propio workflow marque el borrador como `SANDBOX_TIMBRANDO` antes de
ejecutar el Action Layer y despues se auto-bloquee con
`DRAFT_SANDBOX_IN_PROGRESS`.

El Action Layer ya funciona por CLI directo con `sandbox.draft.stamp --draft-id`.
La correccion de esta fase mantiene ese camino como fuente de verdad para el
estado final.

## Decision tecnica

Se aplica la opcion A:

- n8n no marca `invoice_status=SANDBOX_TIMBRANDO` antes de ejecutar
  `sandbox.draft.stamp`.
- n8n conserva solo el evento idempotente `DRAFT_SANDBOX_STAMP_IN_PROGRESS`
  para bloquear dobles clicks o callbacks repetidos.
- el comando de stamp usa `--draft-id` y deja de enviar `--draft-json-b64` para
  evitar snapshots stale.
- el Action Layer carga el borrador vigente desde PostgreSQL y escribe el
  resultado final mediante el resumen del workflow.

## Estados esperados

Antes de timbrar:

```text
status=APROBADO
invoice_status=APROBADO o SANDBOX_ERROR
payment_status=NO_APLICA
```

Exito:

```text
status=APROBADO
invoice_status=SANDBOX_TIMBRADO
payment_status=PENDIENTE
```

Error controlado:

```text
status=APROBADO
invoice_status=SANDBOX_ERROR
payment_status=NO_APLICA
```

`DRAFT_SANDBOX_IN_PROGRESS` queda reservado para una operacion ajena o
concurrente real; no debe aparecer en el flujo normal de un solo click.

## Guardrails

- No se implementa Fase 7.15.
- No se agregan funciones de negocio.
- No PAC productivo.
- No timbrado productivo.
- No XML/PDF/ZIP/Excel por Telegram.
- No se versiona `runtime/`.
- No se suben credenciales, `.env` ni CSD.
- No se toca `data/concepts.normalized.json`.

## Pruebas

```text
scripts/test-sandbox-stamp-in-progress-self-blocking.js
scripts/test-telegram-sandbox-stamp-workflow-state-order.js
scripts/test-sandbox-draft-stamp-db-loader.js
scripts/test-sandbox-action-cli-json-contract.js
scripts/test-sandbox-draft-status-mapping.js
scripts/test-approved-draft-to-pac-sandbox.js
scripts/test-sandbox-draft-stamp-stdout-contract.js
scripts/test-sandbox-draft-client-hydration.js
scripts/test-sandbox-draft-stamp-context-preservation.js
scripts/test-telegram-token-semantics.js
scripts/test-telegram-pac-sandbox-draft-selection-ux.js
scripts/test-local-ingest-workflow-contract.js
scripts/test-local-ingest-response-contract.js
scripts/test-local-ingest-security-enforcement.js
scripts/test-repo-safety.js
scripts/test-n8n-workflow-guardrails.js
```

Siguiente fase recomendada: `7.15 Telegram Product E2E Signoff`.
