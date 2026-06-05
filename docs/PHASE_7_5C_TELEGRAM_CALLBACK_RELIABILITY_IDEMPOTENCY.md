# Phase 7.5C - Telegram Callback Reliability And Idempotency

## Proposito

La fase 7.5C endurece los callbacks del workflow primario de Telegram antes de
avanzar a `7.6 Approved Draft to PAC Sandbox`.

Durante pruebas manuales se observo que algunos botones podian quedarse
visualmente esperando. Si el usuario presionaba varias veces, n8n podia recibir
varios `callback_query` en fila. Para acciones sensibles, eso podia terminar en
ejecuciones repetidas.

## Problema Observado

- Telegram mantiene el spinner del boton hasta recibir `answerCallbackQuery`.
- Algunas acciones sandbox tardan porque pasan por Action Layer, PAC Adapter Hub
  y scripts locales.
- Varios taps generan varios `callback_query` diferentes.
- El runner procesa updates en fila, pero cada callback debe ser seguro por si
  llega repetido.

## ACK Rapido

El workflow primario responde `answerCallbackQuery` desde la salida temprana de
`Handle Commands And Scoring`, antes de esperar persistencia o acciones largas.

Textos esperados:

- `Procesando accion...`
- `Accion recibida.`
- `Accion ya en proceso.`
- `Accion ya ejecutada.`

Esto libera visualmente el boton y reduce reintentos manuales.

## Deduplicacion

El workflow carga `recent_callback_events` desde `bot_events` para el chat
actual. Cada callback sensible genera una clave idempotente segura.

Fuentes usadas para dedupe:

- `callback_data + chat_id` para callbacks PAC sandbox.
- `action token` para botones tokenizados.
- `draft_id/action` cuando viene en el payload del token.
- ventana corta de eventos recientes.

Si el callback ya esta en proceso o ya fue procesado, el workflow responde:

```text
Accion ya en proceso. No se ejecuto duplicado.
```

o:

```text
Accion ya ejecutada. No se ejecuto duplicado.
```

## Acciones Sensibles Protegidas

- Confirmar borrador.
- Regresar aprobado a borrador.
- `cfdi_sbx:preflight`.
- `cfdi_sbx:smoke_create`.
- `cfdi_sbx:smoke_download`.
- `cfdi_sbx:smoke_cancel`.
- `cfdi_sbx:latest`.
- `cfdi_sbx:audit`.
- `cfdi_sbx:full`.
- Cualquier accion PAC sandbox futura debe conservar el mismo patron.

## PAC Sandbox

Antes de ejecutar `Execute PAC Sandbox Action`, el workflow inserta un evento:

```text
PAC_SANDBOX_ACTION_IN_PROGRESS
```

Ese evento contiene solo metadata segura:

- `idempotency_key`;
- `callback_data`;
- accion sandbox allowlisted;
- workflow version;
- ids redacted cuando aplica.

No contiene credenciales, RFC, UUID, UID, XML/PDF, ZIP, Excel, CSD, `.env` ni
rutas absolutas.

Cuando la accion termina, `Build PAC Sandbox Action Summary` registra el
resultado como `PAC_SANDBOX_ACTION_RESULT` con la misma clave idempotente.

## Logging Y Auditoria

Los duplicados bloqueados se registran en `bot_events` como:

```text
CALLBACK_DUPLICATE_BLOCKED
```

El evento mantiene conteo y diagnostico minimo para auditoria local, sin
payloads sensibles.

## Limites

- No implementa `7.6 Approved Draft to PAC Sandbox`.
- No llama PAC productivo.
- No habilita timbrado productivo fiscal real.
- No envia XML/PDF/ZIP/Excel por Telegram.
- No expone credenciales, `.env`, CSD, tokens ni rutas absolutas.
- No modifica `data/concepts.normalized.json`.
- No versiona `runtime/`.
- No cambia `cfdi_sandbox_action_router`.

## Criterios De Salida

- Todo callback recibe ACK rapido.
- Un callback PAC sandbox repetido no ejecuta dos veces.
- Un action token ya usado no reejecuta confirmar/restaurar.
- Usuario normal no puede ejecutar admin/sandbox.
- El workflow sigue usando Action Layer allowlisted.
- El workflow no contiene credenciales PAC ni envio de archivos por Telegram.

## Siguiente Fase Recomendada

`7.6 Approved Draft to PAC Sandbox`
