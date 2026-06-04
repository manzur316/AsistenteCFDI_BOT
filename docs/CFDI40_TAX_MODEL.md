# CFDI 4.0 - Modelo de impuestos

Fuentes oficiales usadas:
- Guia: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/Anexo_20_Guia_de_llenado_CFDI .pdf`
- Catalogo maestro: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/catCFDI_V_4_20260603.xls`
- Catalogo activo personal: `data/concepts.normalized.json`

Nota de alcance: estos documentos son conocimiento operativo para validacion y captura manual. No autorizan timbrado, PAC ni automatizacion fiscal final.

## Objeto de impuesto

| Clave | Descripcion |
| --- | --- |
| 01 | No objeto de impuesto. |
| 02 | Sí objeto de impuesto. |
| 03 | Sí objeto del impuesto y no obligado al desglose. |
| 04 | Sí objeto del impuesto y no causa impuesto. |
| 05 | Sí objeto del impuesto, IVA crédito PODEBI. |
| 06 | Sí objeto del IVA, No traslado IVA. |
| 07 | No traslado del IVA, Sí desglose IEPS. |
| 08 | No traslado del IVA, No desglose IEPS. |

## Impuestos

| Clave | Descripcion | Retencion | Traslado |
| --- | --- | --- | --- |
| 001 | ISR | Si | No |
| 002 | IVA | Si | Si |
| 003 | IEPS | Si | Si |

## Tasas o cuotas vigentes relevantes

| Rango/Fijo | Min | Max | Impuesto | Factor | Traslado | Retencion |
| --- | --- | --- | --- | --- | --- | --- |
| Fijo |  | 0 | IVA | Tasa | Sí | No |
| Fijo |  | 0.16 | IVA | Tasa | Sí | No |
| Rango | 0 | 0.16 | IVA | Tasa | No | Sí |
| Fijo |  | 0.08 | IVA Crédito aplicado del 50% | Tasa | Sí | No |
| Fijo |  | 0.265 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.3 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.53 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.5 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 1.6 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.304 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.25 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.09 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.08 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.07 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.06 | IEPS | Tasa | Sí | Sí |
| Fijo |  | 0.03 | IEPS | Tasa | Sí | No |
| Fijo |  | 0 | IEPS | Tasa | Sí | No |
| Rango | 0 | 72.1605 | IEPS | Cuota | Sí | Sí |
| Rango | 0 | 0.35 | ISR | Tasa | No | Sí |

## Decision

- ObjetoImp 02 exige desglose fiscal antes de timbrado; este proyecto solo sugiere.
- IVA traslado se modela como referencia desde catalogo activo y catalogo maestro.
- Retenciones RESICO no se automatizan en el MVP.
