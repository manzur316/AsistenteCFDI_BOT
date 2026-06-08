const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { renderLocalCfdiPdfFromXml } = require("./lib/document-rendering/local-cfdi-pdf-renderer");

const root = path.resolve(__dirname, "..");
const temp = path.join(root, "runtime", "test-local-cfdi-pdf-renderer");
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });

const xml = `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="F" Folio="25" Fecha="2026-06-08T10:00:00" SubTotal="800.00" Total="928.00" MetodoPago="PUE" FormaPago="03" LugarExpedicion="77500">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR DEMO"/>
  <cfdi:Receptor Rfc="BBB010101BBB" Nombre="REAL BILBAO" UsoCFDI="G03"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="81111811" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio sandbox" ValorUnitario="800.00" Importe="800.00"/></cfdi:Conceptos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="00000000-0000-4000-8000-000000000716" FechaTimbrado="2026-06-08T10:01:00"/></cfdi:Complemento>
</cfdi:Comprobante>`;

const out = path.join(temp, "local.pdf");
const result = renderLocalCfdiPdfFromXml({ xmlBuffer: Buffer.from(xml), outputPath: out });
assert.strictEqual(result.ok, true);
assert.strictEqual(result.pdf_source, "LOCAL_RENDERED_FROM_XML");
assert(fs.existsSync(out));
assert.strictEqual(result.pdf_validation.ok, true);
assert.strictEqual(result.pdf_validation.pdf_text_present, true);
assert.strictEqual(result.pdf_validation.pdf_visual_content_present, true);
console.log("Local CFDI PDF Renderer Tests");
console.log(" - local_pdf_visible_from_xml: PASS (LOCAL_RENDERED_FROM_XML)");
console.log("\nPASS total: 1/1");
