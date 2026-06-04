# Business Scenario Matrix

This matrix defines the business coverage for the local CFDI bot. It is intentionally demo-only and must not contain real clients, tokens, constancias, PDFs or production fiscal documents.

## Demo Clients

| client_id | type | tax_profile | expected_tax_behavior |
| --- | --- | --- | --- |
| CLI-DEMO-PF | FISICA | PF_GENERAL | IVA trasladado when applicable; ISR retenido 0; IVA retenido 0. |
| CLI-DEMO-PM | MORAL | PM_GENERAL | Service/installation applies ISR 1.25% and conservative IVA retention; product has no service IVA retention. |
| CLI-DEMO-NO-LUCRO | MORAL_SIN_FINES_LUCRO | PM_NO_LUCRATIVA | Treated conservatively like persona moral. |
| CLI-DEMO-DESCONOCIDO | DESCONOCIDO | DESCONOCIDO | No definitive retention calculation; human review required. |

## Scenario Suite

| id | scenario | expected_route |
| --- | --- | --- |
| 1 | CCTV instalacion simple | allowed SERVICIO_INSTALACION |
| 2 | CCTV mantenimiento | allowed SERVICIO |
| 3 | CCTV venta de producto | allowed PRODUCTO |
| 4 | CCTV instalacion + venta | multiline service/product |
| 5 | Control de acceso instalacion | allowed SERVICIO_INSTALACION |
| 6 | Control de acceso mantenimiento | allowed SERVICIO |
| 7 | Barrera vehicular mantenimiento | allowed SERVICIO |
| 8 | Barrera vehicular refaccion/producto | allowed PRODUCTO |
| 9 | Red WiFi configuracion | allowed SERVICIO |
| 10 | Red venta AP/switch/router | allowed PRODUCTO |
| 11 | Computo venta SSD/RAM/computadora | allowed PRODUCTO |
| 12 | Computo mantenimiento/formateo tecnico | allowed SERVICIO |
| 13 | Factura de 7 lineas mezcladas | multiline preview, no draft until confirm |
| 14 | Material incluido + mano de obra | NEEDS_MATERIAL_LABOR_DECISION |
| 15 | Monto global para varias actividades | NEEDS_GLOBAL_AMOUNT_DECISION |
| 16 | Desarrollo app movil | BLOQUEAR |
| 17 | Pagina web | BLOQUEAR |
| 18 | SaaS | BLOQUEAR |
| 19 | Automatizacion n8n vendida como servicio | BLOQUEAR |
| 20 | Marketing/diseno | AGREGAR_ACTIVIDAD |
| 21 | Servicio electrico general | PEDIR_ACLARACION |
| 22 | Construccion general no ligada a equipamiento | AGREGAR_ACTIVIDAD or review |
| 23 | Cliente PF service | no retentions |
| 24 | Cliente PM service | ISR 1.25 and IVA retention |
| 25 | Cliente PM product | no service IVA retention |
| 26 | Cliente PM no lucro service | ISR 1.25 and IVA retention |
| 27 | Cliente desconocido | no definitive retentions |
| 28 | Concept without unit/key | blocks confirmation |
| 29 | Confirm with blockers | no draft |
| 30 | Confirm without blockers | creates draft and line items |

## Long Invoice Policy

The bot must support at least 10 line items. For more than 10 line items it should not fail; it may show a compact preview and keep the full context for `/ver`.

## Fiscal Limits

- No PAC.
- No timbrado.
- No WhatsApp.
- No PDF generation.
- No real clients in repository fixtures.
- No modification to `data/concepts.normalized.json` or the Excel source.
