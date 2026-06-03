# Telegram Polling Design

Diseno de la siguiente fase. Este archivo no crea el workflow final todavia.

## Objetivo

Recibir mensajes de Telegram por polling local y responder con el mismo contrato `buildN8nResponse` usado por el workflow manual.

## Alcance

- MVP personal Emberhub.
- Polling local con Schedule Trigger.
- Sin webhook.
- Sin dominio publico.
- Sin SSL.
- Sin PAC.
- Sin timbrado CFDI.
- Sin WhatsApp.

## Flujo propuesto

1. `Schedule Trigger`
   - Ejecutar cada 30 segundos.
   - Intervalo configurable con `TELEGRAM_POLLING_INTERVAL_SECONDS=30`.

2. `Read Offset`
   - Leer el ultimo `update_id` procesado.
   - Para MVP local puede guardarse en static data del workflow.
   - El siguiente request debe usar `offset = last_update_id + 1`.

3. `HTTP Request - getUpdates`
   - Metodo: `GET`.
   - URL:
     `https://api.telegram.org/bot{{TELEGRAM_BOT_TOKEN}}/getUpdates`
   - Query params:
     - `offset`
     - `timeout`: `0` o bajo, porque el Schedule Trigger ya controla el intervalo.
     - `allowed_updates`: `["message"]`

4. `Extract Telegram Message`
   - Por cada update valido extraer:
     - `chat_id`: `update.message.chat.id`
     - `update_id`: `update.update_id`
     - `message_id`: `update.message.message_id`
     - `text`: `update.message.text`
   - Ignorar updates sin `message.text`.
   - Si hay multiples updates, procesarlos en orden ascendente por `update_id`.

5. `Set Catalog Path`
   - Usar ruta absoluta:
     `C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json`
   - No usar `process.env` dentro del Code Node.

6. `Run Scoring`
   - Reusar el mismo contrato logico:
     - `classifyMessage`
     - `buildN8nResponse`
     - `formatTelegramMessage`
   - El Code Node debe ser autocontenido o copiar el mismo bloque del workflow manual.
   - Solo permitir `require('fs')` y `require('path')`.
   - No usar require de archivos locales como `scripts/scoring.js`.

7. `HTTP Request - sendMessage`
   - Metodo: `POST`.
   - URL:
     `https://api.telegram.org/bot{{TELEGRAM_BOT_TOKEN}}/sendMessage`
   - Body JSON:
     - `chat_id`
     - `text`: `telegram_message`
     - `reply_to_message_id`: `message_id` opcional

8. `Save Offset`
   - Al terminar cada update correctamente, guardar `last_update_id`.
   - Si falla un update, no avanzar el offset de ese update para poder reintentar.

## Manejo de errores

- Si Telegram no responde, mantener el offset anterior.
- Si el token falta, detener con error claro: `TELEGRAM_BOT_TOKEN pendiente`.
- Si `catalogPath` no existe, responder internamente con error de configuracion y no inventar conceptos.
- Si el mensaje esta vacio o no es texto, ignorarlo o responder con aclaracion simple.
- Si el scoring devuelve `PEDIR_ACLARACION`, enviar el texto de aclaracion y marcar candidatos solo como no confirmados.
- Si el scoring devuelve `BLOQUEAR` o `AGREGAR_ACTIVIDAD`, no enviar conceptos listos para facturar.

## Contrato de salida esperado

El nodo de scoring debe producir:

```json
{
  "action": "SUGERIR | PEDIR_ACLARACION | BLOQUEAR | AGREGAR_ACTIVIDAD",
  "ready_to_copy": false,
  "requires_human_review": true,
  "message_original": "",
  "decision_confidence": 0,
  "candidate_confidence": 0,
  "safety_level": "OK | NEEDS_CLARIFICATION | BLOCKED",
  "concept": {
    "id": null,
    "concepto_factura": null,
    "clave_prod_serv": null,
    "clave_unidad": null,
    "unidad": null,
    "familia": null,
    "tipo": null,
    "operacion": null
  },
  "top_3": [],
  "telegram_message": "",
  "json_debug": {}
}
```

## Criterios para crear el workflow real

- El workflow manual debe seguir pasando pruebas.
- `test-project-readiness.js` debe pasar.
- El Code Node de Telegram no debe usar modulos locales.
- El flujo debe seguir sin webhook, dominio, SSL, PAC o timbrado.
