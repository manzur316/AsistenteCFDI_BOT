# SAT Official Catalog Input

Coloca aqui el catalogo oficial CFDI descargado directamente del SAT.

Archivos esperados:

- `catCFDI.xls`
- `catCFDI.xlsx`
- `catCFDI.csv`
- archivos oficiales separados que contengan `c_ClaveProdServ`, `c_ClaveUnidad`, `c_ObjetoImp`, `c_Impuesto`, `c_RegimenFiscal`, `c_UsoCFDI`, `c_TasaOCuota`, `c_MetodoPago`, `c_FormaPago`, `c_TipoDeComprobante` o `c_TipoFactor`

Tambien puedes analizar una carpeta externa sin copiar los archivos fuente:

```bash
node scripts/import-sat-catalog.js --source "C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD"
```

Reglas:

- No usar blogs.
- No usar catalogos de terceros como fuente oficial unica.
- No inventar claves SAT.
- El PDF Compact es referencia y debe cruzarse contra SAT oficial local.
- Si el archivo oficial no esta aqui, los scripts deben detener la propuesta con:

```text
Falta catalogo oficial SAT. Coloca el archivo oficial catCFDI del SAT en data/sat_official/ y vuelve a ejecutar.
```

Salida normalizada esperada al importar:

```text
data/sat_official/imported_sat_catalog.normalized.json
```

No versiones XLSX/PDF oficiales fuente. Solo se versiona el JSON normalizado derivado cuando pasa los contratos de seguridad. El catalogo final `data/concepts.normalized.json` no se modifica en esta fase.
