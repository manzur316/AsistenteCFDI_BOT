# Provider Client Readiness Runbook

## Diagnosticar cliente

```powershell
node scripts/run-sandbox-action.js sandbox.provider.client.readiness --db-exec-mode docker --client-id CLI-REAL-BILBAO
```

Con el launcher local V3 SAFE:

```powershell
scripts\local\80_RUN_SANDBOX_ACTION_WITH_ENV_V3_SAFE.bat sandbox.provider.client.readiness --db-exec-mode docker --client-id CLI-REAL-BILBAO
```

## Estados comunes

### Listo para timbrar

```text
status=OK
ready_for_provider_stamp=true
recommended_action=STAMP_SANDBOX
```

### Falta link proveedor

```text
status=NEEDS_SOURCE
ready_for_provider_stamp=false
recommended_action=SYNC_PROVIDER_CLIENT
blockers=CLIENT_PROVIDER_LINK_MISSING
```

Siguiente paso humano:

```powershell
node scripts/run-sandbox-action.js sandbox.provider.client.sync --db-exec-mode docker --client-id CLI-...
```

o, si el UID ya fue verificado manualmente:

```powershell
node scripts/run-sandbox-action.js sandbox.provider.client.link --db-exec-mode docker --client-id CLI-... --provider-client-uid UID...
```

### Faltan datos fiscales

```text
recommended_action=COMPLETE_CLIENT_DATA
blockers=CLIENT_FISCAL_DATA_INCOMPLETE
```

Corregir cliente local con claves SAT, no descripciones humanas, y validar
humanamente antes de reintentar.

### Email pendiente

```text
ready_for_provider_stamp=true
ready_for_provider_email=false
recommended_action=UPDATE_PROVIDER_EMAIL
```

El timbrado sandbox puede seguir permitido si no hay blockers, pero Provider
Email debe esperar confirmacion/sync.

## Stamp live sandbox

```powershell
node scripts/run-sandbox-action.js sandbox.draft.stamp --db-exec-mode docker --draft-id DRAFT-... --require-live-sandbox
```

Si falta link, la accion bloquea antes de Factura.com:

```text
status=NEEDS_RUNTIME
error_class=PROVIDER_CLIENT_LINK_MISSING
recommended_action=SYNC_PROVIDER_CLIENT
```

## Fallback legacy

Solo para pruebas heredadas:

```powershell
node scripts/run-sandbox-action.js sandbox.draft.stamp --draft-id DRAFT-... --require-live-sandbox --allow-legacy-receiver-uid
```

No usar como flujo normal de clientes.

## Seguridad

El output esta sanitizado. No debe imprimir RFC completo, UID completo, email
completo, tokens, credenciales, XML/PDF/ZIP/Excel, CSD, `.env` ni rutas runtime
detalladas.
