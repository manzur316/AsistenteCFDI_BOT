const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { runSandboxDocumentDeliveryDiagnose } = require("./lib/sandbox-document-delivery-action");
const { renderLocalCfdiPdfFromXml } = require("./lib/document-rendering/local-cfdi-pdf-renderer");

const root = path.resolve(__dirname, "..");
const temp = path.join(root, "runtime", "test-provider-email-blocked-provider-pdf-invalid");
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });
const xmlPath = path.join(temp, "cfdi.xml");
const pdfPath = path.join(temp, "cfdi-local.pdf");
const xml = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Emisor Rfc=\"AAA010101AAA\" Nombre=\"EMISOR\"/><cfdi:Receptor Rfc=\"BBB010101BBB\" Nombre=\"RECEPTOR\" UsoCFDI=\"G03\"/><cfdi:Conceptos><cfdi:Concepto ClaveProdServ=\"81111811\" Cantidad=\"1\" ClaveUnidad=\"E48\" Descripcion=\"Servicio\" ValorUnitario=\"1\" Importe=\"1\"/></cfdi:Conceptos><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\"/></cfdi:Complemento></cfdi:Comprobante>";
fs.writeFileSync(xmlPath, xml, "utf8");
const render = renderLocalCfdiPdfFromXml({ xmlPath, outputPath: pdfPath });
assert.strictEqual(render.ok, true);

const draft = {
  draft_id: "DRAFT-PROVIDER-BLOCK",
  client_id: "CLI-DEMO",
  current_client: {
    client_id: "CLI-DEMO",
    email: "cliente@example.com",
    email_confirmed: true,
    provider_email_sync_status: "SYNCED",
  },
  sandbox_pac_summary: {
    artifact_status: "DOWNLOADED",
    human_xml_path: path.relative(root, xmlPath).replace(/\\/g, "/"),
    human_pdf_path: path.relative(root, pdfPath).replace(/\\/g, "/"),
    pdf_source: "LOCAL_RENDERED_FROM_XML",
    provider_pdf_content_valid: false,
    pdf_content_valid: true,
    xml_content_valid: true,
  },
};

const result = runSandboxDocumentDeliveryDiagnose({ draft, channel: "PROVIDER_EMAIL", env: {} });
assert.strictEqual(result.status, "PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID");
assert.strictEqual(result.output.documents_valid, true);
assert.strictEqual(result.output.pdf_source, "LOCAL_RENDERED_FROM_XML");
assert.strictEqual(result.output.provider_email_ready, true);
assert.strictEqual(result.output.ready, false);
console.log("Provider Email Blocked When Provider PDF Invalid Tests");
console.log(" - provider_email_blocks_local_pdf_fallback: PASS (PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID)");
console.log("\nPASS total: 1/1");
