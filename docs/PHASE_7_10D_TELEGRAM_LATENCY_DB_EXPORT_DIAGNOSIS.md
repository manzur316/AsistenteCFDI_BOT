# Phase 7.10D - Telegram Latency DB Export and Bottleneck Diagnosis

Fecha: 2026-06-05

## Objetivo

Cerrar el hueco entre la telemetria real guardada en PostgreSQL y el analyzer
local de latencia. En 7.10C el workflow principal ya registra eventos:

```text
bot_events.event_type = TELEGRAM_LATENCY_EVENT
```

El problema era que el analyzer leia por defecto:

```text
runtime/telegram-latency/telegram-latency-events.jsonl
```

pero ese JSONL no se exportaba automaticamente desde PostgreSQL.

Esta fase no agrega funciones de negocio, no implementa 7.11, no cambia reglas
fiscales, no llama PAC productivo y no habilita timbrado real.

## Export seguro desde PostgreSQL

Script:

```text
scripts/export-telegram-latency-events.js
```

Uso local:

```powershell
$env:CFDI_PGPASSWORD="REEMPLAZAR_LOCALMENTE"
node scripts/export-telegram-latency-events.js
```

Defaults:

```text
host=127.0.0.1
port=15432
database=cfdi_bot
user=cfdi_bot_user
output=runtime/telegram-latency/telegram-latency-events.jsonl
```

Variables opcionales:

```text
CFDI_PSQL_BIN
CFDI_PGHOST
CFDI_PGPORT
CFDI_PGDATABASE
CFDI_PGUSER
CFDI_PGPASSWORD
```

Tambien se puede limitar:

```powershell
node scripts/export-telegram-latency-events.js --limit 500
```

El script usa `psql -w`; no solicita password interactivo y no imprime
credenciales.

## Analyzer

Despues de exportar:

```powershell
node scripts/analyze-telegram-bot-latency.js
```

Salidas locales ignoradas por Git:

```text
runtime/telegram-latency/telegram-latency-summary.json
runtime/telegram-latency/telegram-latency-summary.md
```

Si el JSONL no existe o esta vacio, el analyzer ya no interpreta eso como
latencia sana. Debe recomendar exportar eventos desde PostgreSQL.

## Diagnostico por etapa

El resumen calcula:

- `ack_ms`
- `db_insert_ms`
- `load_context_ms`
- `scoring_ms`
- `routing_ms`
- `action_ms`
- `send_message_ms`
- `total_ms`

Tambien reporta:

- p50/p95/p99;
- top callbacks lentos;
- slow stages;
- callbacks con ACK rapido pero `total_ms` alto;
- `MISSING_STAGE_METRIC` cuando un evento no trae una etapa.

## Patron observado

En pruebas reales se observaron callbacks con:

```text
ack_ms ~= 40-100
total_ms ~= 21600
```

Ejemplos reportados:

```text
cfdi_nav:new
cfdi_nav:admin
cfdi:<token>
```

Interpretacion inicial:

```text
ACK temprano parece rapido, pero el workflow total queda lento despues del ACK.
```

Esto apunta a una etapa posterior: persistencia, carga de contexto, Code Node de
router/scoring, Action Layer, `sendMessage` o cierre del webhook. El analyzer
marca este patron como `ACK fast but total slow`.

## Seguridad del export

El JSONL exportado se normaliza por allowlist. No exporta:

- token Telegram;
- chat_id completo;
- user_id completo;
- RFC;
- UUID;
- UID;
- XML/PDF/ZIP/Excel;
- rutas absolutas;
- rutas runtime detalladas;
- CSD;
- `.env`;
- credenciales PAC;
- datos reales de cliente.

Callbacks `cfdi:<token>` se guardan solo como:

```text
cfdi:<token>
```

## Criterio de decision

Si el analyzer confirma `total_ms > 5000` con ACK bajo:

```text
7.10E Telegram Callback Latency Optimization
```

Si los eventos reales quedan dentro de umbral:

```text
7.11 Payment Status Command Adapter
```

## Tests

Prueba nueva:

```text
scripts/test-telegram-latency-db-export.js
```

Bateria minima:

```text
node scripts/test-telegram-latency-db-export.js
node scripts/test-telegram-bot-latency-observability.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
```
