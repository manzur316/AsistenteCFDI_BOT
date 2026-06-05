# CFDI Sandbox Telegram Buttons

Workflow:

```text
workflow/cfdi_sandbox_action_router.n8n.json
```

La fase 6A.11 agrega botones inline para operar acciones sandbox desde Telegram
sin permitir acciones libres. N8n sigue siendo solo orquestador: recibe texto o
`callback_query.data`, valida chat autorizado y llama al Action Layer local.

## Menu Principal

Abre el menu con:

```text
/sandbox_menu
```

Botones:

| Boton | callback_data | Accion |
| --- | --- | --- |
| Resumen mensual sandbox | `cfdi_sbx:report` | `sandbox.report.generate` |
| Generar paquete contador | `cfdi_sbx:package` | `sandbox.package.generate` |
| Generar Excel | `cfdi_sbx:excel` | `sandbox.excel.generate` |
| Generar checklist | `cfdi_sbx:checklist` | `sandbox.checklist.generate` |
| Paquete completo | `cfdi_sbx:full` | `sandbox.full.monthly.package` |
| Smoke sandbox | `cfdi_sbx:smoke_menu` | Muestra submenu |
| Estado / preflight | `cfdi_sbx:preflight` | `sandbox.preflight` |
| Cancelar | `cfdi_sbx:cancel` | No ejecuta accion |

## Submenu Smoke Sandbox

El boton `Smoke sandbox` abre:

| Boton | callback_data | Accion |
| --- | --- | --- |
| Crear CFDI sandbox | `cfdi_sbx:smoke_create` | `sandbox.smoke.create` |
| Crear + XML/PDF | `cfdi_sbx:smoke_download` | `sandbox.smoke.download` |
| Crear + cancelar | `cfdi_sbx:smoke_cancel` | `sandbox.smoke.cancel` |
| Volver | `cfdi_sbx:menu` | Muestra menu principal |

Las acciones smoke siguen apagadas si no existe opt-in local
`FACTURACOM_SANDBOX_LIVE=1`. Produccion sigue bloqueada por el Action Layer.

## Seguridad De callback_data

`callback_data` contiene solo tokens cortos de allowlist:

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

No contiene RFC, UUID, UID, montos, rutas, XML, PDF, ZIP, Excel, credenciales,
headers, secretos ni datos fiscales.

## Lo Que No Hace Esta Fase

- No envia XML/PDF/ZIP/Excel por Telegram.
- No usa `sendDocument`.
- No llama PAC productivo.
- No timbra CFDI.
- No expone Factura.com a n8n.
- No permite shell libre desde texto o callback.
- No versiona `runtime/`, credenciales, `.env`, CSD ni datos reales.

## Prueba Local Sin Telegram Real

Puedes simular el menu con un POST local al webhook:

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

Puedes simular un boton:

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

## Plan Manual E2E

La fase 6A.12 deja el checklist completo para validar Telegram + n8n + Action
Layer sandbox:

```text
workflow/CFDI_SANDBOX_E2E_TEST_PLAN.md
```

Orden sugerido:

1. Probar `/sandbox_menu`.
2. Probar `Paquete completo` (`cfdi_sbx:full`).
3. Probar `Resumen mensual sandbox` (`cfdi_sbx:report`).
4. Probar `Smoke sandbox` (`cfdi_sbx:smoke_menu`).
5. Probar callback desconocido.
6. Probar chat no autorizado.
7. Revisar `runtime/action-results-sandbox/latest.json`.
8. Confirmar que no se enviaron XML/PDF/ZIP/Excel por Telegram.
9. Confirmar `sensitive_findings=none` o alerta resumida sin datos sensibles.
