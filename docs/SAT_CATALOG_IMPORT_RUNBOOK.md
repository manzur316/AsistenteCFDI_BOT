# SAT Catalog Import Runbook

## Ruta local esperada

```text
C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL
```

Archivos esperados:

- `catCFDI_V_4_20260603.xls`
- `Anexo_20_Guia_de_llenado_CFDI .pdf`

## Registrar fuentes

```powershell
node scripts/test-sat-source-registry.js
```

El source registry calcula SHA256, version detectada y estado. Si la ruta no
existe devuelve `NEEDS_SOURCE` sin fallar destructivamente.

## Indexar catalogo SAT

```powershell
node scripts/import-sat-catalogs.js
```

Salida local por default:

```text
runtime/sat-catalog-import/sat-catalog-index.json
```

Este archivo no debe versionarse. El comando no copia el XLS/PDF oficial al
repo.

## Importacion completa opcional

El loader soporta lectura completa si existe un lector compatible `xlsx` en el
entorno Node. En ausencia de ese lector, opera en modo `INDEX_ONLY` con:

- firma del workbook;
- hash de fuente;
- hojas detectadas por escaneo binario;
- contrato de tablas destino.

## Tablas destino

Ver `sql/010_sat_catalog_foundation.sql`:

- `sat_catalog_sources`
- `sat_catalog_entries`

Para catalogos grandes, la importacion completa futura debe hacerse por lotes y
guardar atributos variables en `jsonb`.

## Seguridad

- No versionar fuentes SAT pesadas.
- No modificar fuentes originales.
- No usar los catalogos para abrir produccion fiscal real.
- SATBOT pre-valida y sugiere; el PAC/SAT siguen validando al timbrar.
- Todo queda sujeto a revision humana.
