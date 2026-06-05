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

## Arranque Local

Desde la carpeta del proyecto:

```powershell
cd "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI"
$env:N8N_PORT="5678"
$env:NODE_FUNCTION_ALLOW_BUILTIN="fs,path"
$env:CFDI_ALLOWED_TELEGRAM_CHAT_ID="REEMPLAZAR_CHAT_ID_AUTORIZADO"
n8n start
```

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

Webhook local:

```text
http://localhost:5678/webhook/cfdi-sandbox-action-router
```

## Comandos Soportados

El router usa allowlist. No ejecuta comandos libres.

```text
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

## Payload De Prueba Local

Puedes probar con un HTTP POST local desde PowerShell:

```powershell
$body = @{
  message = @{
    chat = @{ id = $env:CFDI_ALLOWED_TELEGRAM_CHAT_ID }
    from = @{ id = "LOCAL_USER" }
    text = "/sandbox_full_package"
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
  "status": "OK",
  "action": "sandbox.full.monthly.package",
  "message": "Sandbox action: sandbox.full.monthly.package\n..."
}
```

## Seguridad

- `CFDI_ALLOWED_TELEGRAM_CHAT_ID` es obligatorio.
- Si `chat_id` no coincide, responde `No autorizado`.
- El action sale de allowlist, no de texto libre.
- `Execute Command` solo ejecuta `node scripts/run-sandbox-action.js <action>`.
- No hay HTTP Request a Factura.com.
- No contiene `F-Api-Key`, `F-Secret-Key` ni `F-PLUGIN`.
- No imprime credenciales, `.env`, CSD, XML/PDF completos ni datos reales.
- No envia XML/PDF por Telegram en esta fase.
- Si `sensitive_findings` no esta vacio, solo muestra conteo y alerta corta.
- Produccion sigue bloqueada por el Action Layer.

## Alcance

Esto no timbra CFDI, no llama PAC productivo, no descarga archivos nuevos, no
manda documentos por Telegram y no sustituye revision humana. El resultado es
observabilidad sandbox local para preparar la siguiente fase.

Siguiente fase recomendada:

```text
6A.11 Telegram UI buttons
```
