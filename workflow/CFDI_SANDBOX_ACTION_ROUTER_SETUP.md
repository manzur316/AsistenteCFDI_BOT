# CFDI Sandbox Action Router Setup

Workflow:

```text
workflow/cfdi_sandbox_action_router.n8n.json
```

Este workflow es un router local para ejecutar acciones sandbox desde n8n sin
meter logica fiscal, PAC, Factura.com, XML/PDF, headers ni contratos internos en
n8n. N8n solo orquesta y llama:

```powershell
node scripts/run-sandbox-action.js <action>
```

Reglas obligatorias de workflow n8n:

```text
docs/N8N_WORKFLOW_GUARDRAILS.md
```

Antes de importar o reimportar, corre:

```powershell
node scripts/test-n8n-workflow-guardrails.js
```

## Arranque Local

Desde la carpeta del proyecto:

```powershell
cd "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI"
$env:N8N_PORT="5678"
$env:CFDI_ALLOWED_TELEGRAM_CHAT_ID="REEMPLAZAR_CHAT_ID_AUTORIZADO"
n8n start
```

Este workflow no requiere `NODE_FUNCTION_ALLOW_BUILTIN`. Los Code Nodes no usan
`fs`, `path`, `readFileSync` ni lectura de filesystem; consumen el JSON estable
que `Execute Command` recibe por `stdout` desde el Action Layer. No habilites
`fs/path` para este flujo.

Si no configuras la variable local `TELEGRAM_BOT_TOKEN`, el workflow responde
por webhook local y no intenta enviar Telegram. Si defines esa variable solo en
tu terminal local antes de iniciar n8n, el nodo `Telegram sendMessage` queda
habilitado por el mismo payload seguro.

No guardes tokens reales en este archivo, en el workflow ni en Git.

## Importar En n8n

1. Abre `http://localhost:5678`.
2. Importa `workflow/cfdi_sandbox_action_router.n8n.json`.
3. Verifica el nodo `Set Config`:
   - `projectRoot`: `C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI`
   - `allowedChatId`: `={{$env.CFDI_ALLOWED_TELEGRAM_CHAT_ID || ''}}`
   - `telegramBotToken`: `={{$env.TELEGRAM_BOT_TOKEN || ''}}`
4. Activa el workflow solo cuando quieras probar el webhook local.

Importante: n8n no actualiza workflows importados automaticamente despues de
`git pull`. Si este archivo cambia, reimporta el JSON o reemplaza el workflow
en n8n antes de repetir el E2E.

Webhook local:

```text
http://localhost:5678/webhook/cfdi-sandbox-action-router
```

## Comandos Soportados

El router usa allowlist. No ejecuta comandos libres.

```text
/sandbox_menu           -> muestra menu de botones
/sandbox_preflight       -> sandbox.preflight
/sandbox_report          -> sandbox.report.generate
/sandbox_package         -> sandbox.package.generate
/sandbox_excel           -> sandbox.excel.generate
/sandbox_checklist       -> sandbox.checklist.generate
/sandbox_full_package    -> sandbox.full.monthly.package
/sandbox_smoke_create    -> sandbox.smoke.create
/sandbox_smoke_download  -> sandbox.smoke.download
/sandbox_smoke_cancel    -> sandbox.smoke.cancel
```

## Botones Telegram Sandbox

La fase 6A.11 agrega `inline_keyboard` con callback_data de allowlist. Ver:

```text
workflow/CFDI_SANDBOX_TELEGRAM_BUTTONS.md
```

Menu principal:

- Resumen mensual sandbox -> `cfdi_sbx:report`
- Generar paquete contador -> `cfdi_sbx:package`
- Generar Excel -> `cfdi_sbx:excel`
- Generar checklist -> `cfdi_sbx:checklist`
- Paquete completo -> `cfdi_sbx:full`
- Smoke sandbox -> `cfdi_sbx:smoke_menu`
- Estado / preflight -> `cfdi_sbx:preflight`
- Cancelar -> `cfdi_sbx:cancel`

Submenu smoke:

- Crear CFDI sandbox -> `cfdi_sbx:smoke_create`
- Crear + XML/PDF -> `cfdi_sbx:smoke_download`
- Crear + cancelar -> `cfdi_sbx:smoke_cancel`
- Volver -> `cfdi_sbx:menu`

Los callbacks nunca contienen RFC, UUID, UID, montos, rutas, XML/PDF, ZIP,
Excel, credenciales ni secretos.

## Payload De Prueba Local

Puedes probar con un HTTP POST local desde PowerShell:

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

Respuesta segura esperada:

```json
{
  "ok": true,
  "status": "menu",
  "action": null,
  "source_kind": "MESSAGE",
  "callback_data": null,
  "message": "Menu sandbox CFDI",
  "warnings": [],
  "errors": []
}
```

Para simular un boton sin Telegram real:

```powershell
$body = @{
  callback_query = @{
    id = "LOCAL_CALLBACK"
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

Para confirmar que el webhook no regreso body vacio:

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

El criterio es `StatusCode=200`, `RawContentLength > 0` y JSON parseable. Si
`runtime/action-results-sandbox/latest.json` queda en `OK` pero
`RawContentLength=0`, la accion si corrio, pero el workflow importado en n8n no
esta devolviendo el item preparado por `Prepare Webhook JSON Body`.
`latest.json` queda solo como diagnostico externo; n8n no lo lee desde Code
Nodes.

## Plan Manual E2E 6A.12

Para cerrar la prueba manual completa de Telegram + n8n + Action Layer sandbox,
usa:

```text
workflow/CFDI_SANDBOX_E2E_TEST_PLAN.md
```

Orden recomendado:

1. Ejecutar `node scripts/test-sandbox-e2e-readiness.js`.
2. Importar y activar el workflow.
3. Probar `/sandbox_menu` por webhook local.
4. Probar `cfdi_sbx:full` y revisar `runtime/action-results-sandbox/latest.json`.
5. Probar `cfdi_sbx:report`, `cfdi_sbx:smoke_menu`, callback desconocido y
   chat no autorizado.
6. Probar Telegram real solo si `TELEGRAM_BOT_TOKEN` existe localmente.
7. Confirmar que no se envia XML/PDF, ZIP ni Excel por Telegram.
8. Confirmar que no hay `sensitive_findings`, o que solo se muestra alerta
   resumida sin detalles sensibles.

## Seguridad

- `CFDI_ALLOWED_TELEGRAM_CHAT_ID` es obligatorio.
- Si `chat_id` no coincide, responde `No autorizado`.
- El action sale de allowlist, no de texto libre.
- `callback_data` sale de allowlist y mide menos de 32 caracteres.
- `Execute Command` solo ejecuta `node scripts/run-sandbox-action.js <action>`.
- No hay HTTP Request a Factura.com.
- No contiene `F-Api-Key`, `F-Secret-Key` ni `F-PLUGIN`.
- No imprime credenciales, `.env`, CSD, XML/PDF completos ni datos reales.
- No envia XML/PDF, ZIP ni Excel por Telegram en esta fase.
- Si `sensitive_findings` no esta vacio, solo muestra conteo y alerta corta.
- Produccion sigue bloqueada por el Action Layer.

## Alcance

Esto no timbra CFDI, no llama PAC productivo, no descarga archivos nuevos, no
manda documentos por Telegram y no sustituye revision humana. El resultado es
observabilidad sandbox local para preparar la siguiente fase.

Siguiente fase recomendada:

```text
6A.13 Sandbox action audit history
```
