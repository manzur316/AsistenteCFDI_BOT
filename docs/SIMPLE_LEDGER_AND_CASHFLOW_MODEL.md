# Simple Ledger and Cashflow Model

## Objetivo

Este modelo ordena facturas, pagos, cobros y reportes mensuales sin convertir el
producto en un sistema complejo. Debe ser suficiente para responder preguntas
diarias y preparar evidencia para contador.

El usuario debe poder saber:

- Que ya facture.
- Que ya cobre.
- Que esta pendiente de cobro.
- Que esta vencido.
- Que fue cancelado.
- Que esta parcialmente pagado.
- Que estimado mensual tengo.
- Que paquete entregar al contador.

Todo reporte fiscal debe decir:

```text
Borrador sujeto a revisión humana
```

## Vocabulario Permitido

Usar lenguaje simple:

- Facturado.
- Cobrado.
- Pendiente de cobro.
- Vencido.
- Cancelado.
- Parcialmente pagado.
- Estimado mensual.
- Paquete contador.

No convertir la experiencia en contabilidad avanzada. El usuario ve estados y
acciones claras, no estructuras tecnicas innecesarias.

## Estados Minimos

### Invoice Status

Estado del documento o factura dentro del sistema:

- `DRAFT`: borrador interno, aun editable.
- `APPROVED`: aprobado por humano para siguiente paso.
- `SANDBOX_STAMPED`: validado/timbrado en sandbox futuro, sin valor fiscal real.
- `REAL_STAMPED`: timbrado real futuro.
- `CANCELLED`: cancelado o marcado como cancelado.
- `ERROR`: fallo controlado que requiere accion.

Regla: `SANDBOX_STAMPED` no cuenta como factura fiscal real.

### Payment Status

Estado de cobro:

- `UNPAID`: no se ha cobrado.
- `PARTIALLY_PAID`: hay abono parcial.
- `PAID`: pagada completa.
- `OVERDUE`: vencida segun fecha de pago esperada.
- `NOT_COLLECTIBLE`: marcada como no cobrable por decision humana.

Regla: una factura emitida no significa pagada.

### Review Status

Estado de revision:

- `NEEDS_REVIEW`: requiere revision humana.
- `READY_FOR_ACCOUNTANT`: lista para paquete contador.
- `ACCOUNTANT_REVIEWED`: revisada por contador.

Regla: la revision humana no desaparece aunque el bot haya inferido datos.

## Datos Minimos por Factura o Documento

Contrato minimo propuesto:

- `internal_invoice_id`
- `draft_id`
- `client_id`
- `emitter_id`
- `pac_provider`
- `pac_environment`
- `status`
- `payment_status`
- `review_status`
- `subtotal`
- `iva_amount`
- `isr_retention_amount`
- `iva_retention_amount`
- `total`
- `paid_amount`
- `pending_amount`
- `issued_at`
- `due_at`
- `paid_at`
- `cancelled_at`
- `storage_path`
- `xml_path` futuro
- `pdf_path` futuro
- `payload_json_path`
- `requires_human_review`

Campos derivados:

- `pending_amount = total - paid_amount`
- `is_overdue = payment_status = OVERDUE`
- `is_real_fiscal = status = REAL_STAMPED`
- `is_sandbox_only = pac_environment = SANDBOX`

## Reglas Operativas

- Una factura emitida no significa pagada.
- Una factura sandbox no cuenta para reportes fiscales reales.
- Una factura cancelada no debe ocultarse.
- Una factura parcialmente pagada conserva saldo.
- Un pago parcial no cierra la factura.
- El bot puede estimar impuestos, pero no presentar declaracion.
- Todo reporte fiscal dice `Borrador sujeto a revisión humana`.
- Los saldos se calculan desde documentos y eventos de cobro guardados.
- La evidencia debe conservar mensaje original, borrador, payload y estado.
- La produccion PAC queda en fase futura y requiere revision humana.

## Preguntas que Debe Responder

El modelo debe soportar preguntas naturales:

```text
Muestrame pendientes
```

```text
Que me deben
```

```text
Marca Rivera como pagada
```

```text
Cuanto cobre este mes
```

```text
Reporte de junio
```

```text
Paquete contador de junio
```

```text
Que facturas estan vencidas
```

```text
Cuanto tengo pendiente por cobrar
```

Interpretacion esperada:

- Pendientes: documentos `APPROVED`, `REAL_STAMPED` futuro o equivalentes con
  `payment_status` distinto de `PAID` y no cancelados.
