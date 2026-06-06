# Phase 7.10B - Telegram PAC Sandbox Draft Selection and Callback UX

Fecha: 2026-06-05

## Objetivo

Endurecer la UX del menu Telegram para evitar confusion entre pruebas tecnicas
del proveedor PAC Sandbox y el timbrado sandbox de borradores reales aprobados.

Esta fase no habilita PAC productivo, timbrado fiscal real, XML/PDF/ZIP/Excel
por Telegram ni cambios de reglas fiscales.

## Cambios de producto

El submenu PAC Sandbox queda separado conceptualmente en:

- Proveedor / pruebas tecnicas.
- Borradores aprobados para timbrado sandbox.

Los botones smoke quedan etiquetados como pruebas tecnicas:

- `Preflight proveedor`
- `Smoke: timbrar fixture sandbox`
- `Smoke: timbrar + XML/PDF`
- `Smoke: timbrar + cancelar`
- `Ultimo resultado tecnico`
- `Audit sandbox`

El timbrado sandbox de borrador real queda detras de:

- `Borradores aprobados para timbrar`
- Botones tokenizados `Timbrar sandbox` con callback `cfdi:<token>`

## Reglas de borradores aprobados

La lista de PAC Sandbox muestra solo borradores:

- `APROBADO`
- sin timbrado sandbox previo
- sin estado `SANDBOX_TIMBRANDO`
- sin estado `SANDBOX_TIMBRADO`
- sin estado `SANDBOX_CANCELADO`

Si no hay borradores listos, el bot responde:

```text
No hay borradores aprobados listos para timbrado sandbox.
```

El callback no contiene `draft_id`, cliente, RFC, UUID, UID, monto, ruta ni datos
fiscales. La accion real se resuelve con action token local y usa
`sandbox.draft.stamp`.

## Smoke tecnico vs borrador real

Los callbacks `cfdi_sbx:smoke_create`, `cfdi_sbx:smoke_download` y
`cfdi_sbx:smoke_cancel` ejecutan fixtures tecnicos del proveedor:

```text
sandbox.smoke.create
sandbox.smoke.download
sandbox.smoke.cancel
```

No usan borradores reales del usuario.

El timbrado sandbox de borrador aprobado usa:

```text
sandbox.draft.stamp
```

## Callback UX

Para reducir ruido cuando Telegram/n8n deja un boton "pensando", los callbacks
duplicados o ya procesados responden con mensajes minimos:

```text
Accion ya en proceso.
Accion ya ejecutada.
```

En el flujo actual de n8n el ACK y el procesamiento largo siguen dentro del
workflow principal. La defensa operativa es:

- idempotencia antes de ejecutar acciones largas;
- marca `IN_PROGRESS` antes del Execute Command;
- respuesta minima para duplicados;
- no enviar teclados grandes en duplicados.

## Clientes UX

Dentro del menu Clientes se elimina el boton redundante `Ver clientes`, porque
el usuario ya esta en la vista/listado de clientes. Se conservan las entradas:

- Facturas del cliente
- Pendientes pago
- Pagadas
- Canceladas
- Buscar cliente
- Nuevo cliente
- Validar cliente, solo OWNER

## Seguridad

- Solo OWNER/admin puede ver o ejecutar PAC Sandbox.
- No PAC productivo.
- No timbrado fiscal real.
- No XML/PDF/ZIP/Excel por Telegram.
- No credenciales PAC en workflow.
- No URL de produccion de Factura.com.
- No headers PAC en workflow.
- No cambios en `data/concepts.normalized.json`.
- No versionar `runtime/`.

## Tests

Pruebas agregadas o actualizadas:

```text
scripts/test-telegram-pac-sandbox-draft-selection-ux.js
scripts/test-telegram-pac-sandbox-console.js
scripts/test-telegram-callback-reliability-idempotency.js
scripts/test-telegram-product-flow-integration.js
scripts/test-telegram-product-menu-router-adapter.js
```

## Siguiente fase recomendada

`7.11 Payment Status Command Adapter`.
