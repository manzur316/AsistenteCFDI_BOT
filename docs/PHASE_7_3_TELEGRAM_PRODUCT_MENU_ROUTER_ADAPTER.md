# Phase 7.3 Telegram Product Menu Router Adapter

Fecha: 2026-06-05

Estado: implementado como adapter de router en el workflow primario local.

## Alcance

La fase 7.3 conecta callbacks del menu producto Telegram con el router actual
de `workflow/cfdi_telegram_local_ingest.n8n.json`.

No crea workflow nuevo, no llama PAC, no timbra, no envia XML/PDF/ZIP/Excel por
Telegram y no cambia la logica fiscal ni el catalogo de conceptos.

## Punto de entrada

La topologia aprobada sigue vigente:

```text
Telegram
-> runner/telegram-local-runner.js
-> workflow/cfdi_telegram_local_ingest.n8n.json
-> Router interno
-> Action Layer / PostgreSQL / modulos reutilizables
```

El workflow `cfdi_sandbox_action_router.n8n.json` permanece como router tecnico
admin/sandbox y no representa la experiencia diaria del usuario.

## Callbacks soportados

### Navegacion producto `cfdi_nav:*`

| callback | comportamiento | rol |
|---|---|---|
| `cfdi_nav:menu` | muestra menu producto seguro | OWNER, ASSISTANT_OPERATOR, ACCOUNTANT_READONLY |
| `cfdi_nav:new` | inicia flujo existente de `/factura` | OWNER, ASSISTANT_OPERATOR |
| `cfdi_nav:clients` | lista clientes y muestra acciones de cliente | OWNER, ASSISTANT_OPERATOR |
| `cfdi_nav:drafts` | lista borradores pendientes | OWNER, ASSISTANT_OPERATOR |
| `cfdi_nav:report` | muestra resumen mensual seguro o sin datos | OWNER, ACCOUNTANT_READONLY |
| `cfdi_nav:acctpkg` | responde pendiente explicito | OWNER, ACCOUNTANT_READONLY |
| `cfdi_nav:status` | muestra estado local seguro | OWNER, ASSISTANT_OPERATOR, ACCOUNTANT_READONLY |
| `cfdi_nav:help` | muestra ayuda contextual | OWNER, ASSISTANT_OPERATOR, ACCOUNTANT_READONLY |
| `cfdi_nav:admin` | abre submenu admin/sandbox | OWNER |
| `cfdi_nav:client_find` | indica uso seguro de busqueda de cliente | OWNER, ASSISTANT_OPERATOR |
| `cfdi_nav:client_new` | inicia plantilla existente de nuevo cliente | OWNER, ASSISTANT_OPERATOR |
| `cfdi_nav:client_validate` | indica uso de validacion por humano | OWNER |

### Action tokens `cfdi:<token>`

Los action tokens existentes se conservan para acciones sensibles o con estado:
confirmar, editar, cancelar, ver detalle, aprobar, descartar, regresar a
borrador y acciones de edicion. Esta fase no cambia el formato del token ni sus
guardrails.

### Sandbox `cfdi_sbx:*`

Los callbacks sandbox quedan visibles solo para OWNER. En el workflow primario
no ejecutan el router tecnico; responden de forma explicita y segura para evitar
silencio o reintentos ambiguos.

| callback | comportamiento |
|---|---|
| `cfdi_sbx:menu` | muestra menu admin/sandbox local |
| `cfdi_sbx:full` | pendiente explicito en workflow primario |
| `cfdi_sbx:preflight` | pendiente explicito en workflow primario |

## Acciones pendientes explicitas

Cuando una opcion visible aun no tiene ejecucion operativa en el workflow
primario, la respuesta es:

```text
Esta opcion todavia esta en preparacion.
```

La respuesta incluye botones de regreso y conserva la advertencia:

```text
Borrador sujeto a revision humana. No sustituye contador.
```

## Roles

- `OWNER`: puede ver menu completo, admin/sandbox y acciones de reporte.
- `ASSISTANT_OPERATOR`: puede crear borradores, ver clientes basicos,
  pendientes, estado y ayuda. No ve ni ejecuta admin/sandbox.
- `ACCOUNTANT_READONLY`: puede ver reporte, paquete contador pendiente,
  estado y ayuda. No crea borradores ni administra clientes.

Los callbacks no autorizados responden de forma segura con `ACCESS_DENIED`.

## Seguridad

Los callbacks estaticos aceptados cumplen:

- longitud maxima de 32 caracteres;
- caracteres seguros `[a-z0-9_:.-]`;
- sin RFC;
- sin UUID/UID;
- sin montos;
- sin rutas;
- sin XML/PDF/ZIP/Excel;
- sin tokens ni credenciales.

El workflow no agrega nodos para enviar documentos por Telegram y no llama PAC
productivo.

## Pruebas

Se agrega:

```text
scripts/test-telegram-product-menu-router-adapter.js
```

La prueba ejecuta el Code Node real `Handle Commands And Scoring` con callbacks
visibles del renderer 7.2 y valida:

- todos los botones visibles tienen destino;
- OWNER ve admin/sandbox;
- ASSISTANT_OPERATOR no ve ni ejecuta admin/sandbox;
- callbacks desconocidos responden pendiente explicito;
- acciones pendientes no fallan silenciosamente;
- no se agregan envios de archivos ni llamadas PAC.

## Limites

Esta fase no implementa:

- PAC real;
- timbrado;
- produccion;
- envio de XML/PDF/ZIP/Excel por Telegram;
- interfaz web;
- nuevos conceptos fiscales;
- cambios al scoring fiscal.

## Siguiente fase recomendada

`7.4 Product Flow Integration`
