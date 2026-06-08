# Provider Client Link Architecture

## Regla central

El cliente local manda para la experiencia del bot. El proveedor PAC solo guarda
una identidad externa enlazada de forma explicita.

Para Factura.com Sandbox, `provider_client_links.provider_client_uid` es la ruta
normal para timbrado sandbox live. `FACTURACOM_SANDBOX_RECEIVER_UID` queda como
fallback legacy/test y requiere bandera explicita.

## Flujo canonico

```text
cfdi_clients
  -> provider_client_links
  -> sandbox.provider.client.readiness
  -> sandbox.draft.stamp
  -> Factura.com Sandbox receptor_uid
```

Desde 7.18A, `sandbox.provider.client.readiness` es el gate read-only que
confirma si el cliente puede timbrarse o si requiere sincronizacion/revision
antes de `sandbox.draft.stamp`.

## Tabla local

`provider_client_links` conserva:

- `tenant_id`
- `client_id`
- `provider`
- `environment`
- `provider_client_uid`
- `provider_rfc`
- `provider_legal_name`
- `sync_status`
- `provider_response_sanitized`

La migracion `sql/012_provider_client_sync_foundation.sql` agrega indice unico
por `tenant_id`, `client_id`, `provider`, `environment` para evitar duplicar el
vinculo activo de un cliente local.

## Estados de sincronizacion

- `NEEDS_SYNC`: falta resolver el cliente proveedor.
- `LINKED`: el proveedor ya tenia un cliente unico compatible.
- `CREATED`: se creo cliente en Factura.com Sandbox tras revision humana.
- `MANUAL_LINKED`: el UID proveedor fue vinculado manualmente.
- `AMBIGUOUS`: el proveedor devolvio multiples candidatos.
- `NOT_FOUND`: no se encontro cliente proveedor y no se pidio crearlo.
- `NEEDS_CLIENT_DATA`: faltan datos fiscales locales validados.

## Seguridad

Los outputs de Action Layer no deben exponer RFC completo, UID completo,
credenciales, `.env`, CSD, rutas absolutas, XML, PDF, ZIP ni Excel.

El UID proveedor real solo debe viajar:

- en memoria hacia el adapter;
- en PostgreSQL local;
- nunca como texto completo en Telegram o JSON de auditoria.

## Modo DB local Docker

Para entornos locales donde PostgreSQL corre en el contenedor
`cfdi-postgres`, el Action Layer puede ejecutar `psql` dentro del contenedor:

```powershell
$env:CFDI_DB_EXEC_MODE="docker"
$env:CFDI_PG_DOCKER_CONTAINER="cfdi-postgres"
$env:CFDI_PGDATABASE="cfdi_bot"
$env:CFDI_PGUSER="cfdi_bot_user"
```

Esto evita depender de password TCP contra `127.0.0.1:5432`. El modo TCP
permanece disponible para otros entornos.

## No-go

- No produccion.
- No timbrado fiscal real.
- No Facturapi en esta fase.
- No cambios a `data/concepts.normalized.json`.
- No workflows nuevos.
- No documentos por Telegram.
