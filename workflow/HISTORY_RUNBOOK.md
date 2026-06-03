# Historial Local y Comandos Telegram

Runbook para el workflow:

```text
workflow/cfdi_telegram_polling_with_history.n8n.json
```

## Alcance

- MVP personal Emberhub.
- Sin contadores.
- Sin multi-tenant.
- Sin WhatsApp API.
- Sin webhook.
- Sin PAC.
- Sin timbrado CFDI.
- Sin token real en archivos.

## Archivos runtime

Ruta esperada:

```text
C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime
```

Archivos generados por el workflow:

```text
runtime/telegram-state.json
runtime/telegram-events.jsonl
runtime/cfdi-drafts.jsonl
runtime/actions-log.jsonl
```

El workflow crea `runtime/`, `telegram-state.json` y los archivos `.jsonl` si no existen.

`telegram-state.json` guarda el offset anti-spam, updates ya procesados y aclaraciones pendientes por chat:

```json
{
  "lastTelegramUpdateId": 0,
  "processedUpdateIds": [],
  "chatStates": {},
  "lastRunAt": "",
  "workflowVersion": ""
}
```

## Como importar

1. Arrancar n8n:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
n8n start
```

2. Abrir:

```text
http://localhost:5678
```

3. Importar:

```text
workflow/cfdi_telegram_polling_with_history.n8n.json
```

4. Dejar activo solo este workflow de Telegram.

Si tambien importaste o activaste un workflow anterior como:

```text
workflow/cfdi_telegram_polling_local.n8n.json
```

desactivalo antes de probar. Si dos workflows hacen polling con el mismo bot, Telegram puede recibir respuestas duplicadas o respuestas del flujo viejo.

5. En `Set Config`, reemplazar solo:

```text
telegramBotToken = REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N
```

6. Mantener:

```text
catalogPath = C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json
runtimePath = C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime
pollingLimit = 10
```

## Comandos Telegram

Los comandos se procesan antes del scoring. Si un mensaje inicia con `/`, no pasa por el scoring normal.

```text
/pendientes
```

Devuelve los ultimos borradores con `status=PENDIENTE`.

```text
/hoy
```

Devuelve resumen del dia: pendientes, aprobados, descartados y bloqueados.

```text
/aprobadas
```

Devuelve los ultimos borradores con `status=APROBADO`.

```text
/aprobar DRAFT_ID
```

Marca el borrador como `APROBADO` y registra la accion en `actions-log.jsonl`.

```text
/descartar DRAFT_ID
```

Marca el borrador como `DESCARTADO` y registra la accion en `actions-log.jsonl`.

```text
/detalle DRAFT_ID
```

Devuelve el detalle del borrador.

```text
/debug
```

Devuelve `workflowVersion`, `catalogPath`, `runtimePath`, `lastTelegramUpdateId`, si existe `chatState` para ese chat y timestamp.

```text
/cancelar
```

Limpia una aclaracion pendiente guardada en `chatStates` para ese chat.

## Crear borradores

Un mensaje normal se clasifica con el mismo motor CFDI validado.

Si el resultado es:

```text
action = SUGERIR
ready_to_copy = true
```

el workflow crea un borrador en:

```text
runtime/cfdi-drafts.jsonl
```

El `draft_id` tiene este formato:

```text
DRAFT-YYYYMMDD-HHMMSS-updateId
```

Los resultados `PEDIR_ACLARACION`, `BLOQUEAR` y `AGREGAR_ACTIVIDAD` se guardan en `telegram-events.jsonl`, pero no crean borrador facturable pendiente.

## Modelo append-only

Los archivos son JSONL append-only.

Cuando se aprueba o descarta un borrador, el workflow no reescribe el archivo completo. Agrega una nueva version del mismo `draft_id` con el nuevo `status`. Al consultar, se toma la ultima version de cada `draft_id`.

Esto evita operaciones destructivas y deja trazabilidad.

## Como probar

Enviar al bot:

```text
revisé cámaras hikvision sin imagen
```

Debe responder con una sugerencia y un `Borrador pendiente: DRAFT-...`.

Luego probar:

```text
/pendientes
/detalle DRAFT_ID
/aprobar DRAFT_ID
/aprobadas
/descartar DRAFT_ID
/hoy
/debug
```

Para un caso ambiguo:

```text
servicio técnico general
```

Debe guardarse como evento, sin crear borrador pendiente.

Para un caso bloqueado:

```text
desarrollé una app móvil
```

Debe guardarse como evento bloqueado, sin crear borrador pendiente.

Para confirmar que responde el workflow correcto, envia:

```text
/debug
```

Debe mostrar:

```text
workflowVersion: CFDI_WITH_HISTORY_3C2_ROUTER_FIX
```

## Resetear historial de pruebas

Para borrar historial de prueba:

1. Desactivar el workflow en n8n.
2. Respaldar runtime si hace falta.
3. Borrar estos archivos:

```text
runtime/telegram-state.json
runtime/telegram-events.jsonl
runtime/cfdi-drafts.jsonl
runtime/actions-log.jsonl
```

4. Volver a activar el workflow. Se recrean automaticamente.

Si quieres conservar drafts pero reiniciar solo el offset/chatState de Telegram, borra solo:

```text
runtime/telegram-state.json
```

Importante: si borras `telegram-state.json`, Telegram puede volver a entregar updates antiguos que sigan en su cola. Hazlo solo con el workflow desactivado y despues de confirmar que no hay otro workflow Telegram activo.

## Respaldar runtime

Copiar la carpeta:

```text
C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime
```

a una ubicacion privada, por ejemplo:

```text
C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/backups/runtime-YYYYMMDD
```

No guardes tokens reales en `runtime/`, logs, README, JSON ni tests.

## Seguridad

- No hay webhook.
- No hay Telegram Trigger.
- No hay WhatsApp API.
- No hay PAC.
- No hay timbrado CFDI.
- El bot solo sugiere conceptos y mantiene borradores para captura manual.
- El token real debe pegarse solo en n8n, dentro de `Set Config`.
