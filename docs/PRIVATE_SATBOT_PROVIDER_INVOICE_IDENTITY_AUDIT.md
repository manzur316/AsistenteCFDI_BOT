# Private SatBot Provider Invoice Identity Audit

Fase 9R Slice 2.1A - Provider Invoice Identity Audit

Modo: AUDIT_ONLY_AND_PUSH

Fecha: 2026-06-12

## 1. Resumen ejecutivo.

Veredicto: PARTIAL_MATCH.

Private SatBot ya tiene piezas importantes para capturar identidad de factura de Factura.com Sandbox:

- El adapter `FacturaComSandboxAdapter` extrae `UID/cfdi_uid`, `UUID`, `pac_invoice_id`, `Serie` y `Folio` desde la respuesta normalizada de `POST /v4/cfdi40/create`.
- El timbrado sandbox persiste esos valores, cuando existen, dentro de `cfdi_drafts.sandbox_pac_summary`.
- La descarga XML/PDF reutiliza `cfdi_uid`, `pac_invoice_id` o `uuid` como referencia de descarga.
- La persistencia de descarga preserva `cfdi_uid`, `uuid`, `pac_invoice_id`, `serie` y `folio` si ya venian en `sandbox_pac_summary`.

Pero el sistema aun no cumple el contrato de producto para identidad operativa post-timbrado:

- No hay escritura runtime a `provider_invoice_links`, aunque el schema ya contiene `provider_invoice_id`, `provider_invoice_uid`, `uuid`, `serie` y `folio`.
- No existe un contrato canonico especifico `ProviderInvoiceIdentity`.
- Telegram no usa el folio proveedor como identidad primaria en listas normales de facturas/cobranza/documentos.
- `CLIENT_INVOICE_LEDGER` muestra estados crudos y pipes, por ejemplo `SANDBOX_TIMBRADO | PENDIENTE | $... | DRAFT-*`.
- `COLLECTION_INVOICES` usa `BOR-*`, que es correcto antes de timbrar, pero no suficiente como identidad principal despues de timbrar.
- `DOCUMENTS_MENU` sigue siendo placeholder; documentos se operan desde draft/factura concreta por `draft_id`.

Decision requerida por producto:

```text
FACTURA_PROVIDER_IDENTITY_RULE:
Despues del timbrado, la identidad operativa de factura sera el Folio del proveedor cuando este disponible.
Ejemplo: F66.
BOR-* queda como referencia de borrador origen.
DRAFT-* queda como ID interno local.
UUID queda como identificador fiscal tecnico.
```

## 2. Pregunta auditada.

Pregunta principal:

> El sistema ya captura, guarda, consulta y muestra correctamente la identidad de factura del proveedor despues del timbrado sandbox/Factura.com?

Respuesta corta:

No completamente.

El sistema puede capturar y guardar folio/serie/UUID/provider UID en `sandbox_pac_summary` cuando el proveedor los entrega, y puede usar esa identidad para descarga. Sin embargo, todavia no promueve esa identidad a un contrato canonico estable ni a una tabla provider identity operativa, y la UI de Telegram no la usa como identidad principal de factura.

## 3. Glosario de identidades: BOR, DRAFT, Folio proveedor, UUID, provider id.

| Identidad | Significado | Uso correcto |
| --- | --- | --- |
| `BOR-*` | Identidad humana display-only derivada de `draft_id`. | Visible antes de timbrar y como referencia de borrador origen despues de timbrar. |
| `DRAFT-*` | ID interno local de `cfdi_drafts.draft_id`. | Persistencia, callbacks, auditoria y debug/admin. No UX normal. |
| Folio proveedor | Folio visible en Factura.com, ejemplo `F66`; puede combinarse con serie si existe. | Identidad operativa principal despues de timbrar cuando esta disponible. |
| UUID CFDI | UUID fiscal del timbre. | Identificador fiscal tecnico; visible completo solo en debug/admin, XML/PDF o detalle tecnico. |
| Provider id / UID | Identidad interna del proveedor, en codigo actual `cfdi_uid`, `pac_invoice_id` o futuro `provider_invoice_id/provider_invoice_uid`. | Fuente tecnica para lookup/download/reconciliacion; admin/debug o storage, no lista normal. |

## 4. Inventario de campos actuales encontrados.

