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

## Acciones

```text
sandbox.documents.provider-email.diagnose
sandbox.documents.provider-email.send
sandbox.documents.delivery.send --channel PROVIDER_EMAIL
```

Dry-run valida documentos, recipient y soporte del proveedor sin llamar al
endpoint de envio.

## No SMTP

SMTP queda descartado como flujo principal. El contrato lo conserva como
`SMTP_FUTURE_OPTIONAL`, pero la validacion devuelve `SMTP_NOT_IMPLEMENTED`.

## Seguridad

No se imprime email completo, token, API key, secret, plugin, RFC completo,
UUID completo, UID completo, XML/PDF, rutas absolutas, CSD ni `.env`.

Todo sigue siendo sandbox. No habilita produccion, PAC productivo ni timbrado
fiscal real.
