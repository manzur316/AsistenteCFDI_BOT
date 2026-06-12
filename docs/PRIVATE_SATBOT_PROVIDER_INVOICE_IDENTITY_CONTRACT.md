# Private SatBot Provider Invoice Identity Contract

## 1. Objetivo

Definir el contrato `ProviderInvoiceIdentity` para normalizar la identidad de factura del proveedor despues del timbrado sandbox/Factura.com y persistirla de forma idempotente en `provider_invoice_links` durante el runtime local.

El contrato vive en:

- `scripts/lib/provider-contracts/provider-invoice-identity.contract.js`
- `scripts/lib/provider-contracts/provider-invoice-link-persistence.js`
- Exportado por `scripts/lib/provider-contracts/provider-contract-index.js`

Regla de producto:

```text
FACTURA_PROVIDER_IDENTITY_RULE:
Despues del timbrado, la identidad operativa de factura sera el Folio del proveedor cuando este disponible.
Ejemplo: F66.
BOR-* queda como referencia de borrador origen.
DRAFT-* queda como ID interno local.
UUID queda como identificador fiscal tecnico.
```

## 2. Identidades

| Identidad | Uso |
| --- | --- |
| `BOR-*` | Identidad humana local de borrador. Puede verse antes de timbrar y como origen despues de timbrar. |
| `DRAFT-*` | ID interno local. No debe mostrarse en UX normal. Solo debug/admin. |
| Folio proveedor | Identidad operativa primaria despues de timbrar, por ejemplo `F66` o `A-F66` si hay serie. |
| UUID CFDI | Identificador fiscal tecnico. No debe mostrarse completo en UX normal. |
| Provider id / UID | Identidad tecnica del PAC/proveedor, por ejemplo `pac_invoice_id` o `cfdi_uid`. Admin/debug o persistencia. |

## 3. Estructura ProviderInvoiceIdentity

```js
{
  schema_version: "provider_invoice_identity.v1",
  local_draft_id: null,
  local_human_draft_id: null,
  provider_name: null,
  provider_environment: null,
  provider_invoice_id: null,
  provider_invoice_uid: null,
  provider_folio: null,
  provider_serie: null,
  provider_uuid: null,
  provider_status: null,
  stamped_at: null,
  xml_artifact_id: null,
  pdf_artifact_id: null,
  xml_path: null,
  pdf_path: null,
  provider_raw_snapshot_ref: null,
  identity_confidence: "NONE",
  identity_source: "draft",
  ui_display_id: null,
  debug_display_id: null,
  warnings: []
}
```

Campos auxiliares normalizados por el helper para tests/candidatos:

- `local_status`
- `payment_status`
- `artifact_status`
- `client_display_name`
- `has_xml`
- `has_pdf`

Aliases soportados:

| Canonico | Aliases |
| --- | --- |
| `provider_folio` | `folio`, `Folio`, `provider_folio` |
| `provider_serie` | `serie`, `Serie`, `provider_serie` |
| `provider_uuid` | `uuid`, `UUID`, `cfdi_uuid`, `FolioFiscal`, `folio_fiscal` |
| `provider_invoice_uid` | `cfdi_uid`, `UID`, `uid`, `provider_invoice_uid` |
| `provider_invoice_id` | `pac_invoice_id`, `invoice_id`, `factura_id`, `provider_invoice_id` |

## 4. Reglas de display

`resolveProviderDisplayId(identity)` aplica este orden:

1. `provider_serie + provider_folio`: `A-F66`.
2. Solo `provider_folio`: `F66`.
3. Solo UUID: `UUID-xxxxxxxx`.
4. Solo UID proveedor: `PAC-xxxxxxxx`.
5. Fallback local humano: `BOR-5412`.
6. Fallback tecnico sin exponer `DRAFT-*`: `FAC-SBX-xxxxxxxx`.

Reglas duras:

- No inventa folio.
- No inventa UUID.
- No inventa provider id.
- `DRAFT-*` nunca se usa como `ui_display_id`.
- `DRAFT-*` solo puede aparecer en `debug_display_id`.

## 5. Reglas de confianza

| Valor | Condicion |
| --- | --- |
| `NONE` | No hay folio, UUID, provider UID ni provider invoice id. |
| `PARTIAL` | Hay solo una pieza de identidad proveedor. |
| `STRONG` | Hay folio y al menos UUID, provider UID o provider invoice id. |