| Campo actual | Donde existe | Estado auditado |
| --- | --- | --- |
| `draft_id` | `sql/001_init_cfdi_bot.sql`, `cfdi_drafts`, workflow, action tokens, ledgers. | ID local principal actual. Se usa para callbacks, detalle, descarga y delivery. |
| `invoice_id` | Fallback en vistas/adapter/storage. | No hay contrato unico; se usa como alias/fallback. |
| `provider_invoice_id` | `sql/009_provider_multitenant_foundation.sql`, `provider-invoice.contract.js`. | Existe en schema/contrato, pero no hay write runtime encontrado. |
| `provider_invoice_uid` | `sql/009_provider_multitenant_foundation.sql`, `provider-invoice.contract.js`. | Existe en schema/contrato, pero no hay write runtime encontrado. |
| `provider_document_id` | No confirmado en runtime. | NO CONFIRMADO. |
| `factura_id` | Extractor de adapter para `pac_invoice_id`. | Se puede mapear si viene en respuesta; no se guarda como `factura_id`. |
| `folio` / `Folio` | Adapter, `sandbox_pac_summary`, storage manifest, tests y docs. | Se captura y persiste en JSON si viene; no es identidad principal en Telegram. |
| `serie` / `Serie` | Adapter, `sandbox_pac_summary`, storage manifest, tests y docs. | Se captura y persiste en JSON si viene. |
| `uuid` / `UUID` / `cfdi_uuid` | Adapter, validador XML, storage, `sandbox_pac_summary`, docs/tests. | Se captura de respuesta si viene; XML validator solo marca presencia, no backfill canonico. |
| `cfdi_uid` | Adapter Factura.com, `sandbox_pac_summary`, storage/download. | Principal referencia tecnica actual para Factura.com sandbox. |
| `pac_invoice_id` | Adapter/storage/summary. | Fallback o alias tecnico; persistido en `sandbox_pac_summary` si existe. |
| `document_id` | No como identidad de factura en flujo principal. | NO CONFIRMADO. |
| `idFactura` | No confirmado en runtime. | NO CONFIRMADO. |
| `uid` | Adapter extrae `UID/uid` como `cfdi_uid`, evitando `Receptor.UID`. | Usado para CFDI/provider UID, no para cliente. |
| `SANDBOX_TIMBRADO` | `invoice_status`, workflow, ledgers, tests. | Estado fiscal local actual; aparece crudo en algunas vistas. |
| `DOWNLOAD_READY` | `artifact_status` despues de timbrar con identidad descargable. | Persistido en `sandbox_pac_summary`. |
| `DOWNLOADED` | `artifact_status` despues de descarga valida. | Persistido en `sandbox_pac_summary`; delivery depende de este estado. |
| `provider_raw` | No encontrado como campo principal. | NO CONFIRMADO. |
| `raw_response` | No como campo canonico; adapter conserva `raw` sanitizado. | Snapshot sanitizado, no contrato de identidad. |
| `provider_response.sanitized.json` | Manifest de timbrado sandbox. | Referencia cruda sanitizada en runtime, no dato normalizado principal. |

Schema relevante:

- `cfdi_drafts.sandbox_pac_summary` existe por `sql/008_sandbox_pac_summary.sql` como JSONB.
- `cfdi_drafts.invoice_status/payment_status` existen por `sql/007_invoice_payment_status.sql`.
- `provider_invoice_links` existe por `sql/009_provider_multitenant_foundation.sql` con `provider_invoice_id`, `provider_invoice_uid`, `uuid`, `serie`, `folio`, flags XML/PDF y status provider/local.
- `document_delivery_ledger` existe por `sql/016_document_delivery_ledger.sql`, pero esta ligado por `draft_id`; no tiene columnas `folio`, `serie`, `uuid` o provider invoice id.

## 5. Flujo actual de timbrado sandbox.

Flujo observado:

1. `sandbox.draft.stamp` llega al Action Layer por `scripts/run-sandbox-action.js`.
2. `runSandboxDraftStamp` en `scripts/lib/sandbox-draft-stamp-action.js` carga el draft, valida readiness, resuelve `provider_client_uid` y construye el `CanonicalPacRequest`.
3. `FacturaComSandboxAdapter.stampSandbox()` en modo live llama `POST /v4/cfdi40/create`.
4. El adapter normaliza la respuesta con `normalizeFacturaComHttpResponse()`.
5. El adapter extrae identidad con:
   - `extractCfdiUid()` desde `UID`, `uid`, `Uid`, `cfdi_uid`, `CFDI_UID`.
   - `extractUuid()` desde `UUID`, `uuid`, `Uuid`, `FolioFiscal`, `folio_fiscal`.
   - `extractPacInvoiceId()` desde `pac_invoice_id`, `invoice_id`, `factura_id`, `id`, `Id`, `ID`.
   - `extractSerie()` desde `Serie`, `serie`.
   - `extractFolio()` desde `Folio`, `folio`.
6. Si existe `cfdi_uid`, `uuid` o `pac_invoice_id`, marca XML/PDF como disponibles y `artifact_status=DOWNLOAD_READY`.
7. `persistSandboxStampResult()` actualiza `cfdi_drafts`:
   - `invoice_status=SANDBOX_TIMBRADO`.
   - `payment_status=PENDIENTE` si aplica.
   - `sandbox_pac_summary` con `cfdi_uid`, `uuid`, `pac_invoice_id`, `serie`, `folio`, flags de presencia y `artifact_status`.
8. El workflow tambien arma SQL de persistencia para `cfdi_drafts.sandbox_pac_summary` desde el resultado de action layer.

Respuestas especificas:

