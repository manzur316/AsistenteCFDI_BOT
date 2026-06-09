const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDocumentDeliveryStatus } = require("./lib/sandbox-document-delivery-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-delivery-status-no-documents-valid-with-not-requested");
const exportDir = path.join(tempRoot, "exports");
fs.mkdirSync(exportDir, { recursive: true });

const xmlPath = path.join(exportDir, "cfdi.xml");
const pdfPath = path.join(exportDir, "cfdi.pdf");
fs.writeFileSync(xmlPath, "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000721\" /></cfdi:Complemento></cfdi:Comprobante>");
fs.writeFileSync(pdfPath, Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]));

const result = runSandboxDocumentDeliveryStatus({
  draft: {
    draft_id: "DRAFT-DELIVERY-CONSISTENCY-721",
    client_id: "CLI-REAL-BILBAO",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    current_client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      email: "cliente@example.com",
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
    },
    sandbox_pac_summary: {
      artifact_status: "NOT_REQUESTED",
      human_xml_path: path.relative(root, xmlPath).replace(/\\/g, "/"),
      human_pdf_path: path.relative(root, pdfPath).replace(/\\/g, "/"),
      pdf_source: "PROVIDER",
      provider_pdf_content_valid: true,
    },
  },
  env: {
    TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
    TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
    TELEGRAM_BOT_TOKEN: "TEST_TOKEN_NOT_REAL",
  },
  execFileSync: () => "[]\n",
});

assert.strictEqual(result.status, "OK");
assert.strictEqual(result.output.documents_valid, true);
assert.strictEqual(result.output.persisted_artifact_status, "NOT_REQUESTED");
assert.strictEqual(result.output.artifact_status, "DOWNLOADED");
assert.strictEqual(result.output.artifact_status_inferred_from_documents, true);
assert(result.warnings.includes("ARTIFACT_STATUS_INFERRED_FROM_VALID_DOCUMENTS"));

console.log("Sandbox Delivery Status Consistency Tests");
console.log(" - no_documents_valid_with_not_requested: PASS (DOWNLOADED)");
console.log("\nPASS total: 1/1");
