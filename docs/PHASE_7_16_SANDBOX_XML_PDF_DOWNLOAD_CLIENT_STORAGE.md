# Fase 7.16 - Sandbox XML/PDF Download and Client Storage

## Objetivo

La fase 7.16 agrega descarga controlada de XML/PDF desde Factura.com Sandbox y
almacenamiento local por borrador y por cliente/factura. Sigue siendo sandbox:
no habilita produccion, no timbra fiscalmente en produccion y no envia archivos
por Telegram.

## Semantica de artefactos

7.16 separa la semantica que en 7.15 podia prestarse a confusion:

- `xml_provider_available` / `pdf_provider_available`: el proveedor parece tener
  un artefacto descargable.
- `xml_downloaded` / `pdf_downloaded`: el archivo local fue descargado y
  almacenado.
- `xml_storage_path` / `pdf_storage_path`: ruta relativa tecnica dentro de
  `runtime/`, nunca ruta absoluta ni mensaje Telegram.
- `xml_sha256` / `pdf_sha256`: checksum local.
- `xml_size_bytes` / `pdf_size_bytes`: tamano local.
- `xml_content_valid` / `pdf_content_valid`: el contenido paso validacion
  minima de CFDI XML o PDF real.
- `xml_validation_status` / `pdf_validation_status`: estado seguro de
  validacion de contenido.
- `artifact_status`: `NOT_REQUESTED`, `DOWNLOAD_READY`, `DOWNLOADED`,
  `PARTIAL_DOWNLOAD`, `DOWNLOAD_ERROR`, `NEEDS_CONFIG` o `NEEDS_RUNTIME`.

`sandbox.draft.stamp` puede dejar `DOWNLOAD_READY`; solo
`sandbox.draft.download-artifacts` puede marcar `*_downloaded=true`.

## Adapter

`FacturaComSandboxAdapter` soporta:

- `downloadXml(invoiceRef, context)`
- `downloadPdf(invoiceRef, context)`

Gating obligatorio:

- `FACTURACOM_SANDBOX_MODE=live`
- `FACTURACOM_SANDBOX_LIVE=1`
- `FACTURACOM_BASE_URL=https://sandbox.factura.com/api`
- credenciales por variables locales no versionadas

Los endpoints se toman del smoke/documentacion existente:

- `GET /v4/cfdi40/{cfdi_ref}/xml`
- `GET /v4/cfdi40/{cfdi_ref}/pdf`

Produccion `https://api.factura.com` queda bloqueada.

## Validacion de contenido

Desde 7.16I, una respuesta no vacia del proveedor ya no basta. El adapter valida
el contenido antes de escribir `cfdi.xml` o `cfdi.pdf`.

Documento:

```text
docs/SANDBOX_XML_PDF_CONTENT_VALIDATION.md
```

Reglas principales:

- XML debe parecer CFDI 4.0 con `Comprobante`, namespace/Version, Timbre Fiscal
  Digital y UUID.
- PDF debe iniciar con `%PDF`, contener `%%EOF` y superar tamano minimo.
- Desde 7.16J, PDF tambien debe tener contenido visual probable. Un PDF que
  abre en blanco se rechaza con `PDF_VISUAL_CONTENT_MISSING`.
- Desde 7.16K, la validacion visual inspecciona streams `/FlateDecode` e
  imagenes XObject antes de marcar PDF como listo. Solo un PDF visualmente
  confirmado puede generar `human_pdf_path` y copiarse al layout por cliente.
- Placeholders como `CFDI XML` o `CFDI PDF` se rechazan.
- Si falla validacion, se guarda solo diagnostico seguro bajo `runtime/`; no se
  escribe artefacto final ni se copia al layout por cliente.

## Action Layer

Accion allowlisted:

```text
sandbox.draft.download-artifacts
```

Responsabilidades:

- cargar borrador vigente por `draft_id`;
- validar `invoice_status=SANDBOX_TIMBRADO`;
- validar identidad sandbox (`cfdi_uid`, `pac_invoice_id` o `uuid`);
- descargar XML/PDF a `runtime/`;
- crear manifests locales;
- actualizar resumen tecnico `sandbox_pac_summary`;
- conservar `cfdi_drafts.status=APROBADO`;
- conservar `payment_status`, por ejemplo `PENDIENTE`.

Ejemplo local:

```powershell
node scripts/run-sandbox-action.js sandbox.draft.download-artifacts --draft-id DRAFT-...
```

## Storage

Primero se guarda dentro del bundle de stamp:

