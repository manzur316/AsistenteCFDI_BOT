# Setup PostgreSQL Local

Este proyecto usa PostgreSQL local como memoria, historial, drafts y estado de polling del bot CFDI.

## Crear Usuario y Base

En PowerShell, con `psql` disponible:

```powershell
psql -h localhost -p 5432 -U postgres -c "CREATE USER cfdi_bot_user WITH PASSWORD 'CAMBIAR_PASSWORD_LOCAL';"
psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE cfdi_bot OWNER cfdi_bot_user;"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -c "GRANT ALL PRIVILEGES ON DATABASE cfdi_bot TO cfdi_bot_user;"
```

`CAMBIAR_PASSWORD_LOCAL` es placeholder. No guardes la contrasena real en GitHub, `.env`, workflows, README, logs ni runtime.

## Inicializar Tablas

Opcion recomendada: ejecutar el init SQL conectado como `cfdi_bot_user`, para que n8n use tablas creadas por el mismo usuario con el que se conecta:

```powershell
psql -h localhost -p 5432 -U cfdi_bot_user -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/001_init_cfdi_bot.sql"
psql -h localhost -p 5432 -U cfdi_bot_user -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/003_clients_amounts_tax.sql"
```

Opcion alternativa: si ejecutas el init SQL como `postgres`, confirma despues los permisos para `cfdi_bot_user`:

```powershell
psql -h localhost -p 5432 -U postgres -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/001_init_cfdi_bot.sql"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/003_clients_amounts_tax.sql"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -c "GRANT USAGE ON SCHEMA public TO cfdi_bot_user;"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfdi_bot_user;"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cfdi_bot_user;"
```

Los archivos `sql/001_init_cfdi_bot.sql` y `sql/003_clients_amounts_tax.sql` tambien incluyen estos `GRANT` al final como respaldo cuando `cfdi_bot_user` ya existe.

## Cliente Demo Opcional

Para probar deteccion de cliente sin subir datos reales, puedes cargar el seed ficticio:

```powershell
psql -h localhost -p 5432 -U cfdi_bot_user -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/003_seed_clients.example.sql"
```

Ese archivo solo contiene `CLI-DEMO-RIVERA`. No guardes clientes reales en SQL versionado.

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
- No clientes reales en archivos versionados.
- Todo calculo fiscal es conservador: BORRADOR SUJETO A REVISION HUMANA.
