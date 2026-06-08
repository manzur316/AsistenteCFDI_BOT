const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { runSandboxDocumentDeliveryDiagnose } = require("./lib/sandbox-document-delivery-action");
const { renderLocalCfdiPdfFromXml } = require("./lib/document-rendering/local-cfdi-pdf-renderer");

const root = path.resolve(__dirname, "..");
const temp = path.join(root, "runtime", "test-telegram-delivery-local-rendered-pdf");
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });
const xmlPath = path.join(temp, "cfdi.xml");
const pdfPath = path.join(temp, "cfdi-local.pdf");
const xml = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Emisor Rfc=\"AAA010101AAA\" Nombre=\"EMISOR\"/><cfdi:Receptor Rfc=\"BBB010101BBB\" Nombre=\"RECEPTOR\" UsoCFDI=\"G03\"/><cfdi:Conceptos><cfdi:Concepto ClaveProdServ=\"81111811\" Cantidad=\"1\" ClaveUnidad=\"E48\" Descripcion=\"Servicio\" ValorUnitario=\"1\" Importe=\"1\"/></cfdi:Conceptos><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\"/></cfdi:Complemento></cfdi:Comprobante>";
fs.writeFileSync(xmlPath, xml, "utf8");
assert.strictEqual(renderLocalCfdiPdfFromXml({ xmlPath, outputPath: pdfPath }).ok, true);

const draft = {
  draft_id: "DRAFT-TELEGRAM-LOCAL-PDF",
  client_id: "CLI-DEMO",
  current_client: { client_id: "CLI-DEMO" },
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

const result = runSandboxDocumentDeliveryDiagnose({
  draft,
  channel: "TELEGRAM_DOCUMENT_CHANNEL",
  env: {
    TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
    TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
    TELEGRAM_BOT_TOKEN: "123456:TESTTOKEN",
  },
});
assert.strictEqual(result.status, "OK");
assert.strictEqual(result.output.ready, true);
assert.strictEqual(result.output.telegram_can_send_local_rendered_pdf, true);
console.log("Telegram Delivery Allows Local Rendered PDF Tests");
console.log(" - telegram_can_use_local_rendered_pdf: PASS (OK)");
console.log("\nPASS total: 1/1");
