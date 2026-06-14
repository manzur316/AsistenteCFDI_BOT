# Private SatBot Collection Payment Local Boundary

## Scope

Slice 9R 2.4S defines the minimum local collection payment flow.

`Marcar pagada` is a local collection status update. It is not a fiscal SAT payment, not a payment complement, and not a provider/PAC synchronization.

## Local State

The existing schema uses these local fields:

- `cfdi_drafts.payment_status`
- `cfdi_drafts.payment_amount_paid`
- `cfdi_drafts.payment_paid_at`
- `cfdi_drafts.updated_at`
- `provider_invoice_links.payment_status_local`
- `cfdi_payment_status_events`

The existing database enum uses `PAGADO` internally. Telegram UX renders this as `Pagada`.

No new schema is introduced in this slice.

## Provider Boundary

Confirming `MARK_PAYMENT_PAID` must not update:

- `provider_invoice_links.payment_status_provider`
- provider invoice ids, uid, UUID, serie or folio
- XML/PDF artifact state
- document delivery ledger
- SAT, PAC or Factura.com state

It also must not emit a complemento de pago.

The payment record is still linked to the provider/PAC invoice identity by `provider_invoice_link_id`, provider folio/serie, and short safe display ids. That link is for lookup and audit only; it is not a provider payment synchronization.

## Visible Identity

Cobranza uses the same invoice identity contract as Facturas:

1. `serie-folio`
2. `folio`
3. `UUID-xxxxxxxx`
4. `PAC-xxxxxxxx`
5. `FAC-SBX-<short>`
6. `BOR-*` only as origin/fallback context

Provider folio must be the primary identity when available. `DRAFT-*` and `SANDBOX-INV-DRAFT-*` are not normal UX identities.

## Confirmation

`pagar N` resolves the visible invoice from `COLLECTION_INVOICES` list context and opens `COLLECTION_PAYMENT_CONFIRM`.

The token action is `MARK_PAYMENT_PAID` and includes:

- `source_module=COLLECTION`
- `source_capability=LOCAL_PAYMENT_STATUS`
- `screen_id=COLLECTION_PAYMENT_CONFIRM`
- invoice/draft id
- provider invoice link id when available
- display id
- total amount
- current local payment status
- target status `PAGADO`
- `provider_update=false`
- `pac_update=false`

The confirmation copy must say this is local, does not update SAT/PAC/provider, and does not emit a complemento de pago.

## Paid And Cancelled Views

`Cobranza` exposes read-only follow-up views:

- `cfdi_nav:pay_pending` -> clients with open balance.
- `cfdi_nav:pay_paid` -> `COLLECTION_PAID_INVOICES`.
- `cfdi_nav:pay_cancel` -> `COLLECTION_CANCELLED_INVOICES`.

`COLLECTION_PAID_INVOICES` shows invoices with local `PAGADO` status using provider identity when available. It must not expose `Confirmar pagada`, create `MARK_PAYMENT_PAID` tokens, or mutate PAC/provider state.

## Future Work

Partial, overdue and richer payment recording remain for a later collection slice unless already supported safely by existing local helpers. This slice only promotes the minimum explicit paid flow.