Si el borrador esta post-timbrado y no hay identidad proveedor, el helper agrega `PROVIDER_IDENTITY_MISSING`.

## 6. Candidate para provider_invoice_links

`buildProviderInvoiceLinkCandidate(identity)` devuelve un objeto puro, sin SQL ni mutacion:

```js
{
  draft_id,
  provider_invoice_id,
  provider_invoice_uid,
  uuid,
  serie,
  folio,
  provider_status,
  local_status,
  has_xml,
  has_pdf,
  xml_path,
  pdf_path,
  provider_name,
  provider_environment,
  raw_snapshot_ref,
  xml_downloaded,
  pdf_downloaded,
  warnings
}
```

Este objeto es la base del plan de persistencia runtime hacia `provider_invoice_links`.

## 7. Sanitizacion

`sanitizeProviderInvoiceIdentityForUi(identity)`:

- Puede exponer folio, serie, proveedor, ambiente, estado humano y disponibilidad documental.
- No expone `DRAFT-*`.
- No expone UUID completo.
- No expone paths locales completos.
- No expone raw snapshots.

`sanitizeProviderInvoiceIdentityForDebug(identity)`:

- Puede exponer `local_draft_id`, UUID completo y provider ids.
- Redacta valores obvios de token, secret, password, api key o authorization.

## 8. Runtime persistence

La persistencia runtime se integra en `scripts/lib/sandbox-draft-stamp-persistence.js`, que ya es el punto comun usado por:

- `sandbox.draft.stamp`
- `sandbox.draft.download-artifacts`
- recuperacion local de estado documental descargado

El helper puro `buildProviderInvoiceLinkPersistencePlan(input)`:

- normaliza el input con `normalizeProviderInvoiceIdentity`;
- construye el candidate con `buildProviderInvoiceLinkCandidate`;
- genera SQL para `provider_invoice_links`;
- no ejecuta SQL;
- no requiere conexion a DB;
- no muta datos por si mismo.

### Fuente de datos

La identidad se toma de:

- `draft_id`
- `client_id` cuando esta disponible
- `sandbox_pac_summary`
- `pacResult`
- `invoice_status`
- `payment_status`
- `artifact_status`
- `folio`
- `serie`
- `uuid`
- `cfdi_uid`
- `pac_invoice_id`
- `provider`
- `environment`

### Estrategia de idempotencia

El schema actual tiene:

- `provider_invoice_link_id` como primary key;
- indice no unico `idx_provider_invoice_links_tenant_draft` sobre `tenant_id, draft_id`;
- indice no unico `idx_provider_invoice_links_provider` sobre `provider, environment, provider_invoice_id, provider_invoice_uid, uuid`;
- no tiene constraint unico por `tenant_id, draft_id, provider, environment`.

Por eso el runtime usa estrategia:

```text
UPDATE provider_invoice_links
WHERE tenant_id + draft_id + provider + environment

INSERT provider_invoice_links
WHERE NOT EXISTS mismo tenant_id + draft_id + provider + environment
```

No usa `ON CONFLICT` en runtime porque el schema actual no tiene el constraint unico necesario.

### Timbrado sandbox

Despues del timbrado, si hay identidad proveedor suficiente, se escribe o actualiza:

- `draft_id`
- `client_id` si existe
- `provider`
- `environment`
- `provider_invoice_id`
- `provider_invoice_uid`
- `uuid`
- `serie`
- `folio`
- `provider_status`
- `invoice_status`
- `payment_status_local`
- `xml_downloaded=false`
- `pdf_downloaded=false`
- `provider_response_sanitized` con metadata minima y sanitizada

No se inserta una fila vacia si `identity_confidence=NONE` y no hay folio, UUID, provider UID ni provider invoice id.

### Descarga XML/PDF

Despues de `sandbox.draft.download-artifacts`, el mismo punto de persistencia actualiza:

- identidad preservada: `folio`, `serie`, `uuid`, `provider_invoice_uid`, `provider_invoice_id`;
- `xml_downloaded`;
- `pdf_downloaded`;
- `provider_status`;
- `invoice_status`;
- `payment_status_local`;
- metadata minima en `provider_response_sanitized`.

