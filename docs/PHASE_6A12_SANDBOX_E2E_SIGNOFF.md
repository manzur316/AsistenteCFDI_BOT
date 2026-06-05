# Phase 6A.12 Sandbox Telegram/n8n E2E Signoff

Fecha de cierre: 2026-06-05

Estado: PASS

## Alcance

Esta fase cierra la validacion manual E2E de Telegram/n8n sandbox con Action
Layer local. No implementa nuevas features, no cambia logica fiscal, no toca
workflows legacy y no habilita PAC productivo.

## Comandos Ejecutados

```powershell
git pull origin main
node scripts/test-n8n-workflow-guardrails.js
node scripts/test-sandbox-action-router-workflow-contract.js
node scripts/test-n8n-webhook-response-contract.js
node scripts/test-sandbox-e2e-readiness.js
```

Resultados:

- `git pull origin main`: Already up to date.
- `test-n8n-workflow-guardrails.js`: PASS total `1/1`.
- `test-sandbox-action-router-workflow-contract.js`: PASS total `43/43`.
- `test-n8n-webhook-response-contract.js`: PASS total `12/12`.
- `test-sandbox-e2e-readiness.js`: PASS total `14/14`.

## Evidencia Del Webhook Local

Prueba `/sandbox_menu`:

- HTTP `StatusCode=200`.
- `RawContentLength=142`.
- Body JSON seguro:
  - `ok=true`
  - `status=menu`
  - `message=Menu sandbox CFDI`
  - `warnings=[]`
  - `errors=[]`

Prueba callback `cfdi_sbx:full`:

- HTTP `StatusCode=200`.
- `RawContentLength=418`.
- Body JSON seguro:
  - `ok=true`
  - `status=OK`
  - `action=sandbox.full.monthly.package`
  - `source_kind=CALLBACK_QUERY`
  - `callback_data=cfdi_sbx:full`
  - `artifacts=21`
  - `warnings=none`
  - `errors=none`
  - `sensitive_findings=none`

El mensaje confirma que no se envian archivos por Telegram en esta fase.

## Confirmaciones De Seguridad

- No se enviaron XML/PDF/ZIP/Excel por Telegram.
- `sensitive_findings=none`.
- El workflow soportado `workflow/cfdi_sandbox_action_router.n8n.json` esta
  limpio de `fs/path/readFileSync` en Code Nodes.
- n8n consume `stdout` JSON del Action Layer.
- No hay HTTP Request directo a Factura.com/PAC desde n8n.
- No hay credenciales PAC, CSD, `.env`, XML/PDF/ZIP/Excel ni datos reales en el
  workflow soportado.
- Produccion y PAC real siguen bloqueados.
- Todo resultado fiscal sigue siendo sandbox y sujeto a revision humana.

## Legacy Warnings

`scripts/test-n8n-workflow-guardrails.js` reporto 24 hallazgos como
`LEGACY-WARN` en workflows historicos. Esos hallazgos quedan como deuda
historica documentada y no bloquean el cierre de 6A.12 porque el workflow
soportado para el E2E sandbox esta limpio y pasa reglas estrictas.

## Decision

6A.12 queda cerrado como PASS.

Siguiente fase recomendada:

```text
6A.13 Sandbox action audit history
```
