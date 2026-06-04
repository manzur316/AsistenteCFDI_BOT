# CFDI 4.0 - Analisis c_UsoCFDI

Fuentes oficiales usadas:
- Guia: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/Anexo_20_Guia_de_llenado_CFDI .pdf`
- Catalogo maestro: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/catCFDI_V_4_20260603.xls`
- Catalogo activo personal: `data/concepts.normalized.json`

Nota de alcance: estos documentos son conocimiento operativo para validacion y captura manual. No autorizan timbrado, PAC ni automatizacion fiscal final.

## Usos compatibles con receptor 626

| Clave | Descripcion |
| --- | --- |
| G01 | Adquisición de mercancías. |
| G02 | Devoluciones, descuentos o bonificaciones. |
| G03 | Gastos en general. |
| I01 | Construcciones. |
| I02 | Mobiliario y equipo de oficina por inversiones. |
| I03 | Equipo de transporte. |
| I04 | Equipo de computo y accesorios. |
| I05 | Dados, troqueles, moldes, matrices y herramental. |
| I06 | Comunicaciones telefónicas. |
| I07 | Comunicaciones satelitales. |
| I08 | Otra maquinaria y equipo. |
| S01 | Sin efectos fiscales. |
| CP01 | Pagos |

## Regla para n8n

UsoCFDI se debe validar contra RegimenFiscalReceptor. La sugerencia de concepto no basta para capturar factura completa.
