# Fase 7.16E - Factura.com Sandbox Provider Client Sync

## Objetivo

Sincronizar clientes locales con Factura.com Sandbox y guardar el vinculo en
`provider_client_links` antes de ejecutar `sandbox.draft.stamp` en modo live.

Esta fase no habilita produccion, no llama PAC productivo, no timbra CFDI real,
no modifica workflows n8n y no cambia el catalogo activo.

## Cambio de contrato

Antes, el flujo sandbox live podia depender de:

```text
FACTURACOM_SANDBOX_RECEIVER_UID
```

Desde 7.16E, la ruta normal es:

```text
provider_client_links.provider_client_uid
```

El UID global queda solo como fallback legacy/test y debe pedirse de forma
explicita con `--allow-legacy-receiver-uid`.

## Acciones nuevas

```text
sandbox.provider.client.lookup
sandbox.provider.client.sync
sandbox.provider.client.link
sandbox.provider.client.diagnose
```

### lookup

Busca cliente en Factura.com Sandbox por RFC, UID o vinculo local existente.
No crea ni modifica registros.

### sync

Valida datos fiscales locales, busca por RFC en Factura.com Sandbox y:

- si hay match unico: guarda `LINKED`;
- si no hay match y `--create-if-missing`: crea y guarda `CREATED`;
- si hay multiples matches: devuelve `AMBIGUOUS`;
- si faltan datos: devuelve `NEEDS_CLIENT_DATA`.

### link

Crea un vinculo manual `MANUAL_LINKED` con `client_id` y
`provider_client_uid`.

### diagnose

Indica si el cliente local ya tiene vinculo provider listo para
`sandbox.draft.stamp`.

## Endpoints soportados por adapter

El adapter Factura.com Sandbox queda preparado para:

```text
GET  /v1/clients
GET  /v1/clients?rfc=<RFC>
GET  /v1/clients?razon_social=<RAZON>
GET  /v1/clients/{RFC}
GET  /v1/clients/{UID}
GET  /v1/clients/rfc/{RFC}
POST /v1/clients/create
POST /v1/clients/{UID}/update
```

El host permitido sigue siendo:

```text
https://sandbox.factura.com/api
```

`https://api.factura.com` permanece bloqueado.

## Stamp sandbox live

`sandbox.draft.stamp --require-live-sandbox` ahora exige un
`provider_client_link` local. Si no existe:

```text
status=NEEDS_RUNTIME
error_class=PROVIDER_CLIENT_LINK_MISSING
```

Siguiente accion recomendada:

```text
node scripts/run-sandbox-action.js sandbox.provider.client.sync --client-id CLIENT-... --rfc RFC... --validated-by-human
```

o, si el UID ya fue verificado manualmente:

```text
node scripts/run-sandbox-action.js sandbox.provider.client.link --client-id CLIENT-... --provider-client-uid UID...
```

## Normalizacion SAT de cliente local

Hotfix 7.16E-LOCAL agrega un guard previo a provider sync y payload sandbox:
si `cfdi_clients.regimen_fiscal` o `uso_cfdi_default` contienen descripciones
humanas inequivocas, el Action Layer usa claves SAT para el payload.

Ejemplo:

```text
Personas Morales con Fines no Lucrativos -> 603
Gastos en general -> G03
```

Diagnostico solo lectura:

```powershell
node scripts/run-sandbox-action.js sandbox.client.fiscal-normalize.diagnose --db-exec-mode docker --client-id CLI-REAL-BILBAO
```

El diagnostico no muta la base y no expone RFC completo. Formatos incompletos
como `G1` siguen bloqueados. Detalle: `docs/SAT_FIELD_NORMALIZATION_GUARD.md`.

## Relacion con descargas XML/PDF sandbox

La fase 7.16I agrega validacion de contenido para XML/PDF descargados desde
Factura.com Sandbox. Esto no cambia el vinculo `provider_client_links`, pero
evita que respuestas placeholder del proveedor o de mocks se guarden como
artefactos finales.

Referencia:

```text
docs/SANDBOX_XML_PDF_CONTENT_VALIDATION.md
docs/TELEGRAM_DOCUMENT_DELIVERY_CHANNEL.md
```

El timbrado sandbox live sigue usando `provider_client_links.provider_client_uid`
y no se abre produccion fiscal real.

## Email principal del cliente

7.16J agrega la base local para un email principal unico:

```text
sql/015_client_primary_email_foundation.sql
```

Campos:

- `email`
- `email_confirmed`
- `provider_email_sync_status`
- `provider_email_sync_summary`

El mapper de cliente Factura.com envia `email` si existe. No se agregan
`email2`, `email3`, `billing_email` ni direcciones alternas. Provider Email
Delivery depende de este email principal y exige confirmacion humana o accion
explicita antes de envio real.

Referencias:

```text
docs/PROVIDER_EMAIL_DELIVERY_ARCHITECTURE.md
docs/DOCUMENT_DELIVERY_CANONICAL_CONTRACT.md
```

## PostgreSQL local con Docker

En entorno local Docker, las acciones del Action Layer que leen PostgreSQL
pueden usar `docker exec` en lugar de TCP/password:

```powershell
$env:CFDI_DB_EXEC_MODE="docker"
$env:CFDI_PG_DOCKER_CONTAINER="cfdi-postgres"
$env:CFDI_PGDATABASE="cfdi_bot"
$env:CFDI_PGUSER="cfdi_bot_user"
```

Tambien se puede pasar el modo por CLI:

```powershell
node scripts/run-sandbox-action.js sandbox.provider.client.link --db-exec-mode docker --client-id CLIENT-... --provider-client-uid UID...
```

En este modo no se usa `-h 127.0.0.1`, no se exige password TCP y el UID
proveedor sigue redaccionado en el output seguro.

## Seguridad

- No se imprimen RFC completos.
- No se imprimen UID completos.
- No se imprimen credenciales.
- No se guardan secrets en docs/tests.
- No se versiona runtime.
- No se envia XML/PDF/ZIP/Excel por Telegram.
- No se imprime email completo en logs publicos; se usa redaccion.

## Criterio de salida

- Mapper Factura.com cliente PASS.
- Adapter sandbox cliente PASS con fixtures/mock.
- Acciones lookup/sync/link/diagnose registradas en Action Layer.
- `sandbox.draft.stamp` usa vinculo provider como ruta normal.
- Fallback legacy UID requiere bandera explicita.
- Regresiones de sandbox live, reglas CFDI, workflows y repo safety PASS.
