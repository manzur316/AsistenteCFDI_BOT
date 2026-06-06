# Phase 7.10E - Local Runtime Startup and Sandbox Stamp Diagnostics

Fecha: 2026-06-05

## Objetivo

Hacer reproducible el arranque local estable de n8n + Telegram + Factura.com
Sandbox y mejorar el diagnostico cuando `sandbox.draft.stamp` falla por
integracion del Action Layer, especialmente si `stdout` no contiene JSON valido.

Esta fase no agrega funciones de negocio, no implementa 7.11, no habilita PAC
productivo y no activa timbrado real.

## Arranque local recomendado

Plantilla segura:

```text
scripts/local/start-n8n-pac-sandbox.example.ps1
```

Uso:

```powershell
Copy-Item scripts/local/start-n8n-pac-sandbox.example.ps1 scripts/local/start-n8n-pac-sandbox.local.ps1
.\scripts\local\start-n8n-pac-sandbox.local.ps1
```

La copia `.local.ps1` queda ignorada por Git.

La plantilla:

- carga `.env.pac.sandbox.local` si existe;
- configura `NODE_OPTIONS=--dns-result-order=ipv4first`;
- configura `NODE_FUNCTION_ALLOW_BUILTIN=fs,path` para workflows legacy locales;
- configura `N8N_PORT=5678`;
- configura `N8N_RUNNERS_ENABLED=false`;
- verifica que `NODES_EXCLUDE` no bloquee `n8n-nodes-base.executeCommand`;
- ejecuta preflight local:

```text
node scripts/run-sandbox-action.js sandbox.preflight
```

El `NODE_OPTIONS=--dns-result-order=ipv4first` evita timeouts observados por
resolucion IPv6 hacia Telegram en pruebas locales.

## Runner local

Plantilla segura:

```text
scripts/local/start-runner.local.example.ps1
```

Uso:

```powershell
Copy-Item scripts/local/start-runner.local.example.ps1 scripts/local/start-runner.local.ps1
.\scripts\local\start-runner.local.ps1
```

No guardar tokens en la plantilla. Usar `.env.local` local ignorado por Git.

## Execute Command local

El workflow principal invoca el Action Layer por un nodo local Execute Command
con comando allowlisted:

```text
node scripts/run-sandbox-action.js <sandbox action>
```

Esto se permite solo en ambiente local controlado. Si se usa `NODES_EXCLUDE`,
no debe incluir:

```text
n8n-nodes-base.executeCommand
```

## Diagnostico de `sandbox.draft.stamp`

El CLI:

```text
scripts/run-sandbox-action.js
```

ahora captura salida accidental a stdout/stderr durante la ejecucion del Action
Layer y siempre imprime un unico JSON estable en stdout.

Cuando n8n recibe stdout no parseable, `Build PAC Sandbox Action Summary`
responde:

```text
El Action Layer no devolvio JSON valido. Revisa logs locales.
```

El diagnostico seguro incluye:

- accion ejecutada;
- `exit_code` si n8n lo expone;
- `stdout_present`;
- `stderr_present`;
- preview sanitizado de stdout/stderr;
- error de parseo.

No debe exponer secretos, rutas absolutas, XML/PDF, tokens ni credenciales.

## Help UX

`/help` y el boton Ayuda ahora listan comandos de usuario:

```text
/start
/help
/factura
/clientes
/cliente TEXTO
/nuevocliente
/validarcliente CLIENT_ID
/pendientes
/aprobadas
/detalle DRAFT_ID
/ver
/estado
/cancelar
```

Para `OWNER` se agrega seccion separada:

```text
/sandbox_menu
/debug
```

La ayuda mantiene:

```text
Borrador sujeto a revision humana. No sustituye contador.
```

## Seguridad

No se versiona:

- `.env.pac.sandbox.local`;
- `.env.local`;
- `scripts/local/*.local.ps1`;
- runtime;
- XML/PDF/ZIP/Excel;
- CSD;
- credenciales;
- datos reales.

No se envia XML/PDF/ZIP/Excel por Telegram en esta fase.

## Tests

Prueba nueva:

```text
scripts/test-local-startup-and-stamp-diagnostics.js
```

Bateria minima:

```text
node scripts/test-local-startup-and-stamp-diagnostics.js
node scripts/test-approved-draft-to-pac-sandbox.js
node scripts/test-telegram-bot-latency-observability.js
node scripts/test-telegram-callback-reliability-idempotency.js
node scripts/test-local-ingest-workflow-contract.js
node scripts/test-local-ingest-response-contract.js
node scripts/test-local-ingest-security-enforcement.js
node scripts/test-repo-safety.js
node scripts/test-n8n-workflow-guardrails.js
```

## Siguiente fase recomendada

```text
7.11 Payment Status Command Adapter
```
