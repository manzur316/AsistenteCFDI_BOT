# Canonical CFDI Contracts

## Principio

El bot no habla Factura.com, Facturama, Facturapi, SW, Finkok ni ningun PAC
futuro. El bot habla contratos canonicos internos.

Cada PAC Adapter traduce:

```text
Canonical CFDI Contract -> formato del PAC
respuesta del PAC -> Canonical PAC Result
```

La logica especifica del PAC no debe filtrarse hacia Telegram, Miniapp, Draft
Engine, Reporting Engine, Storage Engine ni Monthly Declaration Assistant.

Todo documento fiscal sigue siendo:

```text
BORRADOR SUJETO A REVISION HUMANA
```

## CanonicalDraft

Representa un borrador interno antes de timbrado sandbox o futuro timbrado real.

Campos minimos:

- `draft_id`
- `emitter_id`
- `client_id`
- `source_channel`
- `source_message_id`
- `original_text`
- `status`
- `review_status`
- `confirmed_by_human`
- `requires_human_review`
- `created_at`
- `updated_at`
- `fiscal_warnings`
- `blockers`
- `line_items`
- `totals`

Reglas:

- `requires_human_review` debe ser `true`.
- No se crea documento final si hay `blockers`.
- `confirmed_by_human=false` significa que aun no esta listo para enviar a un
  adapter PAC.
- Un draft cancelado localmente no se borra; cambia a `DRAFT_CANCELLED` y queda
  en auditoria.

Ejemplo:

```json
{
  "draft_id": "DRAFT-DEMO-001",
  "emitter_id": "EMITTER-DEMO",
  "client_id": "CLIENT-DEMO",
  "source_channel": "TELEGRAM",
  "source_message_id": "MSG-DEMO-001",
  "original_text": "Servicio tecnico demo",
  "status": "DRAFT",
  "review_status": "NEEDS_REVIEW",
  "confirmed_by_human": false,
  "requires_human_review": true,
  "created_at": "2026-06-04T00:00:00.000Z",
  "updated_at": "2026-06-04T00:00:00.000Z",
  "fiscal_warnings": [],
  "blockers": [],
  "line_items": [],
  "totals": {}
}
```

## CanonicalReceiver

Representa al receptor fiscal validado o pendiente de validar.

Campos minimos:

- `client_id`
- `display_name`
- `rfc`
- `legal_name`
- `tax_regime`
- `fiscal_zip`
- `person_type`
- `validated_by_human`
- `validation_warnings`

Reglas:

- No guardar clientes reales en el repositorio.
- Si `validated_by_human=false`, el draft debe conservar advertencia.
- El adapter PAC no debe inventar regimen, RFC ni codigo postal.

## CanonicalLineItem

Representa una partida fiscal interna.

Campos minimos:

- `line_id`
- `description`
- `quantity`
- `unit_key`
- `unit_name`
- `product_service_key`
- `unit_price`
- `subtotal`
- `tax_object`
- `taxes`
- `activity_scope`
- `source_confidence`
- `requires_human_review`

Reglas:

- La clave SAT y unidad vienen del catalogo activo auditado.
- `activity_scope` documenta por que la actividad es candidata o por que
  requiere aclaracion.
- `requires_human_review` debe ser `true`.

## CanonicalTaxBreakdown

Resume impuestos por documento o por partida.

Campos minimos:

- `iva_transferred`
- `iva_retained`
- `isr_retained`
- `ieps`
- `total_taxes_transferred`
- `total_taxes_retained`
- `warnings`

Reglas:

- Los calculos son estimados hasta revision humana.
- Las retenciones dependen del receptor, regimen y contexto fiscal.
- Si falta dato del receptor, se debe bloquear confirmacion o pedir aclaracion.

## CanonicalInvoiceDocument

Representa un documento interno ya promovido desde draft.

Campos minimos:

- `internal_invoice_id`
- `draft_id`
- `emitter_id`
- `client_id`
- `pac_provider`
- `pac_environment`
- `pac_invoice_id`
- `uuid`
- `serie`
- `folio`
- `status`
- `payment_status`
- `review_status`
- `subtotal`
- `taxes`
- `total`
- `issued_at`
- `stamped_at`
- `cancelled_at`
- `storage_refs`
- `pac_refs`
- `audit_refs`

