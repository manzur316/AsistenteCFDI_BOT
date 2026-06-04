# Cancellation Lifecycle

## Principio

Cancelar no significa borrar.

Todo draft, sandbox stamp, futuro CFDI real, error PAC y decision humana debe
quedar en audit trail. Un registro cancelado aparece en reportes, paquete para
contador e historial, pero no cuenta como ingreso activo.

## Estados

- `DRAFT_CANCELLED`
- `SANDBOX_CANCEL_REQUESTED`
- `SANDBOX_CANCELLED`
- `PRODUCTION_CANCEL_REQUESTED`
- `PRODUCTION_CANCELLED`
- `CANCEL_FAILED`
- `CANCEL_REVIEW_REQUIRED`

## Regla Por Tipo De Documento

### Draft no timbrado

Si solo existe como draft local:

1. Validar que no tenga `pac_invoice_id` ni `uuid`.
2. Cambiar estado a `DRAFT_CANCELLED`.
3. Registrar `CanonicalAuditEvent`.
4. No borrar line items, texto original ni calculos.

No se llama PAC.

### Sandbox stamped

Si ya fue timbrado o generado en sandbox:

1. Cambiar estado interno a `SANDBOX_CANCEL_REQUESTED`.
2. Llamar al adapter sandbox correspondiente.
3. Si PAC sandbox responde `ok=true`, marcar `SANDBOX_CANCELLED`.
4. Si PAC sandbox falla, marcar `CANCEL_FAILED`.
5. Guardar `CanonicalPacResult`, artifact de respuesta y audit trail.

No se simula cancelacion si PAC falla.

### Production stamped futuro

Si en una fase futura existe timbrado real:

1. Cambiar estado interno a `PRODUCTION_CANCEL_REQUESTED`.
2. Cancelar primero en PAC/SAT/PAC produccion.
3. Solo si PAC/SAT confirma, marcar `PRODUCTION_CANCELLED`.
4. Si falla, marcar `CANCEL_FAILED` o `CANCEL_REVIEW_REQUIRED`.
5. Guardar audit trail completo.

Produccion queda bloqueada hasta una fase explicita. Esta fase solo define el
contrato.

## Fallos Y Revision

Si PAC falla:

- Estado: `CANCEL_FAILED`.
- No cambiar a cancelado.
- Guardar error normalizado.
- Mostrar causa segura al usuario.
- Mantener pendiente para revision humana.

Si PAC pide motivo:

- Estado: `CANCEL_REVIEW_REQUIRED`.
- Pedir el dato minimo.
- No inventar motivo.

Si hay error fiscal:

- Bloquear automatizacion.
- Marcar revision humana.
- No simular cancelacion.

## Motivos Minimos

- `error_cliente`
- `error_monto`
- `error_concepto`
- `error_metodo_pago`
- `duplicada`
- `operacion_no_realizada`
- `otro`

## Reporting

Un documento cancelado:

- Aparece en reportes.
- Aparece en paquete contador.
- No cuenta como ingreso activo.
- Conserva subtotal, impuestos, total y relacion con draft.
- Conserva artifacts y audit refs.

## Transiciones Basicas

```text
DRAFT -> DRAFT_CANCELLED

SANDBOX_STAMPED -> SANDBOX_CANCEL_REQUESTED
SANDBOX_CANCEL_REQUESTED -> SANDBOX_CANCELLED
SANDBOX_CANCEL_REQUESTED -> CANCEL_FAILED
SANDBOX_CANCEL_REQUESTED -> CANCEL_REVIEW_REQUIRED

PRODUCTION_STAMPED -> PRODUCTION_CANCEL_REQUESTED (futuro bloqueado)
PRODUCTION_CANCEL_REQUESTED -> PRODUCTION_CANCELLED (futuro bloqueado)
PRODUCTION_CANCEL_REQUESTED -> CANCEL_FAILED
PRODUCTION_CANCEL_REQUESTED -> CANCEL_REVIEW_REQUIRED
```

Reglas de integridad:

- `SANDBOX_CANCELLED` requiere solicitud previa.
- `PRODUCTION_CANCELLED` requiere solicitud previa y confirmacion PAC/SAT futura.
- Cualquier cancelacion requiere audit trail.
- Ninguna transicion debe requerir borrar registros.
