# CFDI 4.0 Rule Engine Architecture

## Objetivo

Crear una capa determinista de prevalidacion CFDI 4.0 antes de enviar un
documento canonico a cualquier provider. Esta capa es advisory por default y no
sustituye al contador, SAT ni PAC.

## Fuente

- Catalogo maestro SAT: `catCFDI_V_4_20260603.xls`
- Guia: `Anexo_20_Guia_de_llenado_CFDI .pdf`
- Ruta local esperada: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL`

Los archivos fuente oficiales permanecen locales. No se versionan en el repo.

## Capas

```text
CanonicalInvoiceDraft / CanonicalInvoiceDocument
  -> CFDI_40_CORE rule registry
  -> deterministic evaluator
  -> blockers / warnings / suggestions
  -> human review required
```

## Reglas iniciales

La foundation incluye reglas curadas manualmente:

- `CFDI40_PAYMENT_PPD_REQUIRES_FORMA99`
- `CFDI40_PAYMENT_PUE_REQUIRES_ACTUAL_PAYMENT_METHOD`
- `CFDI40_RECEPTOR_USO_CFDI_MATCHES_REGIMEN`
- `CFDI40_OBJETOIMP_02_REQUIRES_CONCEPT_TAXES`
- `CFDI40_OBJETOIMP_01_03_NO_CONCEPT_TAX_BREAKDOWN`
- `CFDI40_CLAVEPRODSERV_MUST_EXIST_OR_EXTREME_FALLBACK`
- `CFDI40_TASAOCUOTA_SIX_DECIMALS`
- `CFDI40_NO_NEGATIVE_NUMBERS`
- `CFDI40_ROUND_AT_TOTALS`
- `CFDI40_TIPO_COMPROBANTE_P_NO_PAYMENT_FIELDS`
- `CFDI40_TIPO_COMPROBANTE_T_NO_PAYMENT_FIELDS`
- `CFDI40_FOREIGN_GENERIC_RECEPTOR_RULE`

Cada regla declara fuente, condicion, resultado esperado, severidad, mensajes
humanos y `provider_independent=true`.

## Salida

```json
{
  "ok": true,
  "blockers": [],
  "warnings": [],
  "suggestions": [],
  "evaluated_rules": [],
  "requires_human_review": true
}
```

El engine no muta el draft. Solo devuelve diagnostico.

## Modo advisory

En Fase B, el engine prepara la base. Solo reglas obvias y seguras pueden ser
tratadas como blocker por herramientas futuras. Actividad/concepto se mantiene
como warning/suggestion hasta aprobacion humana.
