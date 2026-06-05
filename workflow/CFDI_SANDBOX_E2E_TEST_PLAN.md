# CFDI Sandbox Telegram/n8n E2E Test Plan

Fase 6A.12 valida manualmente Telegram + n8n + Action Layer sandbox. Esta
fase no agrega logica fiscal, no cambia decisiones, no envia archivos y no
llama PAC productivo.

## Objetivo

Confirmar que el workflow local:

- muestra `/sandbox_menu`;
- procesa botones inline allowlisted;
- ejecuta acciones sandbox por Action Layer;
- bloquea chats no autorizados;
- no envia XML/PDF/ZIP/Excel por Telegram;
- actualiza `runtime/action-results-sandbox/latest.json`;
- no expone secretos ni datos sensibles.
- no requiere `fs/path` en Code Nodes de n8n.

## Requisitos Previos

- n8n local corriendo en `http://localhost:5678`.
- Workflow importado:
  `workflow/cfdi_sandbox_action_router.n8n.json`.
- Guardrails n8n revisados:
  `docs/N8N_WORKFLOW_GUARDRAILS.md`.
- Proyecto abierto desde la raiz correcta:
  `C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI`.
- `CFDI_ALLOWED_TELEGRAM_CHAT_ID` configurado localmente.
- `TELEGRAM_BOT_TOKEN` configurado solo si se prueba Telegram real.
- Node disponible para n8n, porque el router ejecuta:
  `node scripts/run-sandbox-action.js <action>`.
- Runtime sandbox generado o listo para generarse con Action Layer.

## Variables Requeridas

PowerShell recomendado:

```powershell
cd "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI"
$env:N8N_PORT="5678"
$env:CFDI_ALLOWED_TELEGRAM_CHAT_ID="REEMPLAZAR_CHAT_ID_AUTORIZADO"
# Define TELEGRAM_BOT_TOKEN solo en tu terminal local si probaras Telegram real.
n8n start
```

No configures `NODE_FUNCTION_ALLOW_BUILTIN` para este router sandbox. Los Code
Nodes no usan `fs/path`; el workflow consume solo `stdout` del Action Layer.

Antes de importar el workflow, ejecuta:

```powershell
node scripts/test-n8n-workflow-guardrails.js
```

Si no defines `TELEGRAM_BOT_TOKEN`, el webhook local sigue funcionando y n8n no
intenta responder por Telegram.

Nunca guardar tokens reales en Git, `.env`, docs, workflow ni runtime.

## Importar Workflow

1. Abrir `http://localhost:5678`.
2. Importar `workflow/cfdi_sandbox_action_router.n8n.json`.
3. Revisar el nodo `Set Config`:
   - `projectRoot`: `C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI`
   - `allowedChatId`: `={{$env.CFDI_ALLOWED_TELEGRAM_CHAT_ID || ''}}`
   - `telegramBotToken`: `={{$env.TELEGRAM_BOT_TOKEN || ''}}`
4. Activar el workflow solo durante la prueba.

Webhook local:

```text
http://localhost:5678/webhook/cfdi-sandbox-action-router
```

## Activar Webhook

En n8n, activar el workflow. Para una prueba manual temporal, tambien puedes
usar el modo test del Webhook node, pero el runner manual E2E debe apuntar al
URL que n8n muestre como activo.

## Prueba Con Webhook Local Sin Telegram

### 1. Menu principal

```powershell
$body = @{
  message = @{
    chat = @{ id = $env:CFDI_ALLOWED_TELEGRAM_CHAT_ID }
    from = @{ id = "LOCAL_USER" }
    text = "/sandbox_menu"
  }
} | ConvertTo-Json -Depth 10

Invoke-WebRequest `
  -Uri "http://localhost:5678/webhook/cfdi-sandbox-action-router" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

Resultado esperado:

- HTTP 200.
- Respuesta con menu.
- `reply_markup.inline_keyboard` presente.
- No ejecuta Action Layer.

### 2. Boton Paquete completo