| Pregunta | Respuesta |
| --- | --- |
| La respuesta del proveedor trae folio? | SOPORTADO por adapter si viene como `Folio`/`folio`; tests live lo simulan en `Data.Folio`. Que Factura.com real lo entregue siempre queda NO CONFIRMADO por esta auditoria estatica. |
| La respuesta trae UUID? | SOPORTADO si viene como `UUID`/`uuid`/`FolioFiscal`; docs advierten que puede no venir en create. |
| La respuesta trae serie? | SOPORTADO si viene como `Serie`/`serie`; tests live lo simulan. |
| La respuesta trae id interno del proveedor? | SOPORTADO como `cfdi_uid` desde `UID` y como `pac_invoice_id` desde campos id/factura. |
| La respuesta trae XML/PDF o solo permite descargarlos despues? | El contrato actual espera solo identidad/availability en timbrado; tests verifican que el resultado live no incluya documentos. XML/PDF se descargan despues. |
| El bot guarda esos campos? | Si, en `cfdi_drafts.sandbox_pac_summary` cuando vienen en `pacResult`. |
| El bot los pierde? | No deberia perderlos en descarga: `buildPersistedSummary()` preserva `cfdi_uid`, `uuid`, `pac_invoice_id`, `serie`, `folio`. |
| El bot solo guarda snapshot crudo? | No. Guarda campos normalizados en `sandbox_pac_summary`, mas snapshot sanitizado en runtime. |
| Hay mapper que normalice esos campos? | Si en adapter y `sandbox-draft-stamp-persistence`; no hay `ProviderInvoiceIdentity` canonico dedicado. |

Brecha clave: no se encontro write a `provider_invoice_links`. La identidad normalizada vive como JSON dentro de `cfdi_drafts`, no como provider identity durable/consultable de primer orden.

## 6. Flujo actual de descarga XML/PDF.

Flujo observado:

1. `sandbox.draft.download-artifacts` llama `runSandboxDraftDownloadArtifacts()`.
2. `collectIdentity()` lee identidad desde:
   - `draft.sandbox_pac_summary`.
   - `draft.sandbox_stamp_result`.
   - `draft.pac_sandbox_result`.
   - `draft.pac_result`.
   - el propio draft.
3. La referencia de descarga es `identity.ref = cfdi_uid || pac_invoice_id || uuid`.
4. `FacturaComSandboxAdapter.downloadXml()` y `downloadPdf()` llaman:
   - `/v4/cfdi40/{ref}/xml`.
   - `/v4/cfdi40/{ref}/pdf`.
5. El adapter valida contenido y escribe temporalmente `cfdi.xml` / `cfdi.pdf` bajo el bundle runtime de draft-stamp.
6. Si el XML es valido, puede generar PDF local fallback desde XML.
7. La accion copia documentos al storage por cliente/factura.
8. `safeManifest()` escribe manifest con `draft_id`, `client_id`, `provider`, `environment`, flags de identidad, artifact status, paths y hashes.
9. `persistSandboxStampResult()` vuelve a actualizar `sandbox_pac_summary` con `artifact_status=DOWNLOADED` o parcial y preserva identidad PAC.

Naming actual:

- Bundle tecnico de timbrado/descarga:
  - `runtime/storage-sandbox/draft-stamps/<draft_id>/<timestamp>/...`
- Storage cliente/factura:
  - `runtime/storage-sandbox/emitters/<emitter>/<yyyy>/<mm>/clients/<client_id>/invoices/invoice-<hash>/...`
- Archivos tecnicos:
  - `xml/cfdi.xml`
  - `pdf/cfdi.pdf`
- Alias humano seguro:
  - `<Cliente>_<yyyy-mm-dd>_<serie>-<folio>_SANDBOX.xml`
  - `<Cliente>_<yyyy-mm-dd>_<serie>-<folio>_SANDBOX.pdf`
  - Si falta serie/folio, cae a un identificador derivado de draft/hash.

Respuestas especificas:

| Pregunta | Respuesta |
| --- | --- |
| Donde se descargan XML/PDF? | En `scripts/lib/sandbox-draft-download-artifacts-action.js` usando `FacturaComSandboxAdapter.downloadXml/downloadPdf`. |
| Como se nombran los archivos? | Tecnicos como `cfdi.xml`/`cfdi.pdf`; alias humanos con cliente, fecha, serie/folio si existen. |
| El nombre usa `draft_id`, `uuid`, `folio`, `serie`, cliente o fecha? | Directorio tecnico usa hash de identidad/draft; alias usa cliente, fecha y `serie-folio` si existe. No usa UUID completo. |
| Se extrae UUID/folio del XML? | El validador XML detecta presencia de UUID; el renderer local extrae `serie`, `folio` y `uuid` para PDF fallback. No se encontro backfill persistente de identidad desde XML a `ProviderInvoiceIdentity`. |
| Se guarda metadata documental? | Si, en manifests y `sandbox_pac_summary`; delivery ledger guarda evidencia documental por `draft_id`. |
| La UI de Documentos puede cruzar factura con XML/PDF? | Parcialmente por `draft_id` y `artifact_status`; no por folio proveedor como llave UX. |
| Documentos puede listar por folio proveedor hoy? | No. `DOCUMENTS_MENU` es placeholder. |
| Documentos solo puede listar por draft local? | Operativamente si: delivery/status/download usan `draft_id` como llave. |
| Existe artifact status suficiente? | Si: `NOT_REQUESTED`, `DOWNLOAD_READY`, `DOWNLOADED`, `PARTIAL_DOWNLOAD`, `DOWNLOAD_ERROR` y equivalentes de accion. |
| Existe storage path ligado a factura/proveedor? | Si, pero path tecnico usa `invoice-<hash>` y manifests; no es una ruta literal por folio proveedor. |

