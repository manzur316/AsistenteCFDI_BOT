# Telegram Polling Local Runbook

Runbook para probar el MVP personal Emberhub con Telegram polling local en n8n.

## Alcance

- MVP personal.
- Sin contadores.
- Sin multi-tenant.
- Sin WhatsApp.
- Sin webhook.
- Sin dominio.
- Sin SSL.
- Sin PAC.
- Sin timbrado CFDI.
- Solo sugerencia de concepto para captura manual en SAT.

## Arrancar n8n local

Ejecutar en PowerShell:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
n8n start
```

Abrir:

```text
http://localhost:5678
```

## Workflow

Archivo importable:

```text
workflow/cfdi_telegram_polling_local.n8n.json
```

Nodos:

- `Schedule Trigger`: ejecuta polling cada 30 segundos.
- `Set Config`: configura token placeholder, catalogo y limite de polling.
- `Prepare Telegram Request`: valida token, lee offset persistente y prepara getUpdates.
- `Telegram getUpdates`: llama Telegram Bot API por HTTP.
- `Manage Telegram Updates`: extrae mensajes, evita duplicados y actualiza offset.
- `Run Scoring`: Code Node autocontenido con el motor CFDI.
- `Telegram sendMessage`: responde al mismo `chat_id`.

## Importar en n8n

1. Abrir `http://localhost:5678`.
2. Ir a `Import from file`.
3. Seleccionar `workflow/cfdi_telegram_polling_local.n8n.json`.
4. Abrir el nodo `Set Config`.
5. Reemplazar solo el valor de `telegramBotToken`.
6. Mantener `catalogPath`:

```text
C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json
```

7. Guardar el workflow.
8. Ejecutar una prueba manual o activar el workflow.

## Donde pegar el token real

Pegar el token real unicamente dentro de n8n:

```text
Set Config -> telegramBotToken
```

Valor placeholder que debe reemplazarse en n8n:

```text
REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N
```

No pegar el token real en:

- JSON del repositorio.
- README.
- Logs.
- Tests.
- `.env.example`.

## Como probar desde Telegram

Con el workflow activo, enviar al bot estos mensajes:

```text
revisé cámaras hikvision sin imagen
servicio técnico general
desarrollé una app móvil
venta de fuente de poder para cámara
```

Resultados esperados:

- `revisé cámaras hikvision sin imagen`: `SUGERIR`, `ready_to_copy=true`.
- `servicio técnico general`: `PEDIR_ACLARACION`, `ready_to_copy=false`.
- `desarrollé una app móvil`: `BLOQUEAR` o `AGREGAR_ACTIVIDAD`, `ready_to_copy=false`.
- `venta de fuente de poder para cámara`: `SUGERIR`, `concept.id=PROD-CCTV-007`.

## Offset

Estrategia elegida:

```text
workflow static data
```

El nodo `Prepare Telegram Request` lee:

```text
lastTelegramUpdateId
```

El nodo `Manage Telegram Updates` actualiza:

```text
lastTelegramUpdateId
lastTelegramNextOffset
lastTelegramOffsetUpdatedAt
```

Esto evita reprocesar mensajes si n8n se reinicia.

## Reiniciar offset si se atora

Opcion simple:

1. Desactivar el workflow.
2. Importar de nuevo `workflow/cfdi_telegram_polling_local.n8n.json` como workflow nuevo.
3. Pegar otra vez el token en `Set Config`.
4. Activar el nuevo workflow.

Opcion controlada dentro de n8n:

1. Desactivar el workflow.
2. Crear temporalmente un Code Node en el mismo workflow.
3. Ejecutar este codigo una vez:

```javascript
const data = $getWorkflowStaticData('global');
delete data.lastTelegramUpdateId;
delete data.lastTelegramNextOffset;
delete data.lastTelegramOffsetUpdatedAt;
return [{ json: { offset_reset: true } }];
```

4. Borrar el Code Node temporal.
5. Activar el workflow.

## Errores conocidos

### Module 'fs' is disallowed

Causa: n8n no fue iniciado permitiendo built-ins.

Solucion:

```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:N8N_PORT="5678"
n8n start
```

### process is not defined

Causa: el Code Node no expone `process`.

Solucion: no usar `process`, `process.cwd`, `process.env`, `__dirname` ni `__filename`. El workflow actual no los usa.

### Module 'C:\...\scripts\scoring.js' is disallowed

Causa: n8n no permite `require()` de archivos `.js` locales.

Solucion: usar el workflow actual. `Run Scoring` es autocontenido y solo usa `require('fs')` y `require('path')`.

### Token placeholder pendiente

Causa: `telegramBotToken` sigue en `REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N`.

Solucion: pegar el token real dentro del nodo `Set Config` en n8n. No pegarlo en archivos.

### No hay mensajes nuevos

No es error. `Manage Telegram Updates` devuelve cero items y el flujo termina sin responder.

## Validacion local

Ejecutar:

```powershell
node scripts/test-telegram-polling-contract.js
```

Tambien mantener pasando:

```powershell
node scripts/test-scoring.js
node scripts/test-n8n-contract.js
node scripts/test-n8n-workflow-contract.js
node scripts/test-project-readiness.js
```
