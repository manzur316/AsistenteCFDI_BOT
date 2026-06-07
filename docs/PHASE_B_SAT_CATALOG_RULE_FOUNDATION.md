# Fase B0-B3 - SAT Catalog and CFDI Rule Foundation

## Source Registry

`scripts/lib/sat-catalogs/sat-source-registry.js` registra fuentes oficiales
locales:

- nombre;
- ruta local original;
- SHA256;
- fecha de carga;
- version detectada;
- tipo de fuente;
- estado.

Estados:

- `LOCAL_ONLY`
- `IMPORTED`
- `DERIVED`
- `NEEDS_SOURCE`

## SAT Catalog Loader

`scripts/lib/sat-catalogs/sat-catalog-loader.js` detecta el workbook maestro SAT
sin copiarlo al repo. Soporta modo `INDEX_ONLY` y modo `IMPORTED` si existe un
lector compatible.

Hojas minimas:

- `c_FormaPago`
- `c_Moneda`
- `c_TipoDeComprobante`
- `c_Exportacion`
- `c_MetodoPago`
- `c_RegimenFiscal`
- `c_UsoCFDI`
- `c_ClaveProdServ`
- `c_ClaveUnidad`
- `c_ObjetoImp`
- `c_Impuesto`
- `c_TipoFactor`
- `c_TasaOCuota`
- `c_CodigoPostal_Parte_1`
- `c_CodigoPostal_Parte_2`

## SQL

`sql/010_sat_catalog_foundation.sql` agrega:

- `sat_catalog_sources`
- `sat_catalog_entries`

Los atributos variables viven en `jsonb`.

## Rule Registry

`scripts/lib/cfdi-rules/cfdi-rule-registry.js` contiene reglas iniciales
curadas manualmente con referencias al Anexo 20. No intenta parsear todo el PDF
en esta fase.

## Seguridad

- Las fuentes oficiales permanecen locales.
- No se versiona runtime.
- No se abre produccion.
- No sustituye contador.
- Siempre requiere revision humana.