El schema real no tiene columnas `xml_path` ni `pdf_path`; por lo tanto este slice no guarda rutas documentales como columnas en `provider_invoice_links`.

### Reglas de no degradacion

El SQL usa `COALESCE(nuevo, existente)` para no sobrescribir `folio`, `uuid`, `provider_invoice_uid`, `provider_invoice_id`, `serie` ni estados buenos con `NULL`.

Los flags documentales usan OR booleano:

```text
xml_downloaded = xml_downloaded OR nuevo_xml_downloaded
pdf_downloaded = pdf_downloaded OR nuevo_pdf_downloaded
```

Asi una descarga posterior puede marcar documentos sin degradar una fila previa.

## 9. Historical backfill

Las facturas sandbox timbradas antes de la persistencia runtime pueden tener identidad proveedor en `cfdi_drafts.sandbox_pac_summary` o manifests JSON historicos, pero no tener fila en `provider_invoice_links`.

El tooling de backfill vive en:

- `scripts/lib/provider-contracts/provider-invoice-identity-backfill.js`
- `scripts/backfill-provider-invoice-links.js`
- `scripts/test-provider-invoice-identity-backfill.js`

### Fuentes usadas

Prioridad de fuentes:

1. `cfdi_drafts.sandbox_pac_summary`, porque es el resumen persistido del timbrado/descarga.
2. Manifests JSON historicos, si se pasa `--manifest-root`, para completar campos faltantes.
3. `provider_invoice_links`, solo para clasificar si el plan sera `INSERT`, `UPDATE` o `SKIP_ALREADY_COMPLETE`.

Campos usados:

- `draft_id`
- `client_id`
- `invoice_status`
- `payment_status`
- `artifact_status`
- `folio`
- `serie`
- `uuid`
- `cfdi_uid`
- `pac_invoice_id`
- `xml_downloaded`
- `pdf_downloaded`

No se leen XML/PDF ni payloads crudos.

### Dry-run

El default del CLI es dry-run:

```bash
node scripts/backfill-provider-invoice-links.js --dry-run
node scripts/backfill-provider-invoice-links.js --dry-run --json
node scripts/backfill-provider-invoice-links.js --dry-run --limit 10
```

En dry-run el script:

- usa consulta read-only si hay DB local configurada;
- puede leer fixtures o manifests JSON;
- genera plan de backfill;
- no ejecuta SQL de escritura;
- oculta rutas sensibles, tokens, secrets y payloads completos.

### Apply protegido

El modo apply existe para una fase posterior, pero esta protegido:

```bash
node scripts/backfill-provider-invoice-links.js --apply --yes-i-understand-this-mutates-db
```

Si falta `--yes-i-understand-this-mutates-db`, aborta con `APPLY_CONFIRMATION_REQUIRED`.

Este slice no ejecuta `--apply`.

### Idempotencia y no degradacion

El backfill usa `buildProviderInvoiceLinkPersistencePlan()`, por lo que conserva la misma estrategia runtime:

- `UPDATE` por `tenant_id + draft_id + provider + environment`;
- `INSERT ... WHERE NOT EXISTS` con la misma llave;
- `COALESCE(nuevo, existente)` para no sobrescribir folio, UUID, provider UID o provider id con `NULL`;
- OR booleano para `xml_downloaded` y `pdf_downloaded`.

### Clasificacion del plan

Cada candidato queda como:

- `INSERT`: no hay fila existente y hay identidad proveedor suficiente.
- `UPDATE`: existe fila, pero falta completar identidad o flags documentales.
- `SKIP_NO_IDENTITY`: no hay folio, UUID, provider UID ni provider id.
- `SKIP_ALREADY_COMPLETE`: la fila existente ya contiene la identidad y flags aplicables.

Siguiente paso operativo: ejecutar dry-run local real, revisar el plan y autorizar una fase de apply si el conteo y las muestras son correctas.

## 10. Que NO implementa este slice

Este slice no:

- Modifica SQL/schema.
- Modifica workflow n8n.
- Cambia UI de Facturas o Documentos.
- Ejecuta backfill historico con escritura real.
- Ejecuta timbrado, descargas, smokes, watcher ni llamadas PAC/Factura.com.

Siguiente slice recomendado: revisar un dry-run real local y autorizar apply, o avanzar a UI de Facturas por folio proveedor con fallback seguro.
