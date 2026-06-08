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
- reportar solo metadata segura: `status`, `size_bytes`, `sha256` y banderas.

No se imprime XML completo, RFC, UUID completo ni rutas absolutas en Telegram.

## Reglas PDF

El PDF sandbox debe:

- no estar vacio;
- no ser placeholder (`CFDI PDF`, texto generico);
- iniciar con `%PDF`;
- contener `%%EOF`;
- cumplir tamano minimo configurable, default 1024 bytes;
- reportar solo metadata segura.

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