## 7. Identidad usada hoy en Telegram.

Pantallas auditadas:

| Vista | Identidad visible hoy | Observacion |
| --- | --- | --- |
| `DRAFTS_PENDING_LIST` / `DRAFTS_APPROVED_LIST` | `BOR-*` via `humanDraftId()`. | Correcto para borradores antes de timbrar. |
| `DRAFT_DETAIL` | `ID: BOR-*`, titulo y estado humano. | No muestra folio proveedor aunque el draft ya este timbrado; sigue conceptualizado como borrador. |
| `DRAFT_SUMMARY` | Basado en draft/list context. | No se confirmo uso de folio proveedor. |
| `SANDBOX_STAMP_RESULT` | `Factura: <serie>-<folio>` si `draftOutput.serie/folio`; si no, cae a draft id. | Punto parcial donde folio puede aparecer post-accion. |
| `SANDBOX_DOWNLOAD_RESULT` | `Borrador: <draftDisplayId>`, estados y artifact status. | No muestra folio proveedor como factura. |
| `CLIENT_INVOICE_LEDGER` | `invoice_status | payment_status | total | draft_id`. | Muestra pipes tecnicos, `SANDBOX_TIMBRADO` crudo y `DRAFT-*`. |
| `CLIENT_DETAIL` | Detalle fiscal cliente; botones a Facturas/Cobranza. | No resuelve identidad de factura. |
| `COLLECTION_INVOICES` | `BOR-* | payment_status | fecha`, total y saldo. | Mejor que `DRAFT-*`, pero no usa folio proveedor post-timbrado. |
| `PAYMENT_CONFIRMATION` | `Factura: BOR-*`. | No usa folio proveedor. |
| `DOCUMENTS_MENU` | Placeholder. | No lista documentos por folio/UUID. |
| Delivery status/prepare/send | `Factura: output.folio || draftDisplayId` en algunas ramas. | Parcial: puede mostrar folio si action output lo trae; fallback es draft. |
| `PRODUCT_INVOICES_PLACEHOLDER` | Placeholder de Facturas. | No lista facturas por folio. |

Respuestas especificas:

- Muestra `DRAFT-*`? Si, en `CLIENT_INVOICE_LEDGER` y en fallbacks de resultados/tecnicos.
- Muestra `BOR-*`? Si, en listas/detalle de borradores y cobranza.
- Muestra folio proveedor? Solo parcialmente en resultado de timbrado si `serie/folio` vienen en output; no en listas normales.
- Muestra UUID? UX normal muestra presencia/oculto en resultado de timbrado; no UUID completo. Correcto.
- Muestra serie/folio? Parcialmente en `SANDBOX_STAMP_RESULT` y alias de archivo; no en ledger/listas.
- Muestra estados crudos como `SANDBOX_TIMBRADO`? Si, especialmente ledger y algunos resultados.
- Muestra pipes tecnicos? Si, `CLIENT_INVOICE_LEDGER` usa pipes.
- Donde deberia cambiar a folio proveedor? `DRAFT_DETAIL` cuando `invoice_status=SANDBOX_TIMBRADO`, `CLIENT_INVOICE_LEDGER`, `COLLECTION_INVOICES`, `PAYMENT_CONFIRMATION`, `DOCUMENTS_MENU`, delivery status/result y cualquier boton `Ver factura`.

## 8. Tabla: campo actual vs campo necesario.

