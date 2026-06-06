# Phase 7.5 - Telegram PAC Sandbox Stamping Console

Fecha: 2026-06-05

## Proposito

La fase 7.5 agrega una consola OWNER/admin dentro del workflow primario de
Telegram para operar acciones controladas de Factura.com Sandbox desde el menu
de producto.

Esta fase permite timbrado sandbox de prueba cuando la configuracion local
`FACTURACOM_SANDBOX_LIVE=1` esta activa. No habilita timbrado productivo fiscal
real.

## Terminologia

- `Factura.com`: proveedor PAC de produccion.
- `Factura.com Sandbox`: proveedor PAC de prueba.
- `timbrado sandbox`: timbrado de prueba contra Factura.com Sandbox.
- `timbrado productivo`: timbrado fiscal real contra Factura.com produccion.
- `PAC Adapter Hub`: capa neutral del sistema.
- `FacturaComSandboxAdapter`: primer adapter sandbox.
- `FacturaComProductionAdapter`: adapter productivo futuro, bloqueado.

## Arquitectura

```text
Telegram OWNER/admin
-> workflow/cfdi_telegram_local_ingest.n8n.json
-> Execute PAC Sandbox Action
-> node scripts/run-sandbox-action.js <accion allowlisted>
-> PAC Adapter Hub
-> FacturaComSandboxAdapter
-> Factura.com Sandbox
-> runtime/storage-sandbox y audit local
-> resumen seguro por Telegram
```

El workflow principal no llama directamente a Factura.com, no contiene URL de
produccion, headers PAC, credenciales, CSD ni `.env`. n8n sigue siendo
orquestador y delega la operacion al Action Layer allowlisted.

## Consola Telegram

Entrada OWNER/admin:

- Menu principal -> Admin/Sandbox -> PAC Sandbox.
- Callback: `cfdi_nav:pac_sbx`.

Texto obligatorio:

```text
Proveedor actual: Factura.com Sandbox
Factura.com Sandbox: CFDI de prueba. No es produccion fiscal real.
Borrador sujeto a revision humana. No sustituye contador.
```

Botones:

| Boton | Callback | Action Layer |
| --- | --- | --- |
| Preflight proveedor | `cfdi_sbx:preflight` | `sandbox.preflight` |
| Borradores aprobados para timbrar | `cfdi_nav:sbx_drafts` | lista tokenizada para `sandbox.draft.stamp` |
| Smoke: timbrar fixture sandbox | `cfdi_sbx:smoke_create` | `sandbox.smoke.create` |
| Smoke: timbrar + XML/PDF | `cfdi_sbx:smoke_download` | `sandbox.smoke.download` |
| Smoke: timbrar + cancelar | `cfdi_sbx:smoke_cancel` | `sandbox.smoke.cancel` |
| Ultimo resultado tecnico | `cfdi_sbx:latest` | `sandbox.latest.result` |
| Ver audit sandbox | `cfdi_sbx:audit` | `sandbox.audit.summary` |
| Volver | `cfdi_nav:admin` | submenu admin |

Los callbacks son cortos, no incluyen RFC, UUID, UID, montos, rutas,
credenciales ni datos fiscales.

Nota 7.10B: los botones `sandbox.smoke.*` son pruebas tecnicas con fixture del
proveedor. El timbrado sandbox de un borrador real `APROBADO` se hace desde la
lista `Borradores aprobados para timbrar` y usa `sandbox.draft.stamp`.

## Respuestas seguras

Cada accion devuelve solo resumen:

- proveedor;
- accion allowlisted;
- status;
- modo sandbox habilitado, deshabilitado o requiere revision;
- duracion;
- conteo de artifacts;
- conteo de warnings;
- conteo de errors;
- conteo de sensitive findings.

No se envia XML, PDF, ZIP ni Excel por Telegram. Si `sandbox.smoke.download`
genera XML/PDF sandbox, la respuesta solo indica que quedaron disponibles
localmente.

## Roles

- OWNER: puede ver y ejecutar la consola.
- ASSISTANT_OPERATOR: no ve ni ejecuta PAC Sandbox.
- ACCOUNTANT_READONLY: no ve ni ejecuta PAC Sandbox.

Un callback manual no autorizado responde:

```text
Acceso no autorizado.
```

## Guardrails

- Produccion fiscal real sigue bloqueada.
- Factura.com produccion no se llama desde esta fase.
- El workflow principal no contiene URL directa de Factura.com produccion.
- No hay headers `F-*`, claves, tokens, CSD, `.env` ni credenciales.
- No se modifica `data/concepts.normalized.json`.
- No se versiona `runtime/`.
- No se conectan borradores aprobados reales al PAC en esta fase.

## Limite de la fase

Las acciones usan fixtures/smoke sandbox existentes. La conexion entre un
borrador aprobado real del bot y `stampSandbox` queda para:

```text
7.6 Approved Draft to PAC Sandbox
```

## Tests

- `node scripts/test-telegram-pac-sandbox-console.js`
- `node scripts/test-telegram-product-menu-router-adapter.js`
- `node scripts/test-local-ingest-workflow-contract.js`
- `node scripts/test-local-ingest-response-contract.js`
- `node scripts/test-local-ingest-security-enforcement.js`
- `node scripts/test-n8n-workflow-guardrails.js`
- `node scripts/test-repo-safety.js`
- `node scripts/test-sandbox-action-runner.js`

## Siguiente fase recomendada

`7.6 Approved Draft to PAC Sandbox`
