# Telegram Polling con PostgreSQL Local

Workflow:

```text
workflow/cfdi_telegram_postgres_polling.n8n.json
```

Version:

```text
CFDI_POSTGRES_POLLING_V1
```

## Alcance

- MVP personal Emberhub.
- n8n local en Windows.
- PostgreSQL local en `localhost:5432`.
- Base de datos: `cfdi_bot`.
- Sin webhook.
- Sin Telegram Trigger.
- Sin ngrok.
- Sin PAC.
- Sin timbrado CFDI.
- Sin WhatsApp API.
- Sin token real en archivos.

## Crear DB Local

Ver setup detallado en:

```text
workflow/POSTGRES_LOCAL_SETUP.md
```

Comandos base:

```powershell
psql -h localhost -p 5432 -U postgres -c "CREATE USER cfdi_bot_user WITH PASSWORD 'CAMBIAR_PASSWORD_LOCAL';"
psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE cfdi_bot OWNER cfdi_bot_user;"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -c "GRANT ALL PRIVILEGES ON DATABASE cfdi_bot TO cfdi_bot_user;"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/001_init_cfdi_bot.sql"
```

`CAMBIAR_PASSWORD_LOCAL` es placeholder. No guardes passwords reales en Git.

## Tablas

El script crea:

```text
bot_state
telegram_updates
chat_states
cfdi_drafts
bot_events
send_logs
```

`bot_state` guarda `lastTelegramUpdateId`. `telegram_updates` evita reprocesar updates repetidos con `update_id` como llave primaria.

## Credenciales PostgreSQL en n8n

1. Abre `http://localhost:5678`.
2. Ve a `Credentials`.
3. Crea una credencial `Postgres`.
4. Configura:

```text
Host: localhost
Port: 5432
Database: cfdi_bot
User: cfdi_bot_user
Password: tu_password_local_real
SSL: disabled
```

5. Importa `workflow/cfdi_telegram_postgres_polling.n8n.json`.
6. En cada nodo PostgreSQL, selecciona esa credencial local.

## Config de n8n

Arranca n8n local:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
n8n start
```

En `Set Config`, reemplaza solo:

```text
telegramBotToken = REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N
```

Mantener:

```text
catalogPath = C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json
workflowVersion = CFDI_POSTGRES_POLLING_V1
pollingLimit = 10
```

## Flujo de Estado

1. Lee `bot_state.lastTelegramUpdateId`.
2. Llama `getUpdates` con `offset = lastTelegramUpdateId + 1`.
3. Inserta updates en `telegram_updates` con `ON CONFLICT DO NOTHING`.
4. Solo los updates insertados continuan al scoring o comandos.
5. Guarda eventos, drafts y chat state en PostgreSQL.
6. Envia Telegram con `continueOnFail`.
7. Registra resultado en `send_logs`.
8. Actualiza `bot_state.lastTelegramUpdateId` despues del intento de envio.

Si `sendMessage` falla, el `update_id` ya quedo registrado y no debe reprocesarse en loop.

## Comandos

```text
/start
/help
/debug
/pendientes
/hoy
/aprobadas
/aprobar DRAFT_ID
/descartar DRAFT_ID
/detalle DRAFT_ID
/cancelar
```

## Pruebas Manuales

Mensaje normal:

```text
revise camaras hikvision sin imagen
```

Debe crear draft `PENDIENTE`.

Ambiguo:

```text
servicio tecnico general
```

Debe guardar `chat_states`.

Aclaracion:

```text
cctv
```

Debe combinar con el texto anterior y resolver.

Fuente de poder:

```text
venta de fuente de poder para camara
```

Debe sugerir `PROD-CCTV-007`.

Debug:

```text
/debug
```

Debe mostrar `workflowVersion: CFDI_POSTGRES_POLLING_V1` y `database: cfdi_bot`.

## Reset Local

Para limpiar pruebas sin borrar tablas:

```sql
TRUNCATE telegram_updates, chat_states, cfdi_drafts, bot_events, send_logs;
UPDATE bot_state
SET value = jsonb_build_object(
      'lastTelegramUpdateId', 0,
      'processedUpdateIds', jsonb_build_array(),
      'workflowVersion', 'CFDI_POSTGRES_POLLING_V1',
      'lastRunAt', ''
    ),
    updated_at = now()
WHERE key = 'telegram';
```

Desactiva otros workflows Telegram antes de probar. Solo debe quedar activo este workflow.