```text
runtime/storage-sandbox/draft-stamps/<draft_id>/<timestamp>/
  downloads/xml/cfdi.xml
  downloads/xml/manifest.json
  downloads/pdf/cfdi.pdf
  downloads/pdf/manifest.json
  sandbox-download-manifest.json
```

Tambien se crea layout por cliente/factura:

```text
runtime/storage-sandbox/emitters/<emitter_id>/<yyyy>/<mm>/clients/<client_id>/invoices/<invoice_identity>/
  manifest.json
  canonical-summary.json
  xml/cfdi.xml
  pdf/cfdi.pdf
  exports/<cliente_safe>_<yyyy-MM-dd>_<serie>-<folio>_SANDBOX.xml
  exports/<cliente_safe>_<yyyy-MM-dd>_<serie>-<folio>_SANDBOX.pdf
```

`invoice_identity` usa una identidad tecnica local segura para path. Los archivos
en `runtime/` no se versionan.

Los nombres internos `cfdi.xml` y `cfdi.pdf` se conservan para el sistema. Los
aliases humanos bajo `exports/` se crean solo si el artefacto correspondiente es
valido y no incluyen RFC, UUID ni UID completos.

## Telegram

Telegram muestra solo resumen seguro:

```text
Descarga sandbox completada
Borrador: DRAFT-...
Cliente: ...
Estado factura: SANDBOX_TIMBRADO
Estado pago: PENDIENTE
Proveedor: Factura.com Sandbox
XML descargado: si/no
PDF descargado: si/no
XML valido: si/no
PDF valido: si/no
Storage local: actualizado/no actualizado
No se envian documentos por Telegram.
Borrador sujeto a revision humana. No sustituye contador.
```

Telegram no envia ni imprime:

- XML/PDF/ZIP/Excel/JSON/CSV;
- rutas absolutas;
- UUID/UID/RFC completos;
- credenciales, `.env` o CSD.

7.16J prepara un `Telegram Document Channel` separado del chat operativo. Sigue
deshabilitado por default y solo puede enviar documentos validados a un chat o
grupo privado configurado explicitamente.

## Entrega documental

7.16J agrega el contrato canonico neutral de entrega documental:

```text
docs/DOCUMENT_DELIVERY_CANONICAL_CONTRACT.md
```

Canales:

- `PROVIDER_EMAIL`: canal principal hacia cliente usando el proveedor fiscal.
- `TELEGRAM_DOCUMENT_CHANNEL`: canal interno/privado.
- `SMTP_FUTURE_OPTIONAL`: documentado, no implementado como flujo principal.

Provider Email para Factura.com Sandbox usa:

```text
GET /v4/cfdi40/{cfdi_uid}/email
```

solo en sandbox live y con documentos locales validados.

## Base de datos

La migracion aditiva `sql/008_sandbox_pac_summary.sql` agrega:

```sql
sandbox_pac_summary jsonb NOT NULL DEFAULT '{}'::jsonb
```

No modifica destructivamente `cfdi_drafts.status`, `invoice_status` ni
`payment_status`.

## Tests

Pruebas nuevas:

- `scripts/test-factura-com-sandbox-live-download-adapter-contract.js`
- `scripts/test-factura-com-sandbox-download-gating.js`
- `scripts/test-sandbox-draft-download-artifacts-action.js`
- `scripts/test-sandbox-download-storage-client-layout.js`
- `scripts/test-telegram-sandbox-download-summary-security.js`
- `scripts/test-sandbox-download-artifact-semantics.js`
- `scripts/test-sandbox-artifact-content-validator.js`
- `scripts/test-facturacom-download-rejects-placeholder-artifacts.js`
- `scripts/test-sandbox-download-content-validation-action.js`
- `scripts/test-sandbox-download-no-client-storage-for-invalid-content.js`
- `scripts/test-telegram-download-invalid-artifact-message.js`
- `scripts/test-sandbox-pdf-visual-content-validator.js`
- `scripts/test-facturacom-download-rejects-blank-pdf.js`
- `scripts/test-sandbox-download-no-client-storage-for-blank-pdf.js`
- `scripts/test-sandbox-download-human-file-names.js`
- `scripts/test-document-delivery-canonical-contract.js`
- `scripts/test-sandbox-documents-delivery-action.js`
- `scripts/test-sandbox-documents-provider-email-action.js`

## Fuera de alcance

- Produccion.
- `stampProduction`.
- Timbrado fiscal real.
- Envio de documentos por Telegram.
- Reporte mensual fiscal.
- Cambios a `data/concepts.normalized.json`.

## Siguiente fase

`7.17 Monthly Fiscal Sandbox Summary / IVA ISR Estimate`.
