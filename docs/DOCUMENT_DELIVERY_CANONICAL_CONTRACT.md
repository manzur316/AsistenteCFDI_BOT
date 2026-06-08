# Document Delivery Canonical Contract

## Objetivo

La entrega documental debe ser neutral al PAC. SATBOT no debe acoplarse a
Factura.com para decidir si un XML/PDF puede entregarse al cliente o a un canal
interno.

Modulo:

```text
scripts/lib/document-delivery/canonical-document-delivery-contract.js
```

## Canales

```text
PROVIDER_EMAIL
TELEGRAM_DOCUMENT_CHANNEL
SMTP_FUTURE_OPTIONAL
```

Decisiones de esta fase:

- `PROVIDER_EMAIL` es el canal principal hacia cliente.
- `TELEGRAM_DOCUMENT_CHANNEL` es canal interno privado, deshabilitado por
  default.
- `SMTP_FUTURE_OPTIONAL` existe solo como contrato futuro y valida como
  `SMTP_NOT_IMPLEMENTED`.

## Estados

```text
READY
SENT
DRY_RUN
BLOCKED_DUPLICATE
NEEDS_CONFIG
NEEDS_DOCUMENTS
NEEDS_RECIPIENT
BLOCKED_INVALID_DOCUMENTS
BLOCKED_PROVIDER_PDF_INVALID
PROVIDER_ERROR
TELEGRAM_ERROR
ERROR
```

## Request Canonico

El request incluye:

- proveedor y ambiente;
- `draft_id`, `client_id`, `invoice_ref`;
- canal;
- recipient con email redaccionado;
- documentos con rutas relativas seguras, `sha256`, tamano y banderas de
  validez;
- politica de delivery.

Defaults de seguridad:

- `allow_production=false`
- `require_valid_documents=true`
- `allow_sandbox=true`

## Result Canonico

El resultado incluye:

- `ok`
- proveedor y ambiente
- canal
- estado
- recipient presente/redaccionado
- `documents_valid`
- mensaje proveedor normalizado
- evidencia minima
- errores y warnings normalizados

## Guardrails

El contrato no debe exponer:

- token Telegram;
- chat_id completo;
- email completo en salida publica;
- RFC completo;
- UUID/UID completos;
- rutas absolutas;
- XML/PDF/ZIP/Excel;
- CSD, `.env` o credenciales PAC.

La entrega se bloquea si los documentos no estan validados. En esta fase no hay
envio automatico: toda entrega requiere accion/configuracion explicita.

## Diagnostico Por Canal

`sandbox.documents.delivery.diagnose --channel PROVIDER_EMAIL` debe evaluar el
canal de email del proveedor: soporte, recipient, estado de sync de email y
validez XML/PDF. No debe caer al diagnostico de Telegram.

`sandbox.documents.delivery.diagnose --channel TELEGRAM_DOCUMENT_CHANNEL` evalua
solo configuracion y archivos para el canal privado Telegram.

Canales desconocidos deben devolver error estable
`DOCUMENT_DELIVERY_CHANNEL_UNKNOWN`.

## Regla PDF 7.16K

Un PDF estructuralmente valido no es suficiente para delivery. Debe cumplir:

```text
pdf_content_valid=true
pdf_visual_content_present=true
```

Si el PDF esta pendiente de generacion puede reportarse
`PDF_NOT_READY_RETRYABLE`; si esta blanco o no confirmado queda bloqueado como
`BLOCKED_INVALID_DOCUMENTS`.

## `pdf_source` 7.16L

La entrega documental distingue la fuente del PDF:

- `PROVIDER`: PDF descargado del proveedor y validado localmente.
- `LOCAL_RENDERED_FROM_XML`: PDF sandbox generado por SATBOT desde XML raw
  validado porque el provider PDF no fue usable.

Provider Email Delivery queda bloqueado por default cuando
`pdf_source=LOCAL_RENDERED_FROM_XML` y `provider_pdf_content_valid=false`,
porque Factura.com enviaria sus propios documentos y SATBOT no puede garantizar
que el PDF adjunto por el proveedor sea visible.

Telegram Document Channel puede usar el PDF local validado si el canal interno
esta habilitado y los archivos pasan validacion.

## Delivery Ledger 7.17

La fase 7.17 agrega un ledger local sandbox para registrar intentos de entrega
documental sin guardar documentos ni destinatarios completos:

```text
sql/016_document_delivery_ledger.sql
scripts/lib/document-delivery/document-delivery-ledger-store.js
```

Acciones allowlisted:

```text
sandbox.documents.delivery.status
sandbox.documents.delivery.prepare
sandbox.documents.delivery.confirm
sandbox.documents.delivery.send
sandbox.documents.delivery.ledger
```

La llave canonica de idempotencia usa ambiente, draft, canal, destino
redactado/hasheado y hashes XML/PDF. Si ya existe una entrega `SENT` para la
misma combinacion, el reenvio se bloquea por default y requiere `--force` o una
confirmacion humana explicita desde Telegram.

7.17B fija que la llave canonica no incluye status, action, timestamp ni
aleatoriedad. `READY` y `DRY_RUN` quedan como evidencia preparatoria y no
bloquean el envio real posterior; solo `SENT` activa bloqueo de duplicado.

Telegram debe crear tokens `DELIVERY_CONFIRM_*` persistidos despues de
`prepare`. Los botones de confirmacion usan `cfdi:<token>` reales y consumen el
token una sola vez antes de ejecutar `sandbox.documents.delivery.send
--send-real --confirmed`.

El ledger solo conserva evidencia sanitizada: hashes, tamanos, paths relativos
bajo `runtime/`, estado, errores normalizados y destinatario redactado. No debe
guardar token, email completo, chat_id completo, RFC, UUID/UID completos,
XML/PDF, CSD, `.env` ni credenciales PAC.
