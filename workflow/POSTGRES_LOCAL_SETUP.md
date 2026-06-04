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
psql -h localhost -p 5432 -U cfdi_bot_user -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/004_action_tokens.sql"
psql -h localhost -p 5432 -U cfdi_bot_user -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/005_security_access_control.sql"
```

Opcion alternativa: si ejecutas el init SQL como `postgres`, confirma despues los permisos para `cfdi_bot_user`:

```powershell
psql -h localhost -p 5432 -U postgres -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/001_init_cfdi_bot.sql"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/003_clients_amounts_tax.sql"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/004_action_tokens.sql"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/005_security_access_control.sql"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -c "GRANT USAGE ON SCHEMA public TO cfdi_bot_user;"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfdi_bot_user;"
psql -h localhost -p 5432 -U postgres -d cfdi_bot -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cfdi_bot_user;"
```

Los archivos `sql/001_init_cfdi_bot.sql`, `sql/003_clients_amounts_tax.sql`, `sql/004_action_tokens.sql` y `sql/005_security_access_control.sql` tambien incluyen estos `GRANT` al final como respaldo cuando `cfdi_bot_user` ya existe.

## Usuario Autorizado Privado

El workflow local ingest es privado por defecto. Si no existe un usuario en `cfdi_authorized_users`, el bot responde:

```text
Acceso no autorizado.
```

No procesa comandos, scoring, drafts, action tokens ni callbacks de usuarios no autorizados.

Para habilitar tu usuario local:

1. Copia `sql/006_seed_authorized_user.example.sql` a un archivo local no versionado, por ejemplo `sql/006_seed_authorized_user.local.sql`.
2. Reemplaza:
   - `REEMPLAZAR_USER_ID`
   - `REEMPLAZAR_TELEGRAM_CHAT_ID`
   - `REEMPLAZAR_TELEGRAM_USER_ID`
3. Ejecuta la copia local:

```powershell
psql -h localhost -p 5432 -U cfdi_bot_user -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/006_seed_authorized_user.local.sql"
```

No subas la copia local. No guardes chat_id real, telegram_user_id real, tokens ni nombres reales en Git.

Para obtener `chat_id` y `telegram_user_id`, envia un mensaje de prueba y revisa la consola local de n8n o logs/runtime locales. Esos datos son privados y deben quedarse fuera del repositorio.

## Cliente Demo Opcional

Para probar deteccion de cliente sin subir datos reales, puedes cargar el seed ficticio:

```powershell
psql -h localhost -p 5432 -U cfdi_bot_user -d cfdi_bot -f "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/sql/003_seed_clients.example.sql"
```

Ese archivo solo contiene `CLI-DEMO-RIVERA`. No guardes clientes reales en SQL versionado.

## Wizard de Factura

La Fase 4.6 no agrega migracion nueva. El flujo `/factura` usa `chat_states`, `cfdi_clients`, `cfdi_drafts` y `cfdi_draft_line_items`.

El draft final se guarda como `PENDIENTE` solo despues de que Telegram muestre el preview `BORRADOR CFDI` y el usuario responda `confirmar`.

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
