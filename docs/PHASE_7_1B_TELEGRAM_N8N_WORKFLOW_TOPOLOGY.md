# Phase 7.1B Telegram/n8n Workflow Topology

Estado: politica de arquitectura

Fecha: 2026-06-05

## Principio Principal

```text
Telegram debe tener un unico punto de entrada operativo.
```

El producto diario no debe crecer creando multiples workflows que reciban
updates de Telegram por separado. El bot debe conservar una entrada operacional
clara y enrutar internamente hacia modulos testeables.

## Arquitectura Objetivo

```text
Telegram
  |
  v
runner/telegram-local-runner.js
  |
  v
workflow/cfdi_telegram_local_ingest.n8n.json
  |
  v
Router interno
  |
  +--> Action Layer
  +--> PostgreSQL
  +--> scripts JS reutilizables
  +--> contratos versionados
  +--> modulos testeables
```

Esta topologia mantiene a n8n como orquestador local y deja la logica pesada en
capas versionadas, testeables y reutilizables.

## Workflow Principal

```text
workflow/cfdi_telegram_local_ingest.n8n.json
```

Categoria: `PRIMARY`

Responsabilidades:

- recibir updates Telegram desde `runner/telegram-local-runner.js`;
- navegacion principal;
- comandos de usuario;
- callbacks de usuario;
- acceso a clientes;
- acceso a borradores;
- acceso a reportes;
- integracion futura con menu producto;
- delegar logica fiscal, reportes, storage y acciones tecnicas a modulos o
  Action Layer.

Este workflow representa la experiencia diaria del usuario. Ningun otro workflow
debe convertirse en segundo bot principal.

## Workflow Tecnico/Admin/Sandbox

```text
workflow/cfdi_sandbox_action_router.n8n.json
```

Categoria: `TECHNICAL_ADMIN`

Responsabilidades:

- pruebas sandbox;
- validaciones tecnicas;
- reportes sandbox;
- herramientas administrativas;
- verificacion local;
- ejecucion controlada de acciones sandbox allowlisted.

No representa la experiencia diaria del usuario. Sus comandos y
callbacks deben permanecer admin/sandbox, por ejemplo `cfdi_sbx:*`.

## Workflows Auxiliares Futuros

Permitidos solamente si tienen una responsabilidad claramente separada.

Ejemplos posibles:

- scheduler;
- webhook externo;
- miniapp;
- callback PAC futuro;
- reporting batch;
- mantenimiento.

Reglas:

- no recibir updates Telegram directamente;
- no duplicar la funcion del workflow principal;
- no convertirse en segundo bot principal;
- no contener logica fiscal pesada cuando pueda vivir en Action Layer;
- no contener contratos que puedan vivir como scripts JS versionados;
- respetar guardrails existentes;
- tener tests de contrato antes de activarse.

## Regla De Crecimiento

Las nuevas capacidades deben crecer preferentemente en:

- scripts JS;
- Action Layer;
- PostgreSQL;
- contratos;
- modulos reutilizables;
- componentes testeables.

No crear workflows independientes para cada pequena funcionalidad. Un workflow
nuevo debe existir solo cuando el trigger, ciclo de vida o responsabilidad sean
realmente distintos.

## Clasificacion De Workflows

