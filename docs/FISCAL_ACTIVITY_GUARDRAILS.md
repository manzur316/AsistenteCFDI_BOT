# Fiscal Activity Guardrails

This project is a personal RESICO CFDI draft assistant. It only prepares draft suggestions for manual review. It does not stamp CFDI, does not call a PAC, does not create PDFs, and does not send WhatsApp.

## Emitter Regime

```json
{
  "emitter_regimen": "626",
  "emitter_regimen_name": "Regimen Simplificado de Confianza",
  "requires_human_review": true
}
```

## Authorized Economic Activities

1. Otras instalaciones y equipamiento en construcciones - 30%.
2. Reparacion y mantenimiento de maquinaria y equipo comercial y de servicios - 25%.
3. Reparacion y mantenimiento de otro equipo electronico y de equipo de precision - 15%.
4. Comercio al por menor de telefonos, de otros aparatos de comunicacion, refacciones y accesorios - 15%.
5. Comercio al por menor de computadoras y sus accesorios - 15%.

Obligations documented for the guardrail matrix:

- Pago provisional mensual de ISR RESICO.
- Pago definitivo mensual de IVA RESICO.
- Ajuste anual de ISR RESICO.

## Allowed Family Matrix

| family | mapped_activity_ids | allowed_operations | allowed_scope |
| --- | --- | --- | --- |
| CCTV | 1, 2, 3, 4 | SERVICIO, SERVICIO_INSTALACION, PRODUCTO | Instalacion de camaras, DVR/NVR, cableado para videovigilancia, configuracion basica, mantenimiento, diagnostico, fuentes, conectores, discos, refacciones y accesorios. |
| CONTROL_ACCESO | 1, 2, 3, 4 | SERVICIO, SERVICIO_INSTALACION, PRODUCTO | Instalacion y mantenimiento de chapas, electroiman, panel, lector, biometrico, boton, fuente, tarjetas y accesorios. |
| BARRERA | 1, 2, 3, 4 | SERVICIO, SERVICIO_INSTALACION, PRODUCTO | Revision, diagnostico, mantenimiento, ajuste, sensores, motor, tarjeta, brazo, botonera, accesorios y refacciones de barrera vehicular. |
| RED | 1, 3, 4 | SERVICIO, SERVICIO_INSTALACION, PRODUCTO | Instalacion/configuracion de router, switch, access point, WiFi, cableado estructurado basico relacionado con equipamiento, diagnostico de red local y venta de accesorios de comunicacion. |
| COMPUTO | 2, 3, 5 | SERVICIO, PRODUCTO | Venta de computadoras, SSD, RAM, fuentes, teclado, mouse, monitor y perifericos; reparacion, mantenimiento, diagnostico fisico y formateo tecnico asociado a equipo de computo. |

All allowed families still require REVISION HUMANA. The bot must use only `data/concepts.normalized.json` for concepts, SAT keys and units.

## Blocked Or Review Activities

| activity | action | reason |
| --- | --- | --- |
| software, app movil, pagina web, SaaS, n8n automation, AI implementation | BLOQUEAR | software_app_web_saas_ia |
| marketing digital, diseno grafico, edicion de video | AGREGAR_ACTIVIDAD | marketing_diseno_video |
| consultoria fiscal, contable or legal | AGREGAR_ACTIVIDAD | consultoria_profesional_no_autorizada |
| venta de comida | AGREGAR_ACTIVIDAD | venta_comida |
| construccion civil general, plomeria, albanileria, pintura | AGREGAR_ACTIVIDAD | oficio_construccion_general |
| servicios electricos generales not tied to CCTV, access, network or computing equipment | PEDIR_ACLARACION | actividad_general_no_ligada_a_equipo |
| renta de equipo | AGREGAR_ACTIVIDAD | renta_no_autorizada |

Expected wording for blocked or review paths:

```text
Esto no concuerda claramente con tus actividades actuales o requiere agregar/validar actividad fiscal antes de facturar. No queda listo para timbrar.
REVISION HUMANA requerida antes de usar cualquier dato.
```

## Hard Stop Rules

Never create a confirmed draft when any of these are present:

- `actividad_actual_ok=false`.
- `resico_626_ok=false`.
- `accion_n8n=BLOQUEAR`.
- `accion_n8n=AGREGAR_ACTIVIDAD`.
- `riesgo_fiscal=ALTO`.
- Family not mapped to the allowed family matrix.
- Concept without SAT key or unit.
- Concept without unit/key.
- Active blockers such as `linea_ambigua`, `concepto_incompleto`, `material_labor_decision`, `global_amount_decision` or `concept_catalog_gap`.
- Any output without REVISION HUMANA language.

## Material And Labor

When a single amount includes material and labor, the bot must ask before classifying:

1. Separar material y mano de obra.
2. Tratar como servicio integral.
3. Tratar como venta de producto con instalacion incluida.
4. Cancelar.

The state is `NEEDS_MATERIAL_LABOR_DECISION`. No draft is created until the user resolves the decision and later confirms the preview. The preview keeps REVISION HUMANA wording.

## Global Amount For Several Activities

When several activities share one amount, the bot must ask:

```text
Detecte varias actividades con un solo monto. Quieres dividirlo por linea o usarlo como servicio integral?
```

The state is `NEEDS_GLOBAL_AMOUNT_DECISION`. The bot must not split the amount automatically. The preview keeps REVISION HUMANA wording.

## Tax Review

Every fiscal result sets `tax_review_required=true` or `requires_human_review=true`. Any calculation is conservative and remains:

```text
BORRADOR SUJETO A REVISION HUMANA.
```
