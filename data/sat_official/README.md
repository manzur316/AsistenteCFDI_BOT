# SAT Official Catalog Input

Coloca aqui el catalogo oficial CFDI descargado directamente del SAT.

Archivos esperados:

- `catCFDI.xls`
- `catCFDI.xlsx`
- `catCFDI.csv`
- archivos oficiales separados que contengan `c_ClaveProdServ` o `c_ClaveUnidad`

Reglas:

- No usar blogs.
- No usar catalogos de terceros.
- No inventar claves SAT.
- Si el archivo oficial no esta aqui, los scripts deben detener la propuesta con:

```text
Falta catálogo oficial SAT. Coloca el archivo oficial catCFDI del SAT en data/sat_official/ y vuelve a ejecutar.
```

Salida normalizada esperada al importar:

```text
data/sat_official/imported_sat_catalog.normalized.json
```

Ese archivo derivado puede regenerarse; el catalogo final `data/concepts.normalized.json` no se modifica en esta fase.
