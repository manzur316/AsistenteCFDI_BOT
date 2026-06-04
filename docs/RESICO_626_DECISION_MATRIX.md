# RESICO 626 - Matriz de decision

Fuentes oficiales usadas:
- Guia: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/Anexo_20_Guia_de_llenado_CFDI .pdf`
- Catalogo maestro: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/catCFDI_V_4_20260603.xls`
- Catalogo activo personal: `data/concepts.normalized.json`

Nota de alcance: estos documentos son conocimiento operativo para validacion y captura manual. No autorizan timbrado, PAC ni automatizacion fiscal final.

| Decision | Condicion | Resultado |
| --- | --- | --- |
| Permitir sugerencia | Concepto activo resico_626_ok/current_activity_ok y claves SAT validadas | SUGERIR con revision humana |
| Pedir aclaracion | Mensaje generico o equipo/sistema no identificado | PEDIR_ACLARACION sin concepto listo |
| Bloquear/agregar actividad | Software, apps, IA, web, SaaS o automatizacion digital no permitida por base | BLOQUEAR o AGREGAR_ACTIVIDAD |
| No timbrar | Cualquier caso | Captura manual SAT/PAC externo bajo criterio humano |

## Regimen 626 en catalogo maestro

{
  "source_sheet": "c_RegimenFiscal",
  "source_row": 25,
  "clave": "626",
  "descripcion": "Régimen Simplificado de Confianza",
  "persona_fisica": "Sí",
  "persona_moral": "Sí",
  "fecha_inicio_vigencia": "01/01/2022 00:00:00",
  "fecha_fin_vigencia": ""
}
