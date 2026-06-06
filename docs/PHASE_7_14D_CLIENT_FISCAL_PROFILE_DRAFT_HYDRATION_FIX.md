# Phase 7.14D - Client Fiscal Profile, Draft Hydration and Sandbox Stamp Context Fix

Fecha de cierre: 2026-06-06

## Objetivo

Corregir el flujo real de clientes y timbrado sandbox para que el bot use el
perfil fiscal vigente de `cfdi_clients`, no un `client_snapshot` historico o
incompleto del borrador, y para que los errores controlados conserven contexto
operativo suficiente para reintentar sin perder el borrador.

Esta fase no habilita PAC productivo, timbrado real, XML/PDF/ZIP/Excel por
Telegram, datos reales fuera de la base local ni Fase 7.15.

## Cambios cerrados

- El listado de clientes ahora expone botones tokenizados `Ver N` con payload
  interno basado en `client_id`, sin poner RFC ni datos fiscales sensibles en
  `callback_data`.
- La validacion por numero visual queda limitada al contexto de seleccion
  vigente. Un comando como `/validarcliente 4` ya no valida literalmente el
  cliente `"4"` ni valida sin resolver el `client_id` real.
- El detalle de cliente muestra perfil fiscal seguro, campos faltantes y
  botones de editar/validar/resumen sin exponer datos sensibles en callbacks.
- `sandbox.draft.stamp` hidrata el borrador desde PostgreSQL usando el cliente
  actual de `cfdi_clients` cuando existe, y conserva el snapshot historico solo
  como referencia.
- Los errores de sandbox stamp conservan `draft_id`, cliente, total y estados
  (`status`, `invoice_status`, `payment_status`) cuando estan disponibles.
- `SANDBOX_ERROR` queda como estado reintentable.
- `DRAFT_ALREADY_SANDBOX_STAMPED` se dispara solo ante evidencia de timbrado
  sandbox exitoso, no por errores previos ni por `sandbox_stamp_result` fallido.

## Guardrails

- `data/concepts.normalized.json` no se modifica.
- No se toca Excel/PDF fuente.
- No se implementa PAC productivo.
- No se timbra CFDI real.
- No se envia XML/PDF/ZIP/Excel por Telegram.
- No se versiona `runtime/`, credenciales, `.env`, CSD ni datos reales.
- No se implementa Fase 7.15.

## Pruebas de cobertura

```text
scripts/test-client-fiscal-profile-ux.js
scripts/test-client-search-selection-ux.js
scripts/test-client-validation-persistence.js
scripts/test-sandbox-draft-client-hydration.js
scripts/test-sandbox-draft-stamp-context-preservation.js
scripts/test-sandbox-draft-already-stamped-semantics.js
scripts/test-sandbox-draft-stamp-db-loader.js
scripts/test-sandbox-action-cli-json-contract.js
scripts/test-sandbox-draft-status-mapping.js
scripts/test-approved-draft-to-pac-sandbox.js
scripts/test-sandbox-draft-stamp-stdout-contract.js
scripts/test-telegram-token-semantics.js
scripts/test-telegram-pac-sandbox-draft-selection-ux.js
scripts/test-client-invoice-ledger-view.js
scripts/test-client-billing-summary-view.js
scripts/test-local-ingest-workflow-contract.js
scripts/test-local-ingest-response-contract.js
scripts/test-local-ingest-security-enforcement.js
scripts/test-repo-safety.js
scripts/test-n8n-workflow-guardrails.js
```

## Criterio de cierre

7.14D queda cerrada cuando los tests anteriores pasan y el workflow principal
mantiene respuestas explicitas para botones/acciones de cliente, sin callbacks
sensibles y sin romper la ruta sandbox local existente.

Siguiente fase recomendada: `7.15 Telegram Product E2E Signoff`.