| Campo actual | Campo necesario | Estado | Decision |
| --- | --- | --- | --- |
| `cfdi_drafts.draft_id` | `ProviderInvoiceIdentity.local_draft_id` | Existe. | Mantener interno/debug. |
| `humanDraftId()` / `BOR-*` | `local_human_draft_id` | Existe como funcion, no campo persistido. | Mantener display de origen. |
| `sandbox_pac_summary.provider` | `provider_name` | Existe. | Normalizar valor. |
| `sandbox_pac_summary.environment` | `provider_environment` | Existe. | Normalizar `SANDBOX`. |
| `sandbox_pac_summary.pac_invoice_id` | `provider_invoice_id` | Parcial. | Mapear explicitamente; no confundir con `cfdi_uid`. |
| `sandbox_pac_summary.cfdi_uid` | `provider_document_id` o `provider_invoice_uid` | Parcial. | Definir nombre canonico. |
| `sandbox_pac_summary.folio` | `provider_folio` | Existe en JSON si provider lo entrega. | Promover a identidad UX primaria. |
| `sandbox_pac_summary.serie` | `provider_serie` | Existe en JSON si provider lo entrega. | Usar como prefijo si existe. |
| `sandbox_pac_summary.uuid` | `provider_uuid` | Existe en JSON si provider lo entrega. | Mantener tecnico; no lista normal. |
| `sandbox_pac_summary.provider_status` o status de PAC | `provider_status` | Parcial. | Normalizar por provider. |
| `provider_stamp_at` en snapshot resultado | `stamped_at` | Parcial/anidado. | Promover a campo canonico. |
| `xml_storage_path` / `human_xml_path` | `xml_path` + `xml_artifact_id` | Path existe; artifact id no. | Agregar artifact id estable. |
| `pdf_storage_path` / `human_pdf_path` | `pdf_path` + `pdf_artifact_id` | Path existe; artifact id no. | Agregar artifact id estable. |
| `provider_response_path` | `provider_raw_snapshot_ref` | Existe en manifest de timbrado. | Referenciar sin exponer payload. |
| flags `_present` | `identity_confidence` | Parcial. | Calcular `PROVIDER_FOLIO_CONFIRMED`, `UUID_ONLY`, etc. |
| fuente respuesta/XML/snapshot | `identity_source` | Parcial. | Declarar `stamp_response`, `xml_extract`, `provider_lookup`, `manual_backfill`. |

## 9. ProviderInvoiceIdentity propuesto.

Contrato canonico:

```text
ProviderInvoiceIdentity
  local_draft_id
  local_human_draft_id
  provider_name
  provider_environment
  provider_invoice_id
  provider_folio
  provider_serie
  provider_uuid
  provider_status
  stamped_at
  xml_artifact_id
  pdf_artifact_id
  xml_path
  pdf_path
  provider_raw_snapshot_ref
  identity_confidence
  identity_source
```

Obligatorios:

| Campo | Obligatorio | Comentario |
| --- | --- | --- |
| `local_draft_id` | Si | Llave local de origen. |
| `local_human_draft_id` | Si | `BOR-*` display de origen. |
| `provider_name` | Si | Ejemplo: `factura.com`. |
| `provider_environment` | Si | `SANDBOX` / futuro `PRODUCTION`. |
| `provider_status` | Si | Estado normalizado del proveedor o `UNKNOWN`. |
| `identity_confidence` | Si | Permite no inventar folios. |
| `identity_source` | Si | Fuente del dato. |

Nullable:

| Campo | Nullable | Comentario |
| --- | --- | --- |
| `provider_invoice_id` | Si | Puede no venir separado de UID. |
| `provider_folio` | Si | Puede faltar en respuesta; no inventar. |
| `provider_serie` | Si | Puede faltar o no aplicar. |
| `provider_uuid` | Si | Docs actuales advierten que puede no venir en create. |
| `stamped_at` | Si | Puede venir de provider o timestamp local. |
| `xml_artifact_id` | Si | Hasta descarga valida. |
| `pdf_artifact_id` | Si | Hasta descarga valida. |
| `xml_path` | Si | Solo despues de descarga valida. |
| `pdf_path` | Si | Solo despues de descarga valida. |
| `provider_raw_snapshot_ref` | Si | Solo si se escribio snapshot sanitizado. |

Visibles en UX normal:

- `provider_folio` como identidad principal despues de timbrar.
- `provider_serie + provider_folio` si ambos existen y Factura.com lo muestra asi.
- `local_human_draft_id` solo como "Borrador origen".
- `provider_name` humanizado, por ejemplo `Factura.com Sandbox`.
- `provider_status` traducido a estado humano.

Admin/debug only:

- `local_draft_id`.
- `provider_invoice_id`.
- `provider_uuid` completo.
- `xml_path`, `pdf_path`.
- `provider_raw_snapshot_ref`.
- snapshots y raw statuses.

Fuente de verdad del proveedor:

- Primaria operativa: `provider_folio` cuando existe.
- Tecnica de integracion: `provider_invoice_id` / `provider_invoice_uid` / `cfdi_uid`.
- Fiscal tecnica: `provider_uuid`.
- Documental: XML/PDF validos y metadata de artifact.

## 10. Reglas visuales propuestas.

Antes de timbrar:

```text
BOR-5412 - Cliente - $928.00
```

Despues de timbrar con folio proveedor:

```text
F66 - Cliente - $928.00
Fiscal: Timbrada sandbox
Pago: Pendiente
Docs: Pendientes
```

Despues de descarga:

```text
F66 - Cliente - $928.00
Fiscal: Timbrada sandbox
Pago: Pendiente
Docs: Descargados
```

Detalle normal:

