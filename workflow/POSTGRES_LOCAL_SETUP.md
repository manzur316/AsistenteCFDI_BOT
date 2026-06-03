# Setup PostgreSQL Local

Este proyecto usa PostgreSQL local como memoria, historial, drafts y estado de polling del bot CFDI.

## Crear Usuario y Base

En PowerShell, con `psql` disponible:

```powershell
psql -h localhost -p 5432 -U postgres -c "CREATE USER cfdi_bot_user WITH PASSWORD 'CAMBIAR_PASSWORD_LOCAL';"
psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE cfdi_bot OWNER cfdi_bot_user;"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -c "GRANT ALL PRIVILEGES ON DATABASE cfdi_bot TO cfdi_bot_user;"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/001_init_cfdi_bot.sql"
```

`CAMBIAR_PASSWORD_LOCAL` es placeholder. No guardes la contrasena real en GitHub, `.env`, workflows, README, logs ni runtime.

## Credencial en n8n

Crea una credencial PostgreSQL en n8n:

```text
Host: localhost
Port: 5432
Database: cfdi_bot
User: cfdi_bot_user
Password: la contrasena local real
SSL: disabled
```

Luego abre `workflow/cfdi_telegram_postgres_polling.n8n.json` y asigna esa credencial a todos los nodos PostgreSQL.

## Workflow

Importar:

```text
workflow/cfdi_telegram_postgres_polling.n8n.json
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

## Seguridad

- No webhook.
- No Telegram Trigger.
- No ngrok.
- No PAC.
- No timbrado CFDI.
- No WhatsApp API.
- No token real en archivos.
- No contrasenas reales versionadas.
