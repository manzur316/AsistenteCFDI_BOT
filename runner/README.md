# Runner local Telegram CFDI

Este runner usa long polling contra Telegram y manda cada update a un webhook local de n8n:

```text
Telegram getUpdates -> runner/telegram-local-runner.js -> http://127.0.0.1:5678/webhook/cfdi-local-ingest -> n8n local
```

No usa webhook publico de Telegram, ngrok, DNS ni Telegram Trigger.

## Configuracion

1. Copia `.env.local.example` a `.env.local`.
2. Rellena `TELEGRAM_BOT_TOKEN` y `RUNNER_SECRET`.
3. Configura el mismo `RUNNER_SECRET` en el nodo `Set Config` del workflow `workflow/cfdi_telegram_local_ingest.n8n.json`.

Plantilla:

```text
TELEGRAM_BOT_TOKEN=REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N
N8N_INGEST_URL=http://127.0.0.1:5678/webhook/cfdi-local-ingest
RUNNER_OFFSET_FILE=runtime/runner-offset.json
TELEGRAM_POLL_TIMEOUT_SECONDS=25
TELEGRAM_POLL_LIMIT=10
RUNNER_SECRET=CAMBIAR_SECRET_LOCAL
```

## Arranque

Arranca n8n:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
$env:N8N_RUNNERS_ENABLED="false"
n8n start
```

Arranca el runner:

```powershell
node runner/telegram-local-runner.js
```

## Paro limpio

Presiona `Ctrl+C` en la terminal del runner. Tambien maneja `SIGTERM`.

## Offset

El runner guarda el offset en:

```text
runtime/runner-offset.json
```

Si n8n responde 2xx, avanza a `update_id + 1`. Si n8n falla, no avanza offset y aplica backoff corto.

## Seguridad

- No subas `.env.local`.
- No pegues tokens reales en workflows, README ni logs.
- El runner sanitiza errores que contengan tokens de Telegram.
- n8n sigue en `127.0.0.1`; no se expone a internet.
