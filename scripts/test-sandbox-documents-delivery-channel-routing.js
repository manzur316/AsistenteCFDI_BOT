const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDocumentDeliveryDiagnose } = require("./lib/sandbox-document-delivery-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-documents-delivery-channel-routing");
const checks = [];
let counter = 0;

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

function files() {
  counter += 1;
  const dir = path.join(tempRoot, `case-${counter}`);
  fs.mkdirSync(dir, { recursive: true });
  const xml = path.join(dir, "cfdi.xml");
  const pdf = path.join(dir, "cfdi.pdf");
  fs.writeFileSync(xml, "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\" /></cfdi:Complemento></cfdi:Comprobante>");
  fs.writeFileSync(pdf, Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n", "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]));
  return {
    xml: path.relative(root, xml).replace(/\\/g, "/"),
    pdf: path.relative(root, pdf).replace(/\\/g, "/"),
  };
}

function draft(email = "cliente.real@example.com") {
  const f = files();
  return {
    draft_id: "DRAFT-CHANNEL-ROUTING",
    client_id: "CLI-REAL-BILBAO",
    current_client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      email,
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
    },
    sandbox_pac_summary: {
      artifact_status: "DOWNLOADED",
      human_xml_path: f.xml,
      human_pdf_path: f.pdf,
    },
  };
}

check("provider_email_diagnose_does_not_return_telegram_config", () => {
  const result = runSandboxDocumentDeliveryDiagnose({
    draft: draft(),
    channel: "PROVIDER_EMAIL",
    env: {},
  });
  assert.strictEqual(result.output.channel, "PROVIDER_EMAIL");
  assert.strictEqual(result.output.provider_email_delivery_supported, true);
  assert.strictEqual(result.output.telegram_delivery_ready, null);
  assert(!JSON.stringify(result).includes("TELEGRAM_DOCUMENT_DELIVERY_NEEDS_CONFIG"));
  return result.status;
});

check("telegram_channel_diagnoses_telegram_config", () => {
  const result = runSandboxDocumentDeliveryDiagnose({
    draft: draft(),
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    env: {},
  });
  assert.strictEqual(result.output.channel, "TELEGRAM_DOCUMENT_CHANNEL");
  assert.strictEqual(result.output.telegram_delivery_ready, false);
  assert(result.warnings.includes("TELEGRAM_DOCUMENT_DELIVERY_DISABLED_OR_INCOMPLETE"));
  return result.output.channel;
});

check("unknown_channel_returns_stable_error", () => {
  const result = runSandboxDocumentDeliveryDiagnose({ draft: draft(), channel: "BAD_CHANNEL" });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("DOCUMENT_DELIVERY_CHANNEL_UNKNOWN"));
  return result.output.error_class;
});

console.log("Sandbox Documents Delivery Channel Routing Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
