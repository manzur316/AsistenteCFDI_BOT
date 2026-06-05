# Phase 6A.13 Sandbox Action Audit History

Estado: implementado

## Objetivo

Registrar un historial auditable local de cada accion sandbox ejecutada por el
Action Layer, incluyendo las acciones disparadas desde el router n8n/Telegram
sandbox.

Esta fase no cambia logica fiscal, no llama PAC productivo, no timbra, no
genera XML/PDF reales y no envia archivos por Telegram.

## Ubicacion Local

El audit se escribe solo bajo `runtime/`, ignorado por Git:

```text
runtime/sandbox-action-audit/actions.jsonl
```

Cada linea es JSON independiente.

## Campos Registrados

Campos minimos por registro:

- `schema_version`
- `timestamp`
- `source_kind`
- `chat_id_redacted`
- `user_id_redacted`
- `callback_data`
- `command_token`
- `action`
- `status`
- `ok`
- `duration_ms`
- `artifacts_count`
- `warnings_count`
- `errors_count`
- `sensitive_findings_count`
- `workflow_version`

El registro conserva conteos y estado operativo, no payloads completos.

## Datos Prohibidos

El audit no debe contener:

- token Telegram;
- chat_id completo;
- user_id completo;
- RFC;
- UUID;
- UID;
- rutas absolutas;
- rutas `runtime/...`;
- XML/PDF/ZIP/Excel;
- CSD;
- `.env`;
- credenciales PAC;
- datos reales de clientes.

## Flujo n8n

n8n sigue siendo solo orquestador. No lee ni escribe filesystem desde Code
Nodes. El router sandbox construye el comando allowlisted:

```text
node scripts/run-sandbox-action.js <action_allowlisted> --audit-*
```

Los argumentos `--audit-*` contienen solo metadata segura:

- `source_kind`;
- referencias redacted de chat/user;
- `callback_data` allowlisted;
- `command_token` allowlisted;
- `workflow_version`.

El Action Layer escribe el JSONL local y devuelve stdout estable para n8n.

## Comandos

Ejecutar una accion:

```powershell
node scripts/run-sandbox-action.js sandbox.full.monthly.package
```

Analizar audit:

```powershell
node scripts/analyze-sandbox-action-audit.js
```

Ejecutar test:

```powershell
node scripts/test-sandbox-action-audit-history.js
```

## Seguridad

- El analyzer falla si detecta JSON invalido, campos faltantes, XML/PDF,
  ZIP/Excel, rutas runtime, rutas absolutas, `.env`, CSD, tokens o patrones de
  credenciales.
- Los artifacts quedan representados solo por `artifacts_count`.
- Los warnings, errors y sensitive findings quedan como conteos.
- Produccion y PAC real siguen bloqueados por el Action Layer.

## Siguiente Fase Recomendada

```text
6A.14 Sandbox audit review and retention policy
```