```text
Factura: F66
Cliente: Real Bilbao
Total: $928.00
Estado fiscal: Timbrada sandbox
Pago: Pendiente
UUID: presente
Borrador origen: BOR-5412
Proveedor: Factura.com Sandbox
```

Admin/debug:

```text
Draft local: DRAFT-...
Provider invoice id: ...
UUID completo: ...
Raw snapshot ref: ...
```

Reglas:

- No mostrar `DRAFT-*` en listas normales.
- No mostrar `SANDBOX_TIMBRADO` crudo en UX normal.
- No mostrar pipes tecnicos.
- No inventar folios.
- Si no hay folio proveedor, usar fallback claro:
  - `FAC-SBX-<BOR corto>`, o
  - `UUID corto` si existe.
- Cuando se use fallback, mostrar en detalle:
  - `Folio proveedor: no disponible`.
- `BOR-*` queda como referencia de origen, no como identidad primaria post-timbrado.
- `UUID completo` queda fuera de UX normal.

## 11. Gaps y severidad.

| Severidad | Gap | Evidencia | Impacto |
| --- | --- | --- | --- |
| BLOCKER | Folio proveedor no es identidad operativa principal post-timbrado. | UI ledger/cobranza/detalle no usa `sandbox_pac_summary.folio`. | El usuario sigue viendo `DRAFT-*`/`BOR-*` en vez de `F66`. |
| BLOCKER | No hay `ProviderInvoiceIdentity` canonico ni write a `provider_invoice_links`. | Schema existe, pero no se encontro `INSERT/UPDATE provider_invoice_links`. | Dificulta consulta, reconciliacion, backfill y fuente de verdad provider. |
| HIGH | `CLIENT_INVOICE_LEDGER` muestra `DRAFT-*`, estados crudos y pipes. | Render actual: `invoice_status | payment_status | total | draft_id`. | Rompe contrato de presentacion limpia. |
| HIGH | Documentos estan ligados operativamente por `draft_id`, no por folio proveedor. | `document_delivery_ledger` key por `draft_id`; `DOCUMENTS_MENU` placeholder. | No se puede listar/operar documentos por folio. |
| HIGH | Descarga no backfillea identidad desde XML. | Validador XML detecta UUID; renderer extrae serie/folio para PDF, pero no persistencia canonica. | Si la respuesta create no trae folio/UUID, se pierde oportunidad de completar identidad. |
| HIGH | Provider invoice id canonico no esta diferenciado. | Runtime usa `cfdi_uid` y `pac_invoice_id`; contrato usa `provider_invoice_id/provider_invoice_uid`. | Ambiguedad para Factura.com y proveedores futuros. |
| MEDIUM | Resultado de descarga dice `Borrador:` aunque ya es factura timbrada. | `Build PAC Sandbox Action Summary` usa `Borrador: draftDisplayId` en download. | UX confunde factura timbrada con borrador. |
| MEDIUM | `SANDBOX_TIMBRADO`, `DOWNLOAD_READY`, `DOWNLOADED` aparecen como labels tecnicos en algunas vistas. | Ledger y resultados tecnicos. | Menor legibilidad y riesgo de soporte. |
| MEDIUM | Artifact id estable no existe separado de paths. | Hay paths/hashes/manifests, no `xml_artifact_id/pdf_artifact_id` canonico. | Dificulta UI documental robusta. |
| LOW | Tests live no asertan explicitamente `serie`/`folio` aunque los simulan. | Test valida `cfdi_uid`, `uuid`, status y availability. | Riesgo de regresion especifica de folio. |

## 12. Riesgos.

- Si se cambia UX antes de consolidar contrato, puede mostrarse un folio incompleto o no confirmado.
- Si se usa `Folio` sin `Serie`, puede haber colisiones visuales entre series o ambientes.
- Si se confunde `Receptor.UID` con `cfdi_uid`, se rompen descargas y storage. El adapter actual intenta evitarlo.
- Si se promociona `uuid` como identidad principal, se vuelve poco operable para el usuario y puede exponer dato fiscal tecnico.
- Si `provider_invoice_links` se empieza a llenar sin idempotencia por `local_draft_id/provider/environment`, se pueden duplicar identidades.
- Si se cambia storage path literal a folio sin estrategia de colision/migracion, puede romper artifacts existentes.
- Si se muestran paths, UID o UUID completos en Telegram normal, se rompe el contrato de privacidad.

## 13. Roadmap por slices.

### Slice A: Schema/contract de identidad proveedor/factura.

Objetivo:

- Crear `ProviderInvoiceIdentity` como contrato canonico.
- Definir mapping desde `sandbox_pac_summary` y futuro `provider_invoice_links`.

Archivos probables:

- `scripts/lib/provider-contracts/provider-invoice.contract.js`
- nuevo contrato en `scripts/lib/provider-contracts/`
- `sql/009_provider_multitenant_foundation.sql` o migracion aditiva nueva
- tests de provider canonical contracts

Pruebas:

