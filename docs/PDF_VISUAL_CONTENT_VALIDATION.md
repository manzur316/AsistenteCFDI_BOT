# PDF Visual Content Validation

## Objetivo

La validacion PDF sandbox ya no acepta un archivo solo porque tenga `%PDF`,
`%%EOF` y tamano suficiente. Un PDF puede ser tecnicamente parseable y abrirse
en blanco; para delivery documental debe tener contenido visual probable.

Modulo:

```text
scripts/lib/sandbox-artifact-content-validator.js
```

## Senales Validadas

`validateSandboxPdfArtifact(buffer, context)` devuelve:

- `pdf_magic_present`
- `pdf_eof_present`
- `pdf_page_count_estimate`
- `pdf_content_streams_present`
- `pdf_visual_content_present`
- `pdf_text_present`
- `pdf_graphics_present`
- `pdf_image_xobject_present`

Estados principales:

- `VALID`
- `INVALID_PLACEHOLDER`
- `INVALID_EMPTY`
- `PDF_MAGIC_MISSING`
- `PDF_TOO_SMALL`
- `PDF_EOF_MISSING`
- `PDF_PAGE_TREE_MISSING`
- `PDF_CONTENT_STREAMS_MISSING`
- `PDF_VISUAL_CONTENT_MISSING`
- `PDF_VISUAL_CONTENT_UNCERTAIN`

## Regla Operativa

Si `pdf_visual_content_present !== true`, entonces:

- `pdf_content_valid=false`
- `pdf_downloaded=false`
- no se escribe `cfdi.pdf` final desde el adapter
- no se copia al storage por cliente
- no se crea alias humano PDF
- no se permite delivery documental

## Heuristica Sin Herramientas Externas

No se usa OCR, Poppler ni binarios externos. El validador busca contenido visual
probable dentro de streams PDF:

- texto: `BT`, `ET`, `Tj`, `TJ`, `Tf`
- graficos: `m`, `l`, `re`, `S`, `f`, `cm`
- imagenes: uso de XObject con `Do`
- streams `/FlateDecode`: se intenta descomprimir con `zlib`

Un XObject declarado en recursos no basta; debe aparecer usado en un stream de
pagina. Esto evita aceptar paginas blancas con recursos no dibujados.

## Seguridad

La validacion reporta metadata segura: estado, banderas, `size_bytes`, `sha256`
y warnings. No imprime XML/PDF completo, RFC, UUID completo, UID completo, rutas
absolutas, CSD, `.env` ni credenciales.

Todo sigue siendo sandbox. No habilita produccion ni timbrado fiscal real.
