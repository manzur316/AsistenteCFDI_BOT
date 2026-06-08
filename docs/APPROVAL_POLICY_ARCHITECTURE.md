# Approval Policy Architecture

## Principio

La aprobacion debe ser configurable por tenant/emisor sin volver complejo el bot.
El usuario diario ve acciones simples; la politica vive en configuracion/panel.

## Modos

```text
SELF_APPROVAL
DELEGATED_ACCOUNTANT
CLIENT_APPROVAL_REQUIRED
```

## Override por factura

```text
SEND_TO_CLIENT_APPROVAL
```

Permite enviar un borrador especifico a aprobacion del cliente aunque el contador
tenga autoridad delegada.

Reservado para futuro:

```text
FORCE_DUAL_APPROVAL
```

## Link de aprobacion futuro

El link es un canal de revision puntual, no un panel completo.

Reglas:

- El cliente no entra al bot.
- El cliente no instala Telegram.
- El link solo muestra resumen.
- El link no muestra credenciales.
- El link no permite navegar otras facturas.
- El link no descarga XML/PDF.
- El link es temporal.
- El link es revocable.
- El link es de un solo uso para aprobar.
- La aprobacion queda ligada a una snapshot exacta.

## Snapshot congelada

El cliente no aprueba el draft vivo. Aprueba:

```text
approval_snapshot
- draft_id
- snapshot_hash
- subtotal
- iva
- total
- receptor
- concepto
- metodo_pago
- forma_pago
- uso_cfdi
- timestamp
```

Si cambia cualquier dato critico, se requiere nueva aprobacion.

Datos criticos:

- receptor;
- conceptos;
- claves SAT;
- subtotal;
- impuestos;
- total;
- metodo/forma de pago;
- uso CFDI;
- moneda;
- lugar de expedicion.

## Regeneracion y revocacion

Si el cliente pierde el link, el contador puede reenviar/regenerar desde el
borrador.

Casos:

- Si el borrador no cambio: reenviar o regenerar link.
- Si el borrador cambio: revocar link anterior y crear nueva snapshot.
- Si ya fue aprobado: no regenerar para aprobar; solo consultar evidencia.
- Si fue rechazado: corregir borrador y crear nueva solicitud.
- Si expiro: generar nuevo link si el borrador sigue igual.

Regla anti multiples links:

```text
Solo debe existir un approval token activo por approval_request.
Al generar uno nuevo, el anterior se revoca.
```

## Eventos auditables

La auditoria existe, pero no satura Telegram. Se consulta bajo historial o panel.

Eventos:

- `draft_created`
- `draft_updated`
- `approval_requested`
- `approval_link_generated`
- `approval_link_revoked`
- `approval_approved`
- `approval_rejected`
- `approval_correction_requested`
- `invoice_stamped`
- `invoice_cancel_requested`
- `invoice_cancelled`

## Seguridad

- No RFC completo en URLs.
- No UUID/UID en callback publico.
- No credenciales.
- No XML/PDF por link en esta fase.
- No rutas internas.
- Tokens temporales, revocables y de un solo uso para aprobar.

## Estado actual

Documento foundation. No implementa aprobacion por link real ni cambios de
workflow.