- contrato requiere local/provider/env/source/confidence;
- permite nullable para folio/uuid;
- no filtra UUID/UID completos en UX normal;
- idempotencia por `local_draft_id + provider + environment`.

Riesgos:

- Duplicar `CanonicalProviderInvoice` existente en vez de extenderlo limpiamente.

No-alcance:

- No cambiar Telegram todavia.
- No llamar Factura.com.

### Slice B: Capturar y persistir folio/UUID/provider id en timbrado sandbox.

Objetivo:

- En timbrado sandbox, escribir identidad normalizada a `provider_invoice_links` o tabla equivalente.
- Mantener `sandbox_pac_summary` como snapshot compatible.

Archivos probables:

- `scripts/lib/sandbox-draft-stamp-action.js`
- `scripts/lib/sandbox-draft-stamp-persistence.js`
- `scripts/lib/factura-com-sandbox-adapter.js`
- tests de stamp persistence

Pruebas:

- `folio`, `serie`, `uuid`, `cfdi_uid`, `pac_invoice_id` persistidos cuando vienen.
- no sobreescribe con null.
- fallback no inventa folio.
- `payment_status=PENDIENTE` sigue intacto.

Riesgos:

- Escribir provider identity con datos parciales sin confidence/source.

No-alcance:

- No backfill historico.
- No UI.

### Slice C: Backfill local desde XML/PDF o provider snapshot.

Objetivo:

- Completar `provider_folio`, `provider_serie` y `provider_uuid` desde XML valido o snapshot sanitizado existente.

Archivos probables:

- extractor XML dedicado o extension de `local-cfdi-pdf-renderer.js`
- action/script offline seguro de backfill
- tests con XML fixture sin datos sensibles reales

Pruebas:

- extrae `Comprobante@Serie`, `Comprobante@Folio`, `TimbreFiscalDigital@UUID`.
- no imprime RFCs ni XML completo.
- no muta si identity_confidence existente es superior.

Riesgos:

- Leer payloads historicos con datos fiscales; debe sanitizar outputs.

No-alcance:

- No consultar PAC real.
- No descargar XML/PDF.

### Slice D: Actualizar UI de Facturas para mostrar folio proveedor.

Objetivo:

- Reemplazar identidad visible post-timbrado por `provider_folio`.
- Mantener `BOR-*` como origen.

Archivos probables:

- `workflow/cfdi_telegram_local_ingest.n8n.json`
- `scripts/lib/client-invoice-ledger-view.js`
- tests de Telegram ledger, collection, draft detail y presentation contract

Pruebas:

- no `DRAFT-*` en listas normales;
- no pipes tecnicos;
- `SANDBOX_TIMBRADO` traducido a "Timbrada sandbox";
- fallback visible cuando no hay folio.

Riesgos:

- Cambiar workflow inline sin sincronizacion controlada.

No-alcance:

- No cambiar schema ni provider adapter en este slice si Slice B no esta hecho.

### Slice E: Actualizar Documentos para listar por folio proveedor.

Objetivo:

- Convertir `DOCUMENTS_MENU` de placeholder a lista/estado documental por factura.
- Usar `provider_folio` como identidad visible.

Archivos probables:

- workflow Telegram
- `document_delivery_ledger` store/action
- `scripts/lib/sandbox-draft-download-artifacts-action.js`
- tests document delivery/status/menu

Pruebas:

- listar descargados/pendientes por folio;
- botones delivery siguen tokenizados por `draft_id` interno;
- no expone paths/UUID/UID.

Riesgos:

- Mezclar acciones de envio con lista historica pesada.

No-alcance:

- No envio automatico.
- No reconciliacion provider.

### Slice F: Provider Truth/Reconciliation.

Objetivo:

- Consultar/verificar proveedor como fuente de verdad fiscal despues de timbrar.
- Reconciliar identidad local con provider state, XML/PDF y cancelaciones.

Archivos probables:

- adapter Factura.com lookup
- provider sync action
- provider invoice identity store
- reporting/storage analyzers

Pruebas:

- no llama provider fuera de modo explicitamente permitido;
- maneja no encontrado/ambiguedad;
- no muta pagos locales sin confirmacion;
- conserva evidencia sanitizada.

Riesgos:

- Llamadas reales accidentales a PAC o descarga de documentos fuera de gates.

No-alcance:

- No produccion fiscal real hasta go-live gates.

## 14. Veredicto final.

El sistema ya tiene extraccion y persistencia parcial de identidad proveedor en sandbox, pero no cumple todavia la regla de producto de identidad visual post-timbrado.

Respuestas finales:

