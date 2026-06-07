# Fiscal Activity Rules Architecture

## Proposito

Fiscal Activity Rules conecta el Tenant Fiscal Profile con los conceptos CFDI
sugeribles. No sustituye contador y no activa conceptos nuevos por si sola.

Regla central:

```text
Tenant Fiscal Profile + Fiscal Activity Rules + catalogo activo -> sugerencia con revision humana.
```

## Modelo conceptual

### FiscalActivity

Representa una actividad fiscal declarada o autorizada para un tenant.

Campos esperados:

- `activity_id`
- `tenant_id`
- `activity_code`
- `activity_name`
- `source`
- `status`
- `regimen_fiscal`
- `human_review_required`

### ConceptRule

Regla versionada que conecta una actividad con familias, operaciones y conceptos
candidatos.

Campos esperados:

- `rule_id`
- `activity_id`
- `allowed_operations`
- `allowed_families`
- `suggested_concept_prefixes`
- `blocked_terms`
- `requires_clarification_terms`
- `risk_level`
- `version`

### TenantActivityLink

Vincula un tenant con actividades fiscales vigentes.

Campos esperados:

- `tenant_id`
- `activity_id`
- `status`
- `source`
- `reviewed_by_human`
- `reviewed_at`

### ConceptEligibility

Resultado evaluable por SATBOT Core antes de sugerir o bloquear.

Estados sugeridos:

- `ELIGIBLE`
- `NEEDS_CLARIFICATION`
- `BLOCKED`
- `ACTIVITY_REVIEW_REQUIRED`

## Ejemplo operativo

Actividad: servicios de instalacion/mantenimiento CCTV.

Conceptos permitidos o sugeridos:

- diagnostico tecnico;
- instalacion de camaras;
- mantenimiento preventivo;
- configuracion de red;
- cableado estructurado.

Bloqueos:

- software;
- apps;
- IA como servicio;
- marketing;
- renta de equipo;
- obra civil general.

## Reglas de seguridad fiscal

- Todo concepto es sugerencia con revision humana.
- El tenant debe configurar sus actividades fiscales antes de operar.
- Las reglas pueden variar por regimen, actividad y tenant.
- Las reglas deben versionarse.
- El catalogo activo del bot sigue siendo fuente operativa de conceptos.
- `data/concepts.normalized.json` no se modifica en esta fase.

## Relacion con multi-provider

Fiscal Activity Rules vive en SATBOT Core. No depende de `factura_com` ni de
`facturapi`. Los Provider Adapter solo reciben documentos canonicos ya
validados por Tenant Fiscal Profile y reglas fiscales.