Reglas:

- `pac_provider` y `pac_environment` son metadatos, no decisiones de negocio.
- `uuid` puede existir en sandbox o produccion futura; debe indicar ambiente.
- `payment_status` es independiente de cancelacion fiscal.
- Produccion queda bloqueada hasta fase explicita.

## CanonicalPacRequest

Envelope interno para cualquier operacion PAC.

Campos minimos:

- `provider`
- `environment`
- `operation`
- `payload`
- `idempotency_key`
- `requested_at`
- `source_invoice_id`

Reglas:

- `payload` puede ser formato PAC, pero solo dentro del adapter o storage
  tecnico.
- `idempotency_key` evita duplicados por reintentos.
- Nunca guardar credenciales dentro del request.

## CanonicalPacResult

Respuesta normalizada de cualquier PAC.

Campos minimos:

- `ok`
- `provider`
- `environment`
- `operation`
- `status`
- `pac_invoice_id`
- `uuid`
- `serie`
- `folio`
- `xml_available`
- `pdf_available`
- `raw_response_ref`
- `normalized_errors`
- `normalized_warnings`
- `requires_human_review`

Reglas:

- Si `ok=false`, `normalized_errors` debe contener al menos un error.
- `raw_response_ref` apunta a un artifact, no expone la respuesta cruda a UI.
- El resultado PAC no debe cambiar reglas fiscales por si solo.

## CanonicalStorageArtifact

Representa un archivo o payload guardado por Storage Engine.

Campos minimos:

- `artifact_id`
- `internal_invoice_id`
- `draft_id`
- `artifact_type`: `PAYLOAD_JSON`, `PAC_RESPONSE_JSON`, `XML`, `PDF`,
  `MANIFEST`, `REPORT`
- `environment`
- `storage_path`
- `checksum`
- `created_at`
- `contains_sensitive_data`

Reglas:

- No versionar artifacts sensibles.
- XML/PDF futuros se organizan por Storage Engine, no por Telegram.
- `contains_sensitive_data=true` requiere cuidado de backups y permisos.

## CanonicalPaymentStatus

Estados simples:

- `UNPAID`
- `PARTIALLY_PAID`
- `PAID`
- `OVERDUE`
- `NOT_COLLECTIBLE`

No modela contabilidad completa. Solo ayuda a saber cobrado, pendiente o vencido.

## CanonicalPaymentEvent

Evento simple de pago o cobro.

Campos minimos:

- `payment_event_id`
- `internal_invoice_id`
- `amount`
- `paid_at`
- `method`
- `note`
- `evidence_ref`
- `created_at`
- `created_by`

Reglas:

- No reemplaza conciliacion bancaria.
- Puede alimentar reportes mensuales.
- No debe incluir comprobantes sensibles en git.

## CanonicalAuditEvent

Evento de auditoria para todo cambio relevante.

Campos minimos:

- `event_id`
- `entity_type`
- `entity_id`
- `event_type`
- `previous_status`
- `new_status`
- `reason`
- `actor`
- `created_at`
- `metadata`

Reglas:

- Nunca borrar historial fiscal.
- Cancelaciones, errores PAC, cambios de cliente, cambios de monto y
  confirmaciones humanas deben generar audit trail.
- La auditoria es interna; no se manda completa a Telegram salvo resumen seguro.

## Estados Y Constantes

La implementacion base vive en:

```text
scripts/lib/canonical-cfdi-contracts.js
```

Exporta:

- `INVOICE_STATUSES`
- `PAYMENT_STATUSES`
- `REVIEW_STATUSES`
- `CANCELLATION_STATUSES`
- `PAC_ENVIRONMENTS`
- `ARTIFACT_TYPES`
- `validateCanonicalDraft`
- `validateCanonicalInvoiceDocument`
- `validateCanonicalPacResult`
- `validateCancellationTransition`

Estos validadores son intencionalmente simples. Su proposito es proteger el
contrato y hacer visibles errores de integracion antes de conectar adapters PAC
reales.
