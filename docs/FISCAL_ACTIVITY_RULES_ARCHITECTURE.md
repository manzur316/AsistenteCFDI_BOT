# Fiscal Activity Rules Architecture

## Principio

Fiscal Activity Rules conecta el perfil fiscal de cada tenant con familias de
conceptos sugeribles. No activa conceptos nuevos por si sola. No sustituye contador
y no modifica `data/concepts.normalized.json`.

```text
Tenant Fiscal Profile
  -> actividades fiscales configuradas
  -> reglas por actividad
  -> elegibilidad de concepto
  -> borrador sujeto a revision humana
```

## Entidades

### FiscalActivity

Actividad fiscal/giro configurada por tenant.

- `activity_code`
- `activity_name`
- `activity_source`
- `applies_to_regimen`
- `applies_to_person_type`
- `notes`

### ConceptRule

Regla versionada que sugiere o limita conceptos para una actividad.

- `rule_id`
- `activity_code`
- `concept_family`
- `allowed_clave_prod_serv[]`
- `suggested_clave_unidad[]`
- `default_objeto_imp`
- `default_tax_mode`
- `confidence`
- `severity`
- `human_review_required`
- `examples[]`

### TenantActivityLink

Vinculo entre tenant, perfil fiscal y actividad vigente.

- `activity_link_id`
- `tenant_id`
- `profile_id`
- `activity_code`
- `activity_name`
- `activity_source`
- `status`

### ConceptEligibilityResult

Resultado determinista usado antes de sugerir un concepto:

- `allowed`
- `suggested`
- `needs_review`
- `blocked`
- `reason_codes[]`
- `candidate_concepts[]`

## Semilla personal actual

El ejemplo local `data/fiscal-activity-rules.example.json` incluye:

- `TECH_CCTV_NETWORK_SERVICES`
- diagnostico tecnico CCTV/redes;
- instalacion y mantenimiento;
- configuracion de red;
- cableado estructurado;
- venta de equipo CCTV/redes cuando aplique.

Las claves SAT incluidas son sugerencias de prueba y requieren validacion humana
y catalogo SAT vigente antes de operar.

## Bloqueos base

La foundation mantiene fuera de alcance:

- software;
- apps moviles;
- web;
- SaaS;
- IA;
- n8n como servicio;
- marketing;
- diseno grafico;
- video;
- comida;
- plomeria;
- pintura;
- albanileria;
- construccion civil general;
- consultoria fiscal/legal/contable;
- renta de equipo.

## Relacion con providers

Estas reglas viven en SATBOT Core y son independientes del PAC. Factura.com,
Facturapi u otro adapter solo reciben documentos canonicos ya evaluados.

## Seguridad fiscal

- Todo resultado conserva `human_review_required=true`.
- El PAC/SAT siguen validando al timbrar.
- SATBOT hace prevalidacion y sugerencias.
- No se abre produccion fiscal real en esta fase.