```powershell
$body = @{
  callback_query = @{
    id = "LOCAL_CALLBACK_FULL"
    from = @{ id = "LOCAL_USER" }
    data = "cfdi_sbx:full"
    message = @{
      message_id = 1
      chat = @{ id = $env:CFDI_ALLOWED_TELEGRAM_CHAT_ID }
    }
  }
} | ConvertTo-Json -Depth 10

Invoke-WebRequest `
  -Uri "http://localhost:5678/webhook/cfdi-sandbox-action-router" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

Resultado esperado:

- Ejecuta `sandbox.full.monthly.package`.
- Actualiza `runtime/action-results-sandbox/latest.json`.
- Mensaje resume status, warnings, errors y sensitive findings.
- No adjunta ZIP, Excel, XML ni PDF.

### 3. Boton Resumen mensual sandbox

Usar `data = "cfdi_sbx:report"`.

Resultado esperado:

- Ejecuta `sandbox.report.generate`.
- No llama PAC.
- No envia archivos.

### 4. Submenu Smoke sandbox

Usar `data = "cfdi_sbx:smoke_menu"`.

Resultado esperado:

- Muestra botones `cfdi_sbx:smoke_create`, `cfdi_sbx:smoke_download`,
  `cfdi_sbx:smoke_cancel` y `cfdi_sbx:menu`.
- No ejecuta Action Layer hasta elegir un boton smoke.

### 5. Callback desconocido

Usar `data = "cfdi_sbx:desconocido"`.

Resultado esperado:

- No ejecuta comandos.
- Responde ayuda/menu.
- No crea archivos fuera de runtime.

### 6. Chat no autorizado

Enviar cualquier comando o callback con otro `chat.id`.

Resultado esperado:

- Respuesta `No autorizado`.
- `should_execute=false`.
- No actualiza resultados sandbox.

## Prueba Con Telegram Real

1. Iniciar n8n con `TELEGRAM_BOT_TOKEN` y
   `CFDI_ALLOWED_TELEGRAM_CHAT_ID`.
2. Enviar `/sandbox_menu` al bot.
3. Probar estos botones en orden:
   - `Paquete completo`.
   - `Resumen mensual sandbox`.
   - `Smoke sandbox`.
   - `Volver`.
   - `Cancelar`.
4. Confirmar que cada respuesta es texto legible.
5. Confirmar que Telegram no recibe documentos, fotos, media groups, ZIP, Excel,
   XML ni PDF.

## Comandos Esperados

```text
/sandbox_menu
/sandbox_preflight
/sandbox_report
/sandbox_package
/sandbox_excel
/sandbox_checklist
/sandbox_full_package
/sandbox_smoke_create
/sandbox_smoke_download
/sandbox_smoke_cancel
```

## Botones Esperados

```text
cfdi_sbx:menu
cfdi_sbx:report
cfdi_sbx:package
cfdi_sbx:excel
cfdi_sbx:checklist
cfdi_sbx:full
cfdi_sbx:preflight
cfdi_sbx:smoke_menu
cfdi_sbx:smoke_create
cfdi_sbx:smoke_download
cfdi_sbx:smoke_cancel
cfdi_sbx:cancel
```

## Criterios De Aceptacion

- `/sandbox_menu` muestra menu con botones.
- `cfdi_sbx:full` ejecuta solo `sandbox.full.monthly.package`.
- `cfdi_sbx:report` ejecuta solo `sandbox.report.generate`.
- `cfdi_sbx:smoke_menu` muestra submenu y no ejecuta accion.
- Callback desconocido no ejecuta shell.
- Chat no autorizado no ejecuta shell.
- `latest.json` se actualiza tras acciones reales.
- `sensitive_findings` queda vacio o se muestra solo como alerta resumida.
- No se envia ningun archivo por Telegram.
- No aparece URL de produccion Factura.com.
- No aparece secreto, token, CSD, RFC real ni dato de cliente real.

## Logs Y Archivos A Revisar

- n8n execution log del workflow.
- `runtime/action-results-sandbox/latest.json`.
- `runtime/action-results-sandbox/*.json`.
- `runtime/reports-sandbox/` si se ejecuto reporte.
- `runtime/accountant-packages-sandbox/` si se ejecuto paquete.
- `runtime/storage-sandbox/` si se refresco storage.