- Folio proveedor: se puede capturar y guardar en `cfdi_drafts.sandbox_pac_summary.folio` si Factura.com lo devuelve; no se guarda aun como `ProviderInvoiceIdentity`/`provider_invoice_links` operativo y no gobierna la UX.
- UUID: se puede capturar y guardar en `sandbox_pac_summary.uuid` si viene; XML valida presencia de UUID, pero no hay backfill canonico desde XML.
- Provider invoice id: `cfdi_uid` y `pac_invoice_id` se guardan en `sandbox_pac_summary`; `provider_invoice_id/provider_invoice_uid` existen en schema/contrato pero no se escriben en runtime.
- XML/PDF: estan ligados operativamente a `draft_id` y a una referencia tecnica `cfdi_uid || pac_invoice_id || uuid`; storage puede conservar folio/serie en manifest y alias humano, pero Documentos no lista por folio/UUID.
- UI Telegram: antes de timbrar usa `BOR-*` correctamente en drafts; despues de timbrar no cambia de forma consistente a folio proveedor.

Decision:

No implementar cambios en este slice. El siguiente slice debe consolidar contrato/schema de identidad proveedor antes de limpiar UI, para evitar inventar folios o depender de un JSON local ambiguo.

## 15. Evidencia revisada.

Archivos rectores:

- `docs/PRIVATE_SATBOT_GLOBAL_UX_NAVIGATION_RESET_AUDIT.md`
- `docs/PRIVATE_SATBOT_UX_PRESENTATION_CONTRACT_V0.1.md`
- `docs/PRIVATE_SATBOT_UX_MASTER_PLAN_V0.1.md`
- `docs/PRIVATE_SATBOT_TELEGRAM_UX_CONTRACT_V0.1.md`
- `docs/TELEGRAM_SCREEN_NAVIGATION_MATRIX.md`

Workflow:

- `workflow/cfdi_telegram_local_ingest.n8n.json`

Schema:

- `sql/001_init_cfdi_bot.sql`
- `sql/007_invoice_payment_status.sql`
- `sql/008_sandbox_pac_summary.sql`
- `sql/009_provider_multitenant_foundation.sql`
- `sql/016_document_delivery_ledger.sql`

Factura.com/PAC/action layer:

- `scripts/lib/factura-com-sandbox-adapter.js`
- `scripts/lib/factura-com-live-client.js`
- `scripts/lib/factura-com-sandbox-client-adapter.js`
- `scripts/lib/sandbox-draft-stamp-action.js`
- `scripts/lib/sandbox-draft-stamp-persistence.js`
- `scripts/lib/sandbox-draft-download-artifacts-action.js`
- `scripts/lib/sandbox-storage-engine.js`
- `scripts/lib/sandbox-human-readable-storage-naming.js`
- `scripts/lib/sandbox-artifact-content-validator.js`
- `scripts/lib/document-rendering/local-cfdi-pdf-renderer.js`
- `scripts/lib/provider-contracts/provider-invoice.contract.js`
- `scripts/run-sandbox-action.js`

Telegram/UI/reporting:

- `scripts/lib/client-invoice-ledger-view.js`
- `scripts/lib/client-billing-summary-view.js`
- `scripts/lib/monthly-billing-dashboard-view.js`
- `scripts/lib/payment-status-action.js`

Tests/fixtures:

- `scripts/test-factura-com-sandbox-live-adapter-contract.js`
- `scripts/test-factura-com-sandbox-live-download-adapter-contract.js`
- `scripts/test-provider-canonical-contracts.js`
- `scripts/test-provider-multitenant-schema-contract.js`
- `scripts/test-sandbox-download-persistence-preserves-pac-identity.js`
- `scripts/test-sandbox-download-human-file-names.js`
- `scripts/test-sandbox-artifact-content-validator.js`
- `scripts/test-client-invoice-ledger-view.js`
- `scripts/test-payment-status-command-adapter.js`
- `scripts/test-monthly-billing-dashboard-view.js`
- `data/sandbox/facturacom-mock-success-responses.json`

Docs relacionadas:

- `README.md`
- `docs/FACTURACOM_SANDBOX_ADAPTER.md`
- `docs/FACTURACOM_SANDBOX_MAPPER.md`
- `docs/ROADMAP_PAC_STORAGE_REPORTING.md`
- `docs/PHASE_7_15_FACTURACOM_SANDBOX_LIVE_STAMPING_ADAPTER.md`
- `docs/PHASE_7_16_SANDBOX_XML_PDF_DOWNLOAD_CLIENT_STORAGE.md`
- `docs/PHASE_7_16C_MULTIPROVIDER_CANONICAL_FOUNDATION.md`
- `docs/PHASE_7_17D_DURABLE_SANDBOX_STAMP_PERSISTENCE.md`
- `docs/PHASE_7_17E_DOWNLOAD_ARTIFACT_PERSISTENCE_TELEGRAM_DELIVERY.md`
- `docs/DOCUMENT_DELIVERY_LEDGER.md`
- `docs/DOCUMENT_DELIVERY_CANONICAL_CONTRACT.md`

No ejecutado por restriccion de auditoria:

- watcher;
- workflow-sync;
- n8n runtime;
- smokes live;
- timbrado sandbox/real;
- llamadas Factura.com/PAC;
- descargas XML/PDF;
- consultas o mutaciones de datos fiscales.
