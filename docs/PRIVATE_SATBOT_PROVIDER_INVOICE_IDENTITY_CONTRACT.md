# Private SatBot Provider Invoice Identity Contract

## 1. Objetivo

Definir el contrato offline `ProviderInvoiceIdentity` para normalizar la identidad de factura del proveedor despues del timbrado sandbox/Factura.com, sin conectar todavia escritura runtime, workflow, DB ni UI.

El contrato vive en:

- `scripts/lib/provider-contracts/provider-invoice-identity.contract.js`
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

Este objeto esta pensado como input futuro para `provider_invoice_links`, pero este slice no lo persiste.

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

## 8. Que NO implementa este slice

Este slice no:

- Escribe `provider_invoice_links`.
- Modifica `cfdi_drafts`.
- Modifica SQL/schema.
- Modifica workflow n8n.
- Modifica runtime.
- Cambia UI de Facturas o Documentos.
- Ejecuta timbrado, descargas, smokes, watcher ni llamadas PAC/Factura.com.

Siguiente slice recomendado: persistencia runtime de `ProviderInvoiceIdentity` desde `sandbox_pac_summary` hacia `provider_invoice_links`, con idempotencia por `draft_id + provider + environment`.