Estos archivos son locales y no deben versionarse.

## Lo Que NO Debe Pasar

- No enviar XML/PDF por Telegram.
- No enviar ZIP/Excel por Telegram.
- No llamar produccion.
- No imprimir credenciales.
- No aceptar shell injection desde texto o callback.
- No usar callback_data con RFC, UUID, UID, monto, ruta o secreto.
- No subir runtime, `.env`, CSD, XML/PDF, ZIP/Excel ni datos reales.

## Troubleshooting

### Chat no autorizado

Verifica `CFDI_ALLOWED_TELEGRAM_CHAT_ID`. Debe coincidir exactamente con el
`chat.id` de Telegram o del payload local.

### TELEGRAM_BOT_TOKEN ausente

El webhook local funciona, pero no se enviara respuesta por Telegram. Configura
el token solo en la terminal local antes de iniciar n8n.

### n8n no encuentra Node

Asegura que `node` este en el `PATH` de la misma terminal que inicio n8n.
Prueba:

```powershell
node --version
```

### Ruta incorrecta

Verifica `projectRoot` en `Set Config`:

```text
C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI
```

### Missing runtime

Ejecuta:

```powershell
node scripts/run-sandbox-action.js sandbox.full.monthly.package
node scripts/analyze-sandbox-action-result.js
```

### Action returns NEEDS_RUNTIME

No hay storage/reportes suficientes para esa accion. Genera runtime sandbox o
corre el paquete completo local.

### Action returns PACKAGE_SAFETY_ERROR

El runtime existe, pero el paquete o Excel sandbox fue bloqueado por seguridad.
Revisa `runtime/action-results-sandbox/latest.json`, corre:

```powershell
node scripts/analyze-sandbox-accountant-excel.js
node scripts/analyze-sandbox-action-result.js
```

La salida debe listar `absolute_path_findings`, `formula_injection_findings` o
`sensitive_findings` sin exponer secretos. No subas el Excel, ZIP, XML/PDF ni
runtime.

### Action returns NEEDS_CONFIG

La accion requiere configuracion local, por ejemplo smoke live sandbox. Revisa
variables de entorno locales. No las pegues en issues, docs ni logs.

### Webhook responde body vacio

`latest.json` en `OK` valida que el Action Layer ejecuto. No valida por si solo
que el webhook respondio bien. El path de accion debe terminar en
`Prepare Webhook JSON Body` y luego `Respond to Webhook`, con body JSON visible.
N8n no lee `latest.json` desde Code Nodes; ese archivo queda para diagnostico
externo.
Para `cfdi_sbx:full`, la respuesta esperada incluye:

```json
{
  "ok": true,
  "status": "OK",
  "action": "sandbox.full.monthly.package",
  "source_kind": "CALLBACK_QUERY",
  "callback_data": "cfdi_sbx:full",
  "message": "...",
  "warnings": [],
  "errors": []
}
```

Si hay error controlado, `ok` puede ser `false`, pero el body no debe estar
vacio.

Despues de `git pull`, n8n no actualiza workflows importados automaticamente.
Reimporta `workflow/cfdi_sandbox_action_router.n8n.json` antes de repetir este
caso.

Prueba PowerShell minima:

```powershell
$response = Invoke-WebRequest `
  -Uri "http://localhost:5678/webhook/cfdi-sandbox-action-router" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

$response.StatusCode
$response.RawContentLength
$response.Content | ConvertFrom-Json
```

Criterio: `StatusCode=200`, `RawContentLength > 0`, JSON parseable y
`latest.json` con `action=sandbox.full.monthly.package`, `status=OK` cuando el
chat esta autorizado.

## Orden Recomendado Para Cerrar 6A

1. `node scripts/test-sandbox-e2e-readiness.js`.
2. Importar workflow y activar webhook.
3. Probar `/sandbox_menu` por webhook local.
4. Probar `cfdi_sbx:full` por webhook local.
5. Revisar `latest.json`.
6. Probar Telegram real con chat autorizado.
7. Confirmar que no se envio ningun archivo.
8. Desactivar workflow si ya termino la prueba.
