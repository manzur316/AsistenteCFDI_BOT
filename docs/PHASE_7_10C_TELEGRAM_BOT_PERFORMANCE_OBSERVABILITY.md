# Phase 7.10C - Telegram Bot Performance, Callback Latency and Flow Observability

Fecha: 2026-06-05

## Objetivo

Agregar observabilidad local de latencia al flujo principal de Telegram para
diagnosticar por que algunos botones pueden quedar "pensando", acumular
callbacks o responder tarde en pruebas reales.

Esta fase no agrega funciones de negocio, no implementa 7.11, no cambia reglas
fiscales y no habilita PAC productivo ni timbrado real.

## Donde se instrumenta

Workflow soportado:

```text
workflow/cfdi_telegram_local_ingest.n8n.json
```

La instrumentacion viaja como `latency_trace` entre nodos y se registra como
evento seguro:

```text
bot_events.event_type = TELEGRAM_LATENCY_EVENT
```

No se crea una tabla nueva para evitar migraciones obligatorias en esta pausa.
El payload del evento usa identificadores redacted y no guarda textos completos
del mensaje.

## Etapas medidas

Campos principales del evento:

- `update_id`
- `callback_query_id_redacted`
- `chat_id_redacted`
- `telegram_user_id_redacted`
- `source_kind`
- `callback_data`
- `command_token`
- `action`
- `route`
- `status`
- `duplicate_blocked`
- `lock_blocked`
- `answer_callback_query_executed`
- `ack_ms`
- `db_insert_ms`
- `load_context_ms`
- `scoring_ms`
- `routing_ms`
- `action_ms`
- `send_message_ms`
- `total_ms`
- `error_node`
- `workflow_version`

Notas:

- `ack_ms` es una medicion estimada hasta que el workflow programa
  `answerCallbackQuery`. En n8n no se registra todavia el tiempo exacto de
  ida/vuelta de ese HTTP node sin agregar una rama de logging adicional.
- `scoring_ms` actualmente representa el tiempo combinado del Code Node de
  routing/scoring para mensajes normales. Si se necesita precision mas fina,
  una fase futura debe separar subetapas internas del motor.
- `action_ms` usa `duration_ms` del Action Layer cuando aplica.

## Umbrales

- ACK callback ideal: `<= 1000 ms`.
- Respuesta interactiva normal: `<= 3000 ms`.
- Warning total: `total_ms > 5000`.
- Blocker de ACK: `ack_ms > 5000`.
- Acciones largas deben responder rapido y completar despues.

## Analyzer local

Script:

```text
scripts/analyze-telegram-bot-latency.js
```

Uso sin argumentos:

```bash
node scripts/analyze-telegram-bot-latency.js
```

Esto genera resumen vacio/seguro si aun no existe export local de eventos:

```text
runtime/telegram-latency/telegram-latency-summary.json
runtime/telegram-latency/telegram-latency-summary.md
```

Uso con JSONL exportado:

```bash
node scripts/analyze-telegram-bot-latency.js runtime/telegram-latency/telegram-latency-events.jsonl
```

El JSONL puede contener el payload directo o filas exportadas de `bot_events`
con `event_type = TELEGRAM_LATENCY_EVENT` y `payload`.

Ejemplo de export local desde PostgreSQL:

```sql
COPY (
  SELECT jsonb_build_object(
    'event_type', event_type,
    'payload', payload
  )
  FROM bot_events
  WHERE event_type = 'TELEGRAM_LATENCY_EVENT'
  ORDER BY created_at DESC
  LIMIT 500
) TO STDOUT;
```

Guarda el resultado bajo `runtime/telegram-latency/` para que no se versione.

## Reporte

El analyzer produce:

- total de eventos;
- promedio `total_ms`;
- p50/p95/p99 `total_ms`;
- promedio y percentiles `ack_ms`;
- callbacks lentos;
- etapas lentas;
- top `callback_data` por latencia;
- duplicados bloqueados;
- locks bloqueados;
- errores por nodo;
- recomendaciones.

## Seguridad

La telemetria no debe guardar:

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
- headers sensibles.

Los callbacks `cfdi:<token>` se registran como:

```text
cfdi:<token>
```

## Limitacion del workflow actual

El workflow principal sigue siendo lineal. Aunque `answerCallbackQuery` sale en
una rama temprana desde `Handle Commands And Scoring`, n8n todavia ejecuta el
flujo completo y algunas ramas largas pueden mantener la ejecucion abierta.

Si la telemetria muestra ACK o `total_ms` altos, la siguiente optimizacion debe
evaluar:

- responder ACK y webhook lo antes posible;
- mover acciones pesadas a job queue local;
- ejecutar Action Layer async;
- separar acciones largas del flujo interactivo;
- registrar finalizacion en Postgres y notificar despues.

## Tests

Prueba nueva:

```text
scripts/test-telegram-bot-latency-observability.js
```

Tambien se deben mantener verdes:

```text
scripts/test-telegram-callback-reliability-idempotency.js
scripts/test-telegram-pac-sandbox-console.js
scripts/test-client-invoice-ledger-view.js
scripts/test-local-ingest-workflow-contract.js
scripts/test-local-ingest-response-contract.js
scripts/test-local-ingest-security-enforcement.js
scripts/test-repo-safety.js
scripts/test-n8n-workflow-guardrails.js
```

## Siguiente fase recomendada

Si la telemetria real queda dentro de umbrales:

```text
7.11 Payment Status Command Adapter
```

Si aparece latencia alta:

```text
7.10D Telegram Callback Latency Optimization
```
