# Sandbox XML/PDF Content Validation

## Objetivo

Validar que las descargas de Factura.com Sandbox parezcan artefactos reales de
CFDI antes de marcarlas como descargadas o copiarlas a storage por cliente.

Esta capa corrige el caso donde el proveedor o un mock devuelve texto no vacio
como `CFDI XML` o `CFDI PDF`. Un cuerpo no vacio ya no es suficiente.

## Contrato

Modulo:

```text
scripts/lib/sandbox-artifact-content-validator.js
```

Funciones:

```text
validateSandboxXmlArtifact(bufferOrText, context)
validateSandboxPdfArtifact(buffer, context)
validateSandboxArtifactContent({ kind, buffer, contentType, fileName, expectedIdentity })
```

## Reglas XML

El XML sandbox debe:

- no estar vacio;
- no ser placeholder (`CFDI XML`, JSON success, texto generico);
- contener `Comprobante` CFDI con namespace CFDI o `Version="4.0"`;
- contener `TimbreFiscalDigital`;
- contener UUID;
- no contener marcadores de redaccion como `[REDACTED_RFC]`;
- reportar solo metadata segura: `status`, `size_bytes`, `sha256` y banderas.

El XML final guardado como documento debe ser raw CFDI del proveedor. Las
redacciones se permiten en logs, manifests y diagnosticos, pero si aparecen en
`cfdi.xml` o en el alias humano el estado es
`XML_SANITIZED_ARTIFACT_INVALID`. No se imprime XML completo, RFC, UUID completo
ni rutas absolutas en Telegram.

## Reglas PDF

El PDF sandbox debe:

- no estar vacio;
- no ser placeholder (`CFDI PDF`, texto generico);
- iniciar con `%PDF`;
- contener `%%EOF`;
- cumplir tamano minimo configurable, default 1024 bytes;
- contener pagina y streams de contenido;
- contener contenido visual probable: texto o graficos detectables, o render
  positivo;
- reportar `pdf_visual_content_present`, `pdf_page_count_estimate`,
  `pdf_text_present`, `pdf_graphics_present` y
  `pdf_image_xobject_present`;
- reportar solo metadata segura.

Desde 7.16L, imagen/XObject por si solo no valida visibilidad. Si no hay texto
ni graficos, el PDF queda como `PDF_RENDER_CHECK_REQUIRED` salvo que un
render-check real confirme contenido visible.

Un PDF estructuralmente valido pero visualmente blanco se rechaza con
`PDF_VISUAL_CONTENT_MISSING`. Ver:

```text
docs/PDF_VISUAL_CONTENT_VALIDATION.md
```

## Integracion con adapter

`FacturaComSandboxAdapter.downloadXml/downloadPdf` valida el contenido antes de
escribir `cfdi.xml` o `cfdi.pdf`.

Si el contenido es invalido:

- no escribe el artefacto final;
- devuelve `PAC_SANDBOX_ERROR`;
- agrega `FACTURACOM_SANDBOX_XML_CONTENT_INVALID` o
  `FACTURACOM_SANDBOX_PDF_CONTENT_INVALID`;
- guarda solo un diagnostico JSON seguro dentro de `runtime/` si hay
  `storageDir`;
- mantiene `xml_downloaded=false` o `pdf_downloaded=false`.

## Integracion con Action Layer

`sandbox.draft.download-artifacts` propaga:

- `xml_content_valid`
- `pdf_content_valid`
- `xml_validation_status`
- `pdf_validation_status`
- `download_content_validation`

Solo copia a storage por cliente/factura si el artefacto fue descargado y
validado. Placeholders o respuestas incompletas quedan como `DOWNLOAD_ERROR` o
`PARTIAL_DOWNLOAD`.

Si el XML raw es valido y el provider PDF no es usable, 7.16L permite generar
un PDF visual local sandbox desde XML con `pdf_source=LOCAL_RENDERED_FROM_XML`.
Ese fallback no marca el provider PDF como valido.

Si XML es valido y PDF es visualmente invalido, se permite conservar el XML como
descarga parcial, pero no se copia el PDF ni se crea alias humano PDF.

Cuando ambos son validos, se mantienen nombres internos:

```text
xml/cfdi.xml
pdf/cfdi.pdf
```

y se crean aliases humanos seguros bajo `exports/`, por ejemplo:

```text
exports/Real-Bilbao_2026-06-08_F-24_SANDBOX.xml
exports/Real-Bilbao_2026-06-08_F-24_SANDBOX.pdf
```

El manifest registra `human_xml_path`, `human_pdf_path` y
`human_file_base_name` solo para archivos validos.

## Telegram

Si Factura.com Sandbox responde con contenido invalido, Telegram muestra resumen
humano:

```text
Descarga sandbox no valida
Factura.com Sandbox respondio, pero el archivo recibido no parece ser un XML/PDF CFDI valido.
XML valido: no
PDF valido: no
Storage local: no actualizado
No se enviaron documentos.
Borrador sujeto a revision humana. No sustituye contador.
```

No se muestran errores crudos si hay explicacion humana clara. Errores tecnicos
desconocidos pueden aparecer como `Detalle tecnico: CODIGO_SEGURO`.

## Fuera De Alcance

- Produccion.
- Timbrado fiscal real.
- Entrega automatica de documentos por Telegram.
- Cambios a `data/concepts.normalized.json`.
- Guardar XML/PDF en Git.
