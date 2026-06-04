# CFDI 4.0 - Mapa del catalogo maestro SAT

Fuentes oficiales usadas:
- Guia: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/Anexo_20_Guia_de_llenado_CFDI .pdf`
- Catalogo maestro: `C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/catCFDI_V_4_20260603.xls`
- Catalogo activo personal: `data/concepts.normalized.json`

Nota de alcance: estos documentos son conocimiento operativo para validacion y captura manual. No autorizan timbrado, PAC ni automatizacion fiscal final.

## Hojas detectadas

| Hoja | Filas visibles | Clasificacion |
| --- | --- | --- |
| c_Aduana | 55 | SECUNDARIO |
| c_ClaveProdServ | 52518 | CRITICO_CONCEPTO_IMPUESTO |
| c_ClaveUnidad | 2423 | CRITICO_CONCEPTO_IMPUESTO |
| c_CodigoPostal_Parte_1 | 60094 | GEOGRAFICO |
| c_CodigoPostal_Parte_2 | 35680 | GEOGRAFICO |
| C_Colonia_1 | 60105 | GEOGRAFICO |
| C_Colonia_2 | 60105 | GEOGRAFICO |
| C_Colonia_3 | 25171 | GEOGRAFICO |
| c_Estado | 101 | GEOGRAFICO |
| c_Exportacion | 23 | SECUNDARIO |
| c_FormaPago | 36 | CRITICO_LLENADO |
| c_Impuesto | 8 | CRITICO_CONCEPTO_IMPUESTO |
| C_Localidad | 669 | SECUNDARIO |
| c_Meses | 23 | SECUNDARIO |
| c_MetodoPago | 7 | CRITICO_LLENADO |
| c_Moneda | 188 | SECUNDARIO |
| C_Municipio | 2483 | GEOGRAFICO |
| c_NumPedimentoAduana | 59044 | SECUNDARIO |
| c_ObjetoImp | 23 | CRITICO_CONCEPTO_IMPUESTO |
| c_Pais | 257 | GEOGRAFICO |
| c_PatenteAduanal | 3408 | SECUNDARIO |
| c_Periodicidad | 10 | SECUNDARIO |
| c_RegimenFiscal | 25 | CRITICO_LLENADO |
| c_TasaOCuota | 26 | CRITICO_CONCEPTO_IMPUESTO |
| c_TipoDeComprobante | 11 | CRITICO_LLENADO |
| c_TipoFactor | 8 | CRITICO_LLENADO |
| c_TipoRelacion | 12 | SECUNDARIO |
| c_UsoCFDI | 124 | CRITICO_LLENADO |

## Hojas criticas para este MVP

- c_ClaveProdServ: valida que una clave SAT exista y este vigente.
- c_ClaveUnidad: valida unidad de servicio/producto.
- c_ObjetoImp, c_Impuesto, c_TasaOCuota, c_TipoFactor: validan modelo de impuestos.
- c_RegimenFiscal y c_UsoCFDI: validan receptor/regimen/uso.
- c_FormaPago, c_MetodoPago, c_TipoDeComprobante: validan llenado general.
