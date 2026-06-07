# Fase B - Tenant Fiscal Profile + Activity Rules

## Alcance

Fase B prepara SATBOT Core para operar por tenant/emisor, regimen fiscal,
actividad economica y reglas CFDI 4.0 versionadas. No implementa produccion, no
timbrado real y no modifica el catalogo activo personal.

## Componentes

- Source Registry SAT: `scripts/lib/sat-catalogs/sat-source-registry.js`
- Catalog Loader/Normalizer: `scripts/lib/sat-catalogs/`
- SQL catalogos: `sql/010_sat_catalog_foundation.sql`
- CFDI 4.0 Rule Registry/Engine: `scripts/lib/cfdi-rules/`
- Tenant Fiscal Profile foundation: `sql/011_tenant_fiscal_profile_rules.sql`
- Fiscal Activity Rules: `scripts/lib/fiscal-activities/`
- Diagnostico Action Layer: `sandbox.cfdi.rules.diagnose`

## Fuentes oficiales

Ruta local:

```text
C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL
```

Archivos:

- `catCFDI_V_4_20260603.xls`
- `Anexo_20_Guia_de_llenado_CFDI .pdf`

Los archivos fuente no se copian al repo.

## Tenant Fiscal Profile

Cada tenant/emisor podra configurar:

- regimen fiscal;
- tipo de persona;
- actividades fiscales;
- defaults de CFDI;
- politica de pago/impuestos;
- proveedor PAC/API;
- revision humana obligatoria.

`TENANT_PERSONAL_DEFAULT` se mantiene como tenant semilla sin romper la operacion
actual.

## Rule Engine CFDI 4.0

El engine evalua drafts/documentos canonicos y devuelve:

- blockers;
- warnings;
- suggestions;
- reglas evaluadas;
- `requires_human_review=true`.

No muta el draft.

## Fiscal Activity Rules

Una actividad fiscal habilita o sugiere grupos de conceptos. La semilla actual
cubre servicios tecnicos CCTV/redes/videovigilancia como ejemplo no productivo.

## Criterio de salida

- Foundation de catalogos SAT CFDI 4.0 creada.
- Foundation de reglas CFDI 4.0 creada.
- Foundation de Tenant Fiscal Profile creada.
- Foundation de Fiscal Activity Rules creada.
- Rule engine advisory creado.
- Tests agregados.
- Factura.com Sandbox actual no se rompe.
- `data/concepts.normalized.json` no se modifica.
- Produccion real sigue bloqueada.

## No-go

- No sustituye contador.
- No abre PAC productivo.
- No timbra real.
- No envia XML/PDF por Telegram.
- No modifica fuentes SAT originales.