- Que me deben: suma de `pending_amount` por cliente.
- Marca pagada: registrar evento de cobro y actualizar `payment_status`.
- Cuanto cobre: sumar cobros del periodo.
- Reporte mensual: resumen de facturacion, cobro, pendientes y canceladas.
- Paquete contador: exportar resumen y evidencia organizada.
- Vencidas: documentos con `due_at` pasado y saldo pendiente.

## Flujo de Cobros

### Cobro completo

Cuando el usuario diga:

```text
Marca Rivera como pagada
```

El bot debe:

1. Buscar facturas pendientes de Rivera.
2. Si hay una sola coincidencia clara, proponer marcarla pagada.
3. Si hay varias, preguntar cual.
4. Registrar `paid_amount = total`.
5. Cambiar `payment_status = PAID`.
6. Guardar evento de cobro.

### Cobro parcial

Cuando el usuario diga:

```text
Rivera pago 500 de la factura de camaras
```

El bot debe:

1. Identificar factura candidata.
2. Registrar abono.
3. Recalcular saldo.
4. Cambiar `payment_status = PARTIALLY_PAID`.
5. Mantener `pending_amount`.

### Vencido

Una factura queda vencida si tiene saldo pendiente y `due_at` ya paso. El bot
puede mostrarla como vencida sin ocultarla de pendientes.

## Reporte Mensual

El reporte mensual debe separar:

- Facturado.
- Cobrado.
- Pendiente de cobro.
- Vencido.
- Cancelado.
- Parcialmente pagado.
- Estimado mensual.

Totales esperados:

- Subtotal.
- IVA trasladado estimado.
- ISR retenido estimado.
- IVA retenido estimado.
- Total.
- Total cobrado.
- Total pendiente.

Debe separar:

- Sandbox.
- Produccion futura.
- Canceladas.
- Pendientes.
- Clientes no validados.
- Documentos con revision pendiente.

## Paquete Contador

El paquete contador debe ser una salida ordenada por periodo. Debe incluir:

- Resumen del mes.
- Lista de facturas.
- Lista de canceladas.
- Lista de pendientes de cobro.
- Lista de cobros registrados.
- Estimados de impuestos.
- Alertas de revision.
- Rutas a payloads y documentos futuros.

No presenta declaraciones. No sustituye contador.

## Storage y Evidencia

Cada documento debe apuntar a evidencia ordenada:

- Draft original.
- Mensaje original.
- Payload JSON.
- Respuesta PAC sandbox futura.
- XML futuro.
- PDF futuro.
- Historial de cobros.
- Eventos de revision.

La organizacion recomendada sigue el roadmap PAC/Storage/Reporting:

```text
storage/<emitter_id>/<client_id>/<yyyy>/<mm>/<status>/
```

## Tablas Futuras Propuestas

Solo propuesta. No crear SQL en esta fase.

### `cfdi_documents`

Representa el documento interno normalizado, independiente del PAC.

Campos conceptuales:

- Identificadores internos.
- Cliente y emisor.
- Estado de documento.
- Estado de cobro.
- Estado de revision.
- Totales.
- Fechas.
- Rutas de storage.
- Proveedor PAC.
- Ambiente PAC.
- Revision humana.

### `cfdi_payment_events`

Representa cobros, abonos, ajustes manuales y cambios de estado de pago.

Campos conceptuales:

- Identificador de evento.
- Documento relacionado.
- Cliente.
- Monto.
- Fecha.
- Metodo descriptivo.
- Nota humana.
- Usuario/origen.

### `cfdi_storage_artifacts`

Representa archivos y payloads asociados al documento.

Campos conceptuales:

- Documento relacionado.
- Tipo de artefacto.
- Ruta local o remota.
- Hash opcional.
- Proveedor.
- Ambiente.
- Fecha de creacion.

### `accountant_packages`

Representa paquetes mensuales para contador.

Campos conceptuales:

- Periodo.
- Emisor.
- Ruta del paquete.
- Totales resumidos.
- Estado de revision.
- Fecha de generacion.
- Notas.

## Criterios de Seguridad

- No mezclar sandbox con produccion en totales fiscales reales.
- No marcar pagado sin evidencia o confirmacion humana cuando haya ambiguedad.
- No ocultar canceladas.
- No borrar saldos parciales.
- No presentar declaraciones.
- No decidir por el contador.
- No guardar credenciales en documentos, reportes ni storage.
- Mantener trazabilidad al mensaje original.

## Fuera de Alcance

Esta fase no implementa:

- SQL nuevo.
- PAC real.
- XML/PDF real.
- Workflows nuevos.
- Cambios al catalogo fiscal.
- Datos reales.
- Credenciales.