| workflow | categoria | proposito | trigger | estado | notas |
|---|---|---|---|---|---|
| `workflow/cfdi_telegram_local_ingest.n8n.json` | `PRIMARY` | Experiencia diaria Telegram, comandos, callbacks, clientes, borradores y reportes | Webhook local desde runner | Oficial producto | Unico punto de entrada operativo para Telegram. |
| `workflow/cfdi_sandbox_action_router.n8n.json` | `TECHNICAL_ADMIN` | Acciones sandbox/admin, smoke, reportes sandbox y verificacion local | Webhook local admin/sandbox | Soportado tecnico | No es UX diaria; mantener `cfdi_sbx:*` admin/sandbox. |
| `workflow/cfdi_manual_test.n8n.json` | `LEGACY` | Prueba manual inicial del motor | Manual Trigger | Historico | No debe crecer como producto. |
| `workflow/cfdi_telegram_postgres_polling.n8n.json` | `LEGACY` | Polling Telegram con PostgreSQL | Schedule Trigger | Reemplazado por runner local | No debe recibir nuevas capacidades de producto. |
| `workflow/cfdi_telegram_polling_local.n8n.json` | `LEGACY` | Polling local historico | Schedule Trigger | Historico | Mantener solo como referencia. |
| `workflow/cfdi_telegram_polling_with_history.n8n.json` | `LEGACY` | Polling historico con JSONL | Schedule Trigger | Historico | No usar como segundo bot. |
| Scheduler futuro | `AUXILIARY` | Tareas programadas no interactivas | Schedule Trigger | Futuro | No recibe updates Telegram. |
| Miniapp/Web Hub futuro | `FUTURE` | UI web o miniapp con lifecycle propio | Webhook/app trigger | Futuro | Debe compartir Action Layer y contratos. |
| Callback PAC futuro | `FUTURE` | Recibir eventos proveedor PAC | Webhook externo | Futuro | No debe contener logica fiscal pesada ni Telegram UX. |
| Reporting batch futuro | `AUXILIARY` | Generar reportes periodicos | Schedule Trigger | Futuro | Debe escribir a storage/PostgreSQL, no responder como bot. |

## Criterios Para Crear Workflows Futuros

Un workflow nuevo solo se justifica si cumple todos estos puntos:

- su trigger no pertenece al flujo Telegram diario;
- su responsabilidad no cabe claramente en el router interno del workflow
  principal;
- no duplica comandos ni callbacks de `cfdi_telegram_local_ingest`;
- no recibe updates Telegram directamente;
- delega logica fiscal y reglas a Action Layer o modulos JS;
- tiene documento de fase;
- tiene test de contrato;
- pasa repo safety y guardrails aplicables;
- mantiene PAC real, produccion y timbrado bloqueados salvo fase explicita.

Si una capacidad puede vivir como script JS, contrato, modulo reutilizable,
consulta PostgreSQL o Action Layer, debe vivir ahi antes de considerar un
workflow nuevo.

## Impacto En Fases 7.2, 7.3 Y 7.4

### 7.2 Telegram Product Menu Renderer

El renderer debe seguir siendo modulo puro. No debe enviar mensajes ni modificar
workflows. El workflow principal lo consumira despues mediante adapter.

### 7.3 Telegram Product Menu Router Adapter

Debe conectar comandos/callbacks del workflow principal al contrato/renderer sin
crear un workflow Telegram nuevo. La integracion esperada es:

```text
cfdi_telegram_local_ingest -> router interno -> renderer/contrato -> sendMessage
```

### 7.4 Product Flow Integration

Debe integrar la UX diaria en el workflow principal y delegar operaciones a
Action Layer, PostgreSQL y modulos reutilizables. Las herramientas sandbox deben
seguir separadas en `cfdi_sandbox_action_router`.

## No-Go

Esta fase no autoriza:

- no modificar workflows;
- tocar `runtime/`;
- cambiar logica fiscal;
- tocar `data/concepts.normalized.json`;
- llamar PAC;
- timbrar;
- implementar 7.2, 7.3 o 7.4;
- crear un segundo bot Telegram;
- enviar documentos por Telegram.

## Criterios De Salida

- Documento de topologia creado.
- Workflow principal declarado como `PRIMARY`.
- Workflow tecnico/admin declarado como `TECHNICAL_ADMIN`.
- Regla de unico punto de entrada Telegram documentada.
- Tabla de clasificacion incluida.
- Reglas de crecimiento documentadas.
- Criterios para workflows futuros documentados.
- Test documental PASS.

## Siguiente Fase Recomendada

```text
7.2 Telegram Product Menu Renderer
```

Nota: si el renderer ya existe en el repo, esta topologia funciona como regla
rectora para su integracion futura. No convierte el renderer en workflow ni
autoriza cambios operativos.
