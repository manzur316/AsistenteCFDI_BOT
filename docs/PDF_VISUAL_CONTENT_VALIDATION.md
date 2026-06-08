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
- `pdf_render_check_required`
- `pdf_structural_only`

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
- `PDF_RENDER_CHECK_REQUIRED`
- `PDF_RENDER_BLANK_PAGE`
- `PDF_RENDER_FAILED`
- `PDF_PROVIDER_BLANK_OR_CORRUPT`
- `PDF_STRUCTURAL_ONLY`

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
- graficos: operadores de trazado/pintado como `m`, `l`, `re`, `S`, `f`
- imagenes: XObject/Image se reporta, pero no valida visibilidad por si solo
- streams `/FlateDecode`: se intenta descomprimir con `zlib`

Desde la fase 7.16K el parser:

- extrae todos los bloques `stream`/`endstream`;
- limpia CR/LF al inicio y fin del stream;
- detecta `/FlateDecode`, `/Filter /FlateDecode` y `/Filter [/FlateDecode]`;
- intenta `zlib.inflateSync` y `zlib.inflateRawSync`;
- registra errores por stream como warning seguro;
- distingue `PDF_VISUAL_CONTENT_MISSING` de
  `PDF_VISUAL_CONTENT_UNCERTAIN`.

Desde 7.16L, un XObject/Image tampoco basta aunque aparezca usado con `Do`.
Si no hay texto ni graficos y solo hay XObject/Image, el PDF queda como
`PDF_RENDER_CHECK_REQUIRED` y no como `VALID`, salvo que un render-check real
confirme contenido visible.

## Render Check 7.16L

`sandbox.documents.pdf.diagnose --render-check --debug-render` intenta renderizar
la primera pagina cuando existe una herramienta local disponible, empezando por
`pdftoppm`. El render se guarda solo en `runtime/pdf-render-diagnostics/`.

Si no hay renderer local, el diagnostico devuelve:

```json
{
  "render_check_requested": true,
  "render_check_available": false,
  "render_status": "UNAVAILABLE"
}
```

En ese caso el sistema no inventa un resultado visual positivo. Si el PDF solo
tiene XObject/Image, queda bloqueado o se usa fallback local desde XML validado.

## Diagnostico 7.16K/7.16L

Accion no destructiva:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.pdf.diagnose --db-exec-mode docker --draft-id DRAFT-...
```

Tambien permite refs directas:

```powershell
node scripts/run-sandbox-action.js sandbox.documents.pdf.diagnose --cfdi-uid ... --pac-invoice-id ... --uuid ...
```

El diagnostico prueba `cfdi_uid`, `pac_invoice_id` y `uuid` sin guardar PDF como
documento final. La salida muestra metadata segura: tipo de referencia, tamano,
hash, magic/eof, paginas, streams, validacion visual, retryable y una hipotesis
de causa raiz. No imprime PDF completo, XML completo, UUID/UID completos,
credenciales ni rutas absolutas.

Si el proveedor responde que el PDF aun no esta listo, el adapter puede usar
retry acotado:

```text
FACTURACOM_SANDBOX_PDF_RETRY_COUNT=3
FACTURACOM_SANDBOX_PDF_RETRY_DELAY_MS=1500
```

Cuando el PDF sigue pendiente, el estado seguro es
`PDF_NOT_READY_RETRYABLE`. Cuando el PDF es estructural pero blanco/no visual,
queda bloqueado como `PDF_VISUAL_CONTENT_MISSING` o
`PDF_VISUAL_CONTENT_UNCERTAIN`.

## Seguridad

La validacion reporta metadata segura: estado, banderas, `size_bytes`, `sha256`
y warnings. No imprime XML/PDF completo, RFC, UUID completo, UID completo, rutas
absolutas, CSD, `.env` ni credenciales.

Todo sigue siendo sandbox. No habilita produccion ni timbrado fiscal real.
