# Provider Email Delivery Architecture

## Objetivo

Preparar envio de documentos CFDI sandbox por email usando el proveedor fiscal,
no SMTP propio. Esto evita que SATBOT maneje plantillas, reputacion, rebotes o
credenciales SMTP del cliente.

## Canal Principal

Canal canonico:

```text
PROVIDER_EMAIL
```

Adapter inicial:

```text
FacturaComSandboxAdapter.sendInvoiceEmail(invoiceRef, context)
```

Endpoint sandbox Factura.com:

```text
GET /v4/cfdi40/{cfdi_uid}/email
```

## Gating

Provider email solo puede ejecutarse si:

- ambiente es sandbox;
- `FACTURACOM_SANDBOX_MODE=live`;
- `FACTURACOM_SANDBOX_LIVE=1`;
- base URL apunta a sandbox;
- existe `cfdi_uid`, `pac_invoice_id` o `uuid`;
- XML/PDF locales existen y estan validados;
- si el PDF final es local fallback (`pdf_source=LOCAL_RENDERED_FROM_XML`), el
  provider PDF debe estar validado o la entrega se bloquea por default;
- cliente tiene email principal;
- email confirmado o accion explicita `--confirm-recipient`;
- no hay produccion fiscal real.

## Email Principal Del Cliente

Migracion:

```text
sql/015_client_primary_email_foundation.sql
```

Campos:

- `email`
- `email_confirmed`
- `provider_email_sync_status`
- `provider_email_sync_summary`

No se agregan `email2`, `email3`, `billing_email` ni otro canal paralelo en esta
fase. Si hay email local, el mapper de cliente Factura.com lo envia como email
principal del receptor.

## Provider PDF Invalid 7.16L

Cuando SATBOT genera un PDF local desde XML validado, Provider Email Delivery no
lo puede adjuntar mediante Factura.com. Por eso el estado seguro es:

```text
PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID
```

Esta politica evita que Factura.com envie un PDF provider blanco/no validado
mientras SATBOT solo tiene un PDF local fallback.

## Acciones

```text
sandbox.documents.provider-email.diagnose
sandbox.documents.provider-email.send
sandbox.provider.client.email.diagnose
sandbox.documents.delivery.send --channel PROVIDER_EMAIL
sandbox.documents.delivery.prepare --channel PROVIDER_EMAIL
sandbox.documents.delivery.confirm --channel PROVIDER_EMAIL
sandbox.documents.delivery.status
sandbox.documents.delivery.ledger
```

Dry-run valida documentos, recipient y soporte del proveedor sin llamar al
endpoint de envio.

Desde 7.17, el envio real desde Telegram debe pasar por `prepare` y una
confirmacion humana antes de ejecutar `send --send-real --confirmed`. Cada
intento se registra en `document_delivery_ledger` con destinatario redactado,
hashes/tamanos de XML/PDF y estado normalizado. Si ya existe un `SENT` para el
mismo draft, canal, destino y hashes, el reenvio queda bloqueado salvo
confirmacion explicita (`--force` en CLI o boton de reenvio controlado).

El diagnostico generico por canal debe respetar el canal solicitado:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.delivery.diagnose --db-exec-mode docker --draft-id DRAFT-... --channel PROVIDER_EMAIL
```

Ese comando diagnostica Provider Email Delivery, no Telegram. Evalua soporte del
proveedor, draft timbrado, identidad CFDI, email principal, confirmacion del
email, estado de sync con proveedor y validez local de XML/PDF.

Para revisar solo el email principal del cliente:

```powershell
node scripts/run-sandbox-action.js sandbox.provider.client.email.diagnose --db-exec-mode docker --client-id CLI-...
```

La salida redacta el email y reporta `SYNCED`, `NEEDS_SYNC` o `UNKNOWN`. El sync
de cliente usa un solo campo `cfdi_clients.email`; no se agregan `email2` ni
`email3`.

## Politica PDF

Provider Email Delivery permanece bloqueado si el PDF local no tiene contenido
visual validado. Aunque el proveedor tenga endpoint de email, SATBOT no pide al
proveedor enviar documentos cuando `pdf_content_valid=false` o
`pdf_visual_content_present!==true`. Si en el futuro se permite un envio por
proveedor sin PDF local valido, debe existir una politica explicita y apagada
por default.

## No SMTP

SMTP queda descartado como flujo principal. El contrato lo conserva como
`SMTP_FUTURE_OPTIONAL`, pero la validacion devuelve `SMTP_NOT_IMPLEMENTED`.

## Seguridad

No se imprime email completo, token, API key, secret, plugin, RFC completo,
UUID completo, UID completo, XML/PDF, rutas absolutas, CSD ni `.env`.

Todo sigue siendo sandbox. No habilita produccion, PAC productivo ni timbrado
fiscal real.
