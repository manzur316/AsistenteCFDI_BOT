const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  runSandboxDocumentDeliveryConfirm,
} = require("./lib/sandbox-document-delivery-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-documents-delivery-confirm-action");
if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });

const VALID_XML = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000717\" /></cfdi:Complemento></cfdi:Comprobante>";
const VALID_PDF = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);
const dir = path.join(tempRoot, "exports");
fs.mkdirSync(dir, { recursive: true });
const xml = path.join(dir, "cfdi.xml");
const pdf = path.join(dir, "cfdi.pdf");
fs.writeFileSync(xml, VALID_XML);
fs.writeFileSync(pdf, VALID_PDF);

const result = runSandboxDocumentDeliveryConfirm({
  draft: {
    draft_id: "DRAFT-DELIVERY-CONFIRM-717",
    client_id: "CLI-REAL-BILBAO",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    total: 928,
    current_client: {
      display_name: "Real Bilbao",
      email: "cliente@example.com",
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
    },
    sandbox_pac_summary: {
      artifact_status: "DOWNLOADED",
      human_xml_path: path.relative(root, xml).replace(/\\/g, "/"),
      human_pdf_path: path.relative(root, pdf).replace(/\\/g, "/"),
      pdf_source: "PROVIDER",
      provider_pdf_content_valid: true,
    },
  },
  channel: "TELEGRAM_DOCUMENT_CHANNEL",
  env: {
    TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
    TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
    TELEGRAM_BOT_TOKEN: "TEST_TOKEN_NOT_REAL",
  },
  execFileSync: (_command, args) => {
    if (args.join(" ").includes("delivery_status = 'SENT'")) return "\n";
    return JSON.stringify({ delivery_id: "DELIV-CONFIRM", delivery_status: "READY" }) + "\n";
  },
});

assert.strictEqual(result.status, "READY");
assert.strictEqual(result.output.confirmed, true);
assert.strictEqual(result.output.send_action, "sandbox.documents.delivery.send");
assert(!JSON.stringify(result).includes("TEST_TOKEN_NOT_REAL"));
assert(!JSON.stringify(result).includes("123456789"));

console.log("Sandbox Documents Delivery Confirm Action Tests");
console.log(" - confirm_generates_send_action_without_sending: PASS (READY)");
console.log("\nPASS total: 1/1");
